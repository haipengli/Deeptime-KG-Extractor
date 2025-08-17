
import React, { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import type { Triple, Schema, LLMProvider, ExtractedEntity, ExtractionStep, SchemaSuggestion, DocumentSection, TurboOutput, ProcessingStats } from './types';
import { View } from './types';
import { extractEntities, extractRelationships, suggestRelationships, extractInTurboMode } from './services/extractionService';
import { parsePdfToSections } from './services/pdfParsingService';
import Header from './components/Header';
import TripleCard from './components/TripleCard';
import SchemaViewer from './components/SchemaViewer';
import EntityList from './components/EntityList';
import FileList from './components/FileList';
import SuggestionReviewer from './components/SuggestionReviewer';
import StatisticsDisplay from './components/StatisticsDisplay';
import GraphViewer from './components/GraphViewer';
import { BrainCircuitIcon, SchemaIcon, LoaderIcon, CopyIcon, CheckIcon, AlertTriangleIcon, UploadCloudIcon, DownloadIcon, DatabaseIcon, InfoIcon, StopIcon, SparklesIcon, ChevronDownIcon, KeyIcon, ServerIcon, PlusIcon, TrashIcon, LayoutListIcon, ShareIcon } from './components/icons';
import { DEFAULT_SCHEMA } from './constants';

interface ManagedFile {
    name: string;
    file: File;
    sections: DocumentSection[];
    status: { step: ExtractionStep; message?: string };
    textHash?: string;
}

interface CachedResult {
  entities: Omit<ExtractedEntity, 'selected'>[];
  triples: Omit<Triple, 'source'>[];
  suggestions: SchemaSuggestion[];
}

const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
};


const App: React.FC = () => {
  // Core Data State
  const [triples, setTriples] = useState<Triple[]>([]);
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [suggestions, setSuggestions] = useState<SchemaSuggestion[]>([]);
  
  // Document Handling State
  const [managedFiles, setManagedFiles] = useState<ManagedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // App Workflow State
  const [step, setStep] = useState<ExtractionStep>('ready');
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>(View.Extractor);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const extractionStartTimeRef = useRef<number | null>(null);
  const [entityExtractionDuration, setEntityExtractionDuration] = useState<number | null>(null);

  const isProcessing = useMemo(() => {
    return managedFiles.some(f => ['queued', 'parsing', 'extractingEntities', 'extractingRelationships'].includes(f.status.step));
  }, [managedFiles]);
  
  // UI State
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isEntityExportMenuOpen, setIsEntityExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const entityExportMenuRef = useRef<HTMLDivElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const lastResultsScrollTop = useRef(0);
  const [isConfigOpen, setIsConfigOpen] = useState(true);
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(true);
  
  // Schema & Config State
  const [schema, setSchema] = useState<Schema>(() => {
    try {
        const savedSchema = localStorage.getItem('deepTimeSchema');
        return savedSchema ? JSON.parse(savedSchema) : DEFAULT_SCHEMA;
    } catch (e) {
        console.error("Failed to parse schema from localStorage", e);
        return DEFAULT_SCHEMA;
    }
  });
  const [activeSchema, setActiveSchema] = useState<Schema>(schema);
  const schemaHasChanged = useMemo(() => JSON.stringify(schema) !== JSON.stringify(activeSchema), [schema, activeSchema]);
  const [modelName, setModelName] = useState<string>(() => localStorage.getItem('deepTimeModelName') || 'gemini-2.5-flash');
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(() => (localStorage.getItem('deepTimeLlmProvider') as LLMProvider) || 'gemini');
  const [apiKeys, setApiKeys] = useState<string[]>(() => {
      const savedKeys = localStorage.getItem('deepTimeApiKeys');
      return savedKeys ? JSON.parse(savedKeys) : [];
  });
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(() => {
      const savedLimit = localStorage.getItem('deepTimeConcurrencyLimit');
      return savedLimit ? parseInt(savedLimit, 10) : 3;
  });
  const [isTurboMode, setIsTurboMode] = useState<boolean>(() => localStorage.getItem('deepTimeTurboMode') === 'true');
 
  // --- Effects ---
  useEffect(() => { localStorage.setItem('deepTimeSchema', JSON.stringify(schema)); }, [schema]);
  useEffect(() => { localStorage.setItem('deepTimeModelName', modelName); }, [modelName]);
  useEffect(() => { localStorage.setItem('deepTimeLlmProvider', llmProvider); }, [llmProvider]);
  useEffect(() => { localStorage.setItem('deepTimeApiKeys', JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => { localStorage.setItem('deepTimeConcurrencyLimit', String(concurrencyLimit)); }, [concurrencyLimit]);
  useEffect(() => { localStorage.setItem('deepTimeTurboMode', String(isTurboMode)); }, [isTurboMode]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setIsExportMenuOpen(false);
      if (entityExportMenuRef.current && !entityExportMenuRef.current.contains(event.target as Node)) setIsEntityExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (resultsScrollRef.current) {
      resultsScrollRef.current.scrollTop = lastResultsScrollTop.current;
    }
  }, [entities, suggestions]);


  const captureResultsScroll = () => {
    if (resultsScrollRef.current) {
      lastResultsScrollTop.current = resultsScrollRef.current.scrollTop;
    }
  };

  // --- Core Action Handlers ---
  const handleNewSession = () => {
    setTriples([]);
    setEntities([]);
    setSuggestions([]);
    setError(null);
    setProcessingStats(null);
    setEntityExtractionDuration(null);
    extractionStartTimeRef.current = null;
    setManagedFiles(prev => prev.map(mf => ({ ...mf, status: { step: 'ready' } })));
    setStep('ready');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
    const files = 'dataTransfer' in event ? event.dataTransfer.files : event.target.files;
    if (!files || files.length === 0) return;

    const newPdfFiles = Array.from(files).filter((file: File) => file.type === 'application/pdf');
    if (newPdfFiles.length > 0) setIsFilePanelOpen(true);

    const newManagedFilesPromises = newPdfFiles.map(async (file): Promise<ManagedFile | null> => {
        if (managedFiles.some(mf => mf.name === file.name)) return null;
        try {
            const sections = await parsePdfToSections(file);
            return {
                name: file.name,
                file: file,
                sections: sections,
                status: { step: 'ready' }
            };
        } catch (e: any) {
            console.error(`Failed to parse ${file.name}`, e);
            return {
                name: file.name,
                file: file,
                sections: [],
                status: { step: 'error', message: `Failed to parse PDF: ${e.message}` }
            };
        }
    });

    const newManagedFiles = (await Promise.all(newManagedFilesPromises)).filter(Boolean) as ManagedFile[];
    setManagedFiles(prev => [...prev, ...newManagedFiles]);
  };

  const handleDeleteFile = (fileName: string) => {
    setManagedFiles(prev => prev.filter(f => f.name !== fileName));
    setSelectedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
    });
  };

  const handleFileSelectionChange = (fileName: string, isSelected: boolean) => {
    setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (isSelected) newSet.add(fileName);
        else newSet.delete(fileName);
        return newSet;
    });
  };

  const handleSectionSelectionChange = (fileName: string, sectionIndex: number, selected: boolean) => {
    setManagedFiles(prev => prev.map(file => {
        if (file.name === fileName) {
            const newSections = [...file.sections];
            newSections[sectionIndex] = { ...newSections[sectionIndex], selected };
            return { ...file, sections: newSections };
        }
        return file;
    }));
  };
  
  const updateFileStatus = useCallback((fileName: string, newStatus: Partial<ManagedFile['status']>) => {
    setManagedFiles(prev => prev.map(f => f.name === fileName ? { ...f, status: { ...f.status, ...newStatus } } : f));
  }, []);

  const getTextForFile = (file: ManagedFile): string => {
      return file.sections.filter(s => s.selected).map(s => s.content).join('\n\n');
  };

  // --- Batch Processing Logic ---
  const processBatch = async <I, R>(
      itemsToProcess: I[],
      taskFunction: (item: I, apiKey: string, signal: AbortSignal) => Promise<R>,
      onResult: (item: I, result: R) => void,
      keys: string[],
      concurrency: number,
      signal: AbortSignal
  ): Promise<void> => {
      const queue = [...itemsToProcess];
      let keyIndex = 0;

      const runTask = async (): Promise<void> => {
          while (queue.length > 0) {
              if (signal.aborted) return;
              const item = queue.shift();
              if (!item) continue;

              const apiKey = keys[keyIndex % keys.length];
              keyIndex++;

              try {
                  const result = await taskFunction(item, apiKey, signal);
                  if (!signal.aborted) onResult(item, result);
              } catch (e: any) {
                  e.failedItem = item;
                  throw e;
              }
          }
      };

      const workers = Array(concurrency).fill(null).map(runTask);
      await Promise.all(workers);
  };

  const handleExtractionWorkflow = async <I extends { name: string }, R>(
      initialItems: I[],
      taskLogic: (item: I, apiKey: string, signal: AbortSignal) => Promise<R>,
      onResultLogic: (item: I, result: R) => void
  ): Promise<boolean> => {
      let itemsRemaining = [...initialItems];
      let effectiveConcurrency = Math.max(1, Math.min(concurrencyLimit, apiKeys.length, itemsRemaining.length));
      let isSuccess = true;

      while (itemsRemaining.length > 0) {
          if (abortControllerRef.current?.signal.aborted) {
              isSuccess = false;
              break;
          }

          try {
              await processBatch(itemsRemaining, taskLogic, onResultLogic, apiKeys, effectiveConcurrency, abortControllerRef.current!.signal);
              itemsRemaining = []; // Success!
          } catch (e: any) {
              const failedItemName = e.failedItem?.name || 'unknown';
              if (e.message.includes("429")) {
                  itemsRemaining = itemsRemaining.filter(item => item !== e.failedItem);
                  
                  if (effectiveConcurrency === 1) {
                      setError(prev => `${prev ? prev + '\n' : ''}Rate limit hit on file ${failedItemName}. Even sequential processing failed. Stopping.`);
                      updateFileStatus(failedItemName, { step: 'error', message: 'Rate limited' });
                      isSuccess = false;
                      break; 
                  }

                  effectiveConcurrency = 1;
                  itemsRemaining.push(e.failedItem); // Put failed item back in queue
                  setError(prev => `${prev ? prev + '\n' : ''}Rate limit hit. Switching to sequential processing for remaining ${itemsRemaining.length} files.`);
              } else {
                  setError(prev => `${prev ? prev + '\n' : ''}Processing failed on file ${failedItemName}: ${e.message}`);
                  if (failedItemName !== 'unknown') updateFileStatus(failedItemName, { step: 'error', message: e.message });
                  isSuccess = false;
                  break; 
              }
          }
      }
      return isSuccess;
  };
  
  const handleStartExtraction = async () => {
    if (apiKeys.length === 0) return setError('At least one API key is required.');
    const filesToProcess = managedFiles.filter(f => selectedFiles.has(f.name));
    if (filesToProcess.length === 0) return setError('No files selected for extraction.');
    if (filesToProcess.flatMap(f => f.sections.filter(s => s.selected)).length === 0) return setError('No sections selected in the chosen files.');

    abortControllerRef.current = new AbortController();
    const startTime = Date.now();
    extractionStartTimeRef.current = startTime;
    setActiveSchema(schema);
    handleNewSession();
    
    // --- Cache Check & Remote Processing ---
    const localResults = new Map<string, CachedResult>();
    const filesToProcessRemotely: ManagedFile[] = [];

    for (const file of filesToProcess) {
        const text = getTextForFile(file);
        if (!text) {
             updateFileStatus(file.name, { step: 'complete' });
             continue; // Skip files with no selected text
        }
        const textHash = simpleHash(text);
        const schemaHash = simpleHash(JSON.stringify(schema));
        const cacheKey = `${textHash}-${schemaHash}-${modelName}-${isTurboMode}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
            try {
                localResults.set(file.name, JSON.parse(cachedData));
                updateFileStatus(file.name, { step: 'cached' });
            } catch { filesToProcessRemotely.push(file); }
        } else {
            filesToProcessRemotely.push(file);
        }
    }
    
    if (filesToProcessRemotely.length > 0) {
        let taskSuccess = true;
        if (isTurboMode) {
            setStep('extractingRelationships');
            const task = async (file: ManagedFile, apiKey: string, signal: AbortSignal) => {
                updateFileStatus(file.name, { step: 'extractingRelationships' });
                const text = getTextForFile(file);
                const result = await extractInTurboMode(llmProvider, apiKey, text, schema, modelName, signal);
                return { ...result, suggestions: [] };
            };
            const onResult = (file: ManagedFile, result: CachedResult) => {
                localResults.set(file.name, result);
                const text = getTextForFile(file);
                const textHash = simpleHash(text);
                const schemaHash = simpleHash(JSON.stringify(schema));
                const cacheKey = `${textHash}-${schemaHash}-${modelName}-${isTurboMode}`;
                localStorage.setItem(cacheKey, JSON.stringify(result));
            };
            taskSuccess = await handleExtractionWorkflow(filesToProcessRemotely, task, onResult);

        } else {
            setStep('extractingEntities');
            const task = async (file: ManagedFile, apiKey: string, signal: AbortSignal) => {
                updateFileStatus(file.name, { step: 'extractingEntities' });
                const text = getTextForFile(file);
                const { entities, suggestions } = await extractEntities(llmProvider, apiKey, text, schema, modelName, signal);
                return {
                    entities,
                    suggestions: suggestions.filter(s => s.type === 'entity')
                };
            };
            const onResult = (file: ManagedFile, result: { entities: Omit<ExtractedEntity, 'selected'>[], suggestions: SchemaSuggestion[] }) => {
                const existing = localResults.get(file.name) || { entities: [], triples: [], suggestions: [] };
                localResults.set(file.name, { ...existing, entities: result.entities, suggestions: result.suggestions });
            };
            taskSuccess = await handleExtractionWorkflow(filesToProcessRemotely, task, onResult);
        }
        if (!taskSuccess) {
             setStep('error');
             setProcessingStats({
                filesProcessed: localResults.size, entitiesFound: 0, triplesExtracted: 0,
                totalDurationSeconds: (Date.now() - startTime) / 1000,
                entityTypeCounts: {}, predicateTypeCounts: {}
            });
            return;
        }
    }

    if (abortControllerRef.current?.signal.aborted) return;
    
    // --- Aggregate Results ---
    let allEntities: ExtractedEntity[] = [], allSuggestions: SchemaSuggestion[] = [], allTriples: Triple[] = [];

    // New entity normalization and deduplication logic
    const allFoundEntities: Omit<ExtractedEntity, 'selected'>[] = [];
    localResults.forEach(result => {
        allFoundEntities.push(...result.entities);
    });

    const entityGroups = allFoundEntities.reduce((acc, entity) => {
        // Group by normalized name and type
        const key = `${entity.name.trim().toLowerCase()}|${entity.type.trim().toLowerCase()}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(entity);
        return acc;
    }, {} as Record<string, Omit<ExtractedEntity, 'selected'>[]>);

    Object.values(entityGroups).forEach(group => {
        // For each group, find the most common casing of the name to use as canonical
        const nameCounts = group.reduce((acc, e) => {
            const trimmedName = e.name.trim();
            acc[trimmedName] = (acc[trimmedName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const canonicalName = Object.keys(nameCounts).reduce((a, b) => nameCounts[a] > nameCounts[b] ? a : b);

        // Use the first entity in the group as a base, but with the canonical name
        const representativeEntity = { 
            ...group[0], 
            name: canonicalName, 
            selected: true 
        };
        allEntities.push(representativeEntity);
    });

    localResults.forEach((result, fileName) => {
        allSuggestions.push(...result.suggestions);
        allTriples.push(...result.triples.map(t => ({ ...t, source: fileName })));

        const currentStatus = managedFiles.find(f => f.name === fileName)?.status.step;
        if(currentStatus !== 'cached') {
            updateFileStatus(fileName, { step: isTurboMode ? 'complete' : 'awaitingReview' });
        } else {
            updateFileStatus(fileName, { step: 'complete' });
        }
    });
    
    setEntities(allEntities.sort((a,b) => a.name.localeCompare(b.name)));
    setSuggestions(allSuggestions);
    setTriples(allTriples);

    const duration = (Date.now() - startTime) / 1000;
    const entityTypeCounts = allEntities.reduce((acc, entity) => {
        acc[entity.type] = (acc[entity.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    if (isTurboMode) {
        const predicateTypeCounts = allTriples.reduce((acc, triple) => {
            acc[triple.predicate] = (acc[triple.predicate] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        setProcessingStats({
            filesProcessed: localResults.size,
            entitiesFound: allEntities.length,
            triplesExtracted: allTriples.length,
            totalDurationSeconds: duration,
            entityTypeCounts,
            predicateTypeCounts,
        });
    } else {
      setEntityExtractionDuration(duration);
      setProcessingStats({
            filesProcessed: localResults.size,
            entitiesFound: allEntities.length,
            triplesExtracted: allTriples.length,
            totalDurationSeconds: duration,
            entityExtractionDuration: duration,
            entityTypeCounts,
            predicateTypeCounts: {}, // Will be filled in later
      });
    }
    setStep(isTurboMode ? 'complete' : 'reviewing');
  };

  const handleExtractRelationships = async () => {
    if (entities.filter(e => e.selected).length === 0) return setError("No entities selected.");
    abortControllerRef.current = new AbortController();
    const relationshipStartTime = Date.now();
    setStep('extractingRelationships');
    setSuggestions(prev => prev.filter(s => s.type === 'entity'));

    const filesToProcess = managedFiles.filter(f => f.status.step === 'awaitingReview' && selectedFiles.has(f.name));
    const localResults = new Map<string, {triples: Omit<Triple, 'source'>[], suggestions: SchemaSuggestion[]}>();
    
    const task = async (file: ManagedFile, apiKey: string, signal: AbortSignal) => {
        const text = getTextForFile(file);
        if (!text) return { triples: [], suggestions: [] };
        updateFileStatus(file.name, { step: 'extractingRelationships' });
        const selectedEntities = entities.filter(e => e.selected);

        const fileTriples = await extractRelationships(
            llmProvider, apiKey, text, activeSchema, selectedEntities, modelName, signal
        );
        if (signal.aborted) throw new Error("Aborted");
        
        const fileSuggestions = await suggestRelationships(
            llmProvider, apiKey, text, activeSchema, selectedEntities, modelName, signal
        );
        if (signal.aborted) throw new Error("Aborted");

        return { triples: fileTriples, suggestions: fileSuggestions };
    };

    const onResult = (file: ManagedFile, result: {triples: Omit<Triple, 'source'>[], suggestions: SchemaSuggestion[]}) => {
        localResults.set(file.name, result);
        const text = getTextForFile(file);
        const textHash = simpleHash(text);
        const schemaHash = simpleHash(JSON.stringify(activeSchema));
        const cacheKey = `${textHash}-${schemaHash}-${modelName}-${isTurboMode}`;
        const finalEntities = entities.filter(e => e.selected); 
        const entitySuggestions = suggestions.filter(s => s.type === 'entity');
        const finalSuggestions = [...entitySuggestions, ...result.suggestions];
        const cacheData: CachedResult = { entities: finalEntities.map(({selected, ...rest}) => rest), triples: result.triples, suggestions: finalSuggestions };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    };

    const taskSuccess = await handleExtractionWorkflow(filesToProcess, task, onResult);
    
    let finalTriples: Triple[] = Array.from(triples);
    let finalSuggestions: SchemaSuggestion[] = Array.from(suggestions);
    let successfullyProcessedFiles = 0;

    managedFiles.forEach(f => {
        if(selectedFiles.has(f.name) && ['complete', 'cached'].includes(f.status.step)) {
            successfullyProcessedFiles++;
        }
    });

    if (!taskSuccess || abortControllerRef.current?.signal.aborted) {
        setStep('error');
    } else {
        localResults.forEach((result, fileName) => {
            if(selectedFiles.has(fileName)) {
                finalTriples.push(...result.triples.map(t => ({...t, source: fileName})));
                finalSuggestions.push(...result.suggestions);
                updateFileStatus(fileName, { step: 'complete' });
            }
        });
        successfullyProcessedFiles += localResults.size;

        setTriples(finalTriples);
        setSuggestions(finalSuggestions);
        setStep('complete');
    }

    const relationshipExtractionDuration = (Date.now() - relationshipStartTime) / 1000;
    const totalDurationSeconds = (entityExtractionDuration || 0) + relationshipExtractionDuration;
    const finalSelectedEntities = entities.filter(e => e.selected);

    const entityTypeCounts = finalSelectedEntities.reduce((acc, entity) => {
        acc[entity.type] = (acc[entity.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const predicateTypeCounts = finalTriples.reduce((acc, triple) => {
        acc[triple.predicate] = (acc[triple.predicate] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    setProcessingStats({
        filesProcessed: successfullyProcessedFiles,
        entitiesFound: finalSelectedEntities.length,
        triplesExtracted: finalTriples.length,
        totalDurationSeconds: totalDurationSeconds,
        entityExtractionDuration: entityExtractionDuration,
        relationshipExtractionDuration: relationshipExtractionDuration,
        entityTypeCounts: entityTypeCounts,
        predicateTypeCounts: predicateTypeCounts
    });
  };

  const handleStopExtraction = () => abortControllerRef.current?.abort();

  const handleCopy = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  const handleDownload = (data: any, filename: string) => {
    const isJson = filename.endsWith('.json');
    const content = isJson ? JSON.stringify(data, null, 2) : String(data);
    const blob = new Blob([content], { type: isJson ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // For Firefox
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const generateCypherScript = useCallback(() => {
    const escape = (str: string) => JSON.stringify(str);
    
    // Use the full entity list to get types
    const entityTypeMap = new Map(entities.map(e => [e.name, e.type]));

    const nodeStmts = entities
        .filter(e => triples.some(t => t.subject === e.name || t.object === e.name))
        .map(e => `MERGE (:${e.type} {name: ${escape(e.name)}});`)
        .join('\n');

    const relStmts = triples.map(t => {
        const pred = t.predicate.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
        const subjectType = entityTypeMap.get(t.subject) || 'Entity';
        const objectType = entityTypeMap.get(t.object) || 'Entity';
        return `MATCH (s:${subjectType} {name: ${escape(t.subject)}}), (o:${objectType} {name: ${escape(t.object)}})\nMERGE (s)-[r:${pred}]->(o)\nSET r.evidence = ${escape(t.evidenceText)}, r.source = ${escape(t.source)}, r.confidence = ${t.confidence}, r.justification = ${escape(t.justification || '')};`;
    }).join('\n');
    return `// Generated by DeepTime KG Extractor\n${nodeStmts}\n\n${relStmts}`;
  }, [triples, entities]);

  const ApiConfig: React.FC = () => {
    const [newApiKey, setNewApiKey] = useState('');
    const handleAddKey = () => {
        if (newApiKey.trim() && !apiKeys.includes(newApiKey.trim())) {
            setApiKeys([...apiKeys, newApiKey.trim()]);
            setNewApiKey('');
        }
    };
    return (
        <div className="space-y-4 p-3 border border-t-0 rounded-b-md bg-gray-50 flex-shrink-0">
            <div>
                <label className="block text-sm font-bold text-gray-700">AI Provider</label>
                <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value as LLMProvider)} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent">
                    <option value="gemini">Google Gemini</option>
                    <option value="openai" disabled>OpenAI (coming soon)</option>
                    <option value="anthropic" disabled>Anthropic (coming soon)</option>
                </select>
            </div>
             <div>
                <label className="block text-sm font-bold text-gray-700">Model Name</label>
                <input type="text" placeholder="e.g., gemini-2.5-flash" value={modelName} onChange={(e) => setModelName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent"/>
            </div>
             <div className="pt-3 border-t">
                 <h3 className="text-sm font-bold text-gray-700 mb-2">High-Throughput Settings</h3>
                 <div className="space-y-3">
                    <div>
                         <label htmlFor="concurrency" className="flex items-center space-x-2 text-sm font-semibold text-gray-600 mb-1">
                             <ServerIcon className="w-5 h-5"/>
                             <span>Concurrency Limit</span>
                        </label>
                        <input id="concurrency" type="number" min="1" value={concurrencyLimit} onChange={(e) => setConcurrencyLimit(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-full p-2 border border-gray-300 rounded-md shadow-sm"/>
                        <p className="text-xs text-gray-500 mt-1">Max files to process in parallel. Limited by the number of API keys.</p>
                    </div>
                     <div>
                        <label className="flex items-center space-x-2 text-sm font-semibold text-gray-600 mb-1">
                            <KeyIcon className="w-5 h-5"/>
                            <span>API Keys ({apiKeys.length})</span>
                        </label>
                         <div className="space-y-2">
                             {apiKeys.map((key, index) => (
                                 <div key={index} className="flex items-center justify-between bg-white p-1.5 border rounded-md">
                                     <span className="text-xs font-mono text-gray-500">{`****...${key.slice(-4)}`}</span>
                                     <button onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))} className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50">
                                         <TrashIcon/>
                                     </button>
                                 </div>
                             ))}
                         </div>
                         <div className="flex items-center space-x-2 mt-2">
                             <input type="password" placeholder="Add new API key" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddKey()} className="flex-grow p-2 border border-gray-300 rounded-md shadow-sm"/>
                             <button onClick={handleAddKey} className="p-2 bg-brand-accent text-white rounded-md hover:bg-brand-secondary disabled:opacity-50" disabled={!newApiKey.trim()}>
                                 <PlusIcon/>
                             </button>
                         </div>
                     </div>
                 </div>
            </div>
            <div className="pt-3 border-t">
                <label htmlFor="turbo-mode" className="flex items-center justify-between cursor-pointer">
                    <div className="flex flex-col">
                        <span className="font-bold text-gray-700">Turbo Mode</span>
                        <span className="text-xs text-gray-500">Faster, but skips entity review.</span>
                    </div>
                    <div className="relative">
                        <input type="checkbox" id="turbo-mode" className="sr-only" checked={isTurboMode} onChange={() => setIsTurboMode(!isTurboMode)} />
                        <div className={`block w-12 h-6 rounded-full transition-colors ${isTurboMode ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isTurboMode ? 'translate-x-6' : ''}`}></div>
                    </div>
                </label>
            </div>
        </div>
    );
  };


  const Sidebar: React.FC = () => (
    <div className="w-full lg:w-1/3 xl:w-1/4 p-4 space-y-4 bg-white shadow-lg rounded-lg border border-gray-200">
      <nav className="flex space-x-2 border-b pb-4">
        <button onClick={() => setActiveView(View.Extractor)} className={`flex-1 flex items-center justify-center p-2 rounded-md transition-all duration-200 font-semibold ${activeView === View.Extractor ? 'bg-extractor-active text-white shadow-lg transform scale-105' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}><BrainCircuitIcon className="w-5 h-5 mr-2" /> Extractor</button>
        <button onClick={() => setActiveView(View.Schema)} className={`flex-1 flex items-center justify-center p-2 rounded-md transition-all duration-200 font-semibold ${activeView === View.Schema ? 'bg-schema-active text-white shadow-lg transform scale-105' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}><SchemaIcon className="w-5 h-5 mr-2" /> Schema</button>
      </nav>
      {activeView === View.Extractor && (
        <div className="flex flex-col h-[calc(100vh-200px)]">
            <div className="flex-shrink-0">
                <button onClick={() => setIsConfigOpen(!isConfigOpen)} className={`w-full flex justify-between items-center p-3 text-left font-semibold text-brand-dark bg-gray-50 hover:bg-gray-100 border transition-colors ${isConfigOpen ? 'rounded-t-md border-b-0' : 'rounded-md'}`} >
                    <h3 className="text-base">Configuration</h3>
                    <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${isConfigOpen ? 'rotate-180' : ''}`} />
                </button>
                {isConfigOpen && <ApiConfig />}
            </div>
            
            <div className="flex-grow flex flex-col min-h-0">
              <button onClick={handleNewSession} className="w-full flex-shrink-0 flex items-center justify-center space-x-2 text-sm font-semibold py-2 px-3 rounded-md bg-indigo-100 hover:bg-indigo-200 text-indigo-800 transition-colors my-2">
                  <SparklesIcon className="w-5 h-5" />
                  <span>New Session (Clear Results)</span>
              </button>
              
              <div className="flex-shrink-0">
                 <button onClick={() => setIsFilePanelOpen(!isFilePanelOpen)} className={`w-full flex justify-between items-center p-3 text-left font-semibold text-brand-dark bg-gray-50 hover:bg-gray-100 border transition-colors ${isFilePanelOpen ? 'rounded-t-md border-b-0' : 'rounded-md'}`}>
                    <h3 className="text-base">Uploaded Documents</h3>
                    <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${isFilePanelOpen ? 'rotate-180' : ''}`} />
                 </button>
              </div>

              {isFilePanelOpen && (
                <div className="flex-grow overflow-y-auto pr-2 pt-3 border border-t-0 rounded-b-md bg-gray-50">
                    <div 
                        onDrop={handleFileChange} onDragOver={(e) => e.preventDefault()} 
                        className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-300 rounded-md bg-white text-center mb-3"
                    >
                        <UploadCloudIcon className="w-10 h-10 text-gray-400 mb-2"/>
                        <p className="font-semibold text-gray-700 mb-1">Select PDF files</p>
                        <p className="text-sm text-gray-500 mb-3">Drag & drop or click</p>
                        <input type="file" onChange={handleFileChange} accept=".pdf" multiple className="hidden" id="file-upload" />
                        <label htmlFor="file-upload" className="cursor-pointer bg-white text-brand-secondary font-semibold py-2 px-4 border border-brand-secondary rounded-md hover:bg-brand-light transition-colors disabled:opacity-50">Browse</label>
                    </div>
                    <FileList files={managedFiles} selectedFiles={selectedFiles} onFileSelectionChange={handleFileSelectionChange} onSectionSelectionChange={handleSectionSelectionChange} onDeleteFile={handleDeleteFile} />
                </div>
              )}
            </div>

            <div className="mt-auto pt-4 flex-shrink-0">
              <button onClick={isProcessing ? handleStopExtraction : handleStartExtraction} disabled={!isProcessing && selectedFiles.size === 0} className={`w-full flex items-center justify-center font-bold py-3 px-4 rounded-lg transition-colors duration-300 disabled:cursor-not-allowed shadow-md ${isProcessing ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-brand-secondary hover:bg-brand-primary text-white disabled:bg-gray-400'}`}>
                {isProcessing ? <><StopIcon className="w-5 h-5 mr-2" /> Stop Processing</> : <>Extract from {selectedFiles.size > 0 ? `${selectedFiles.size} ` : ''}File{selectedFiles.size !== 1 && 's'}</>}
              </button>
            </div>
        </div>
      )}
      {activeView === View.Schema && <SchemaViewer schema={schema} onSchemaChange={setSchema} onSchemaReset={() => setSchema(DEFAULT_SCHEMA)} />}
    </div>
  );

  const ResultsView: React.FC = () => {
      const entityTypeMap = useMemo(() => new Map(entities.map(e => [e.name, e.type])), [entities]);
      const [resultsViewMode, setResultsViewMode] = useState<'list' | 'graph'>('list');

      const navigateToTriples = () => {
        setResultsViewMode('list');
        setTimeout(() => {
            document.getElementById('triples-list-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      };

      const navigateToEntities = () => {
          document.getElementById('entity-review-section')?.scrollIntoView({ behavior: 'smooth' });
      };

      const ViewToggleButton: React.FC<{
        mode: 'list' | 'graph';
        label: string;
        icon: React.ReactNode;
      }> = ({ mode, label, icon }) => (
        <button
          onClick={() => setResultsViewMode(mode)}
          disabled={resultsViewMode === mode}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors disabled:cursor-default ${
            resultsViewMode === mode
              ? 'bg-brand-primary text-white'
              : 'text-gray-600 bg-gray-200 hover:bg-gray-300'
          }`}
        >
          {icon}
          <span>{label}</span>
        </button>
      );


      return (
        <div className="w-full lg:w-2/3 xl:w-3/4 p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-[calc(100vh-120px)] flex flex-col">
            { (step === 'reviewing' || step === 'complete' || step === 'extractingRelationships' || step === 'error') && (
                <div className="flex justify-between items-start mb-4 pb-4 border-b">
                    <div>
                        <h2 className="text-2xl font-bold text-brand-dark mb-2">
                          {step === 'reviewing' ? "Review Extracted Entities" : `Extraction Results`}
                        </h2>
                        {step !== 'reviewing' && triples.length > 0 && (
                            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
                                <ViewToggleButton mode="list" label="List" icon={<LayoutListIcon />} />
                                <ViewToggleButton mode="graph" label="Graph" icon={<ShareIcon />} />
                            </div>
                        )}
                    </div>
                     {step === 'reviewing' && entities.length > 0 && <div className="relative" ref={entityExportMenuRef}>
                        <button onClick={() => setIsEntityExportMenuOpen(!isEntityExportMenuOpen)} className="flex items-center space-x-2 text-sm font-semibold py-2 px-4 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                            <DownloadIcon className="w-5 h-5" /><span>Export Entities</span><ChevronDownIcon className={`w-4 h-4 transition-transform ${isEntityExportMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isEntityExportMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border py-1">
                               <button onClick={() => { handleCopy(entities.filter(e => e.selected).map(({ selected, ...rest }) => rest)); setIsEntityExportMenuOpen(false); }} className="w-full text-left flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                   {isCopied ? <CheckIcon className="w-5 h-5 text-green-500"/> : <CopyIcon className="w-5 h-5" />}<span>{isCopied ? 'Copied!' : 'Copy as JSON'}</span>
                               </button>
                               <button onClick={() => { handleDownload(entities.filter(e => e.selected).map(({ selected, ...rest }) => rest), `deeptimedb_entities_${Date.now()}.json`); setIsEntityExportMenuOpen(false); }} className="w-full text-left flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                   <DownloadIcon className="w-5 h-5" /><span>Download as JSON</span>
                               </button>
                            </div>
                        )}
                    </div>}
                     {triples.length > 0 && step !== 'reviewing' && <div className="relative" ref={exportMenuRef}>
                        <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="flex items-center space-x-2 text-sm font-semibold py-2 px-4 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                            <DownloadIcon className="w-5 h-5" /><span>Export Triples</span><ChevronDownIcon className={`w-4 h-4 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isExportMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border py-1">
                               <button onClick={() => { handleCopy(triples); setIsExportMenuOpen(false); }} className="w-full text-left flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                   {isCopied ? <CheckIcon className="w-5 h-5 text-green-500"/> : <CopyIcon className="w-5 h-5" />}<span>{isCopied ? 'Copied!' : 'Copy as JSON'}</span>
                               </button>
                               <button onClick={() => { handleDownload(triples, `deeptimedb_triples_${Date.now()}.json`); setIsExportMenuOpen(false); }} className="w-full text-left flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                   <DownloadIcon className="w-5 h-5" /><span>Download as JSON</span>
                               </button>
                               <button onClick={() => { handleDownload(generateCypherScript(), `deeptimedb_export_${Date.now()}.cypher`); setIsExportMenuOpen(false); }} className="w-full text-left flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                   <DatabaseIcon className="w-5 h-5" /><span>Export Cypher (Neo4j)</span>
                               </button>
                            </div>
                        )}
                    </div>}
                </div>
            )}
            
            <div className="flex-grow overflow-y-auto pr-2" ref={resultsScrollRef}>
                {processingStats && (
                    <div className="mb-4">
                        <StatisticsDisplay 
                            stats={processingStats} 
                            onNavigateToEntities={navigateToEntities}
                            onNavigateToTriples={navigateToTriples}
                        />
                    </div>
                )}
                {schemaHasChanged && step !== 'ready' && (
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-4 rounded-md flex items-start mb-4">
                        <InfoIcon className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                        <div><p className="font-bold">Schema Changed</p><p>Your schema edits have been saved and will be applied on the next extraction.</p></div>
                    </div>
                )}
                {error && ( <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md flex items-start" role="alert"> <AlertTriangleIcon className="w-5 h-5 mr-3 flex-shrink-0" /> <div> <p className="font-bold">Error</p> <p className="whitespace-pre-wrap">{error}</p> </div> </div> )}

                {isProcessing && step !== 'reviewing' && ( <div className="flex flex-col items-center justify-center h-full text-brand-secondary"> <LoaderIcon className="w-12 h-12 animate-spin mb-4" /> <p className="text-lg font-semibold">Processing files...</p> </div> )}
                
                {step === 'reviewing' && (
                    <div id="entity-review-section">
                        <EntityList 
                        entities={entities}
                        sourceDescription={`${selectedFiles.size} file(s)`} 
                        onEntitySelectionChange={(idx, sel) => {
                            captureResultsScroll();
                            setEntities(prev => prev.map((e, i) => i === idx ? { ...e, selected: sel } : e));
                        }} 
                        onSelectAll={() => {
                            captureResultsScroll();
                            setEntities(prev => prev.map(e => ({...e, selected: true})));
                        }} 
                        onSelectNone={() => {
                            captureResultsScroll();
                            setEntities(prev => prev.map(e => ({...e, selected: false})));
                        }}
                        />
                        <SuggestionReviewer suggestions={suggestions.filter(s => s.type === 'entity')} onAccept={(sug) => {
                            captureResultsScroll();
                            let newSchema = { ...schema };
                            const { name, categorySuggestion } = sug;
                            const targetAxis = Object.keys(schema.observableAxis).find(k => k === categorySuggestion) ? 'observableAxis' : 'interpretiveAxis';
                            if(schema[targetAxis][categorySuggestion!]) {
                                const concepts = newSchema[targetAxis][categorySuggestion!].concepts;
                                if(Array.isArray(concepts) && !concepts.includes(name)) concepts.push(name);
                            } else { newSchema[targetAxis][categorySuggestion!] = { concepts: [name] }; }
                            setSchema(newSchema);
                            setSuggestions(prev => prev.filter(s => s !== sug));
                        }} onReject={(sug) => {
                            captureResultsScroll();
                            setSuggestions(prev => prev.filter(s => s !== sug));
                        }} />
                        <div className="mt-4 pt-4 border-t flex items-center justify-end">
                            <button onClick={handleExtractRelationships} className="bg-brand-secondary hover:bg-brand-primary text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors disabled:opacity-50" disabled={isProcessing || entities.filter(e => e.selected).length === 0}>
                                Extract Relationships
                            </button>
                        </div>
                    </div>
                )}
                
                {step === 'ready' && managedFiles.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                    <BrainCircuitIcon className="w-16 h-16 mb-4 text-gray-300"/>
                    <h3 className="text-xl font-semibold">Ready to Extract Knowledge</h3>
                    <p>Upload one or more PDF documents to begin.</p>
                  </div>
                )}
                
                 {step === 'ready' && managedFiles.length > 0 && selectedFiles.size === 0 && (
                     <div className="flex flex-col items-center justify-center h-full text-center text-gray-500"><p>Select one or more documents to begin extraction.</p></div>
                )}


                {(step === 'extractingRelationships' || step === 'complete') && (
                  <>
                    {resultsViewMode === 'list' && triples.length > 0 && (
                      <div id="triples-list-section" className="grid grid-cols-1 gap-4">
                          {triples.map((triple, index) => ( 
                              <TripleCard 
                                key={`${triple.source}-${index}`} 
                                triple={triple} 
                                index={index} 
                                subjectType={entityTypeMap.get(triple.subject)}
                                objectType={entityTypeMap.get(triple.object)}
                              /> 
                          ))}
                      </div>
                    )}

                    {resultsViewMode === 'graph' && triples.length > 0 && (
                        <GraphViewer triples={triples} entities={entities} />
                    )}

                    <SuggestionReviewer suggestions={suggestions.filter(s => s.type === 'predicate')} onAccept={(sug) => {
                        captureResultsScroll();
                        if (sug.type === 'predicate') {
                            setSchema(prevSchema => {
                                const newSchema = JSON.parse(JSON.stringify(prevSchema));
                                const category = "AI Suggested Predicates";
                                if (!newSchema.predicates.predicateCategories[category]) {
                                    newSchema.predicates.predicateCategories[category] = [];
                                }
                                if (!newSchema.predicates.predicateCategories[category].includes(sug.name)) {
                                    newSchema.predicates.predicateCategories[category].push(sug.name);
                                }
                                // Add a definition so it can be used by the LLM
                                if (!newSchema.predicates.definitions[sug.name]) {
                                    newSchema.predicates.definitions[sug.name] = {
                                        description: `(AI-suggested) ${sug.justification}`,
                                        domain: [], // Signifies any type is allowed
                                        range: [],  // Signifies any type is allowed
                                    };
                                }
                                return newSchema;
                            });
                        }
                        setSuggestions(prev => prev.filter(s => s !== sug));
                    }} onReject={(sug) => {
                        captureResultsScroll();
                        setSuggestions(prev => prev.filter(s => s !== sug));
                    }} />

                    {triples.length === 0 && !isProcessing && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                        <h3 className="text-xl font-semibold">No Relationships Found</h3>
                        <p>The process completed, but no triples were extracted based on the selected entities and schema.</p>
                      </div>
                    )}
                  </>
                )}
            </div>
          </div>
        </div>
      );
    }

  return (
    <div className="min-h-screen bg-brand-light font-sans">
      <Header />
      <main className="flex flex-col lg:flex-row p-4 space-y-4 lg:space-y-0 lg:space-x-4">
        <Sidebar />
        <ResultsView />
      </main>
    </div>
  );
};

export default App;
