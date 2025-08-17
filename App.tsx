
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Triple, Schema, ExtractedEntity, ExtractionStep, DocumentChunk, PaperCore, FitReport, SchemaProposal, ProcessingStats, LlmConfig, PromptCollection } from './types';
import { View } from './types';
import { extractEntities, extractRelationships, extractPaperCore, generateSchemaCapabilityProfile, generateFitReport } from './services/extractionService';
import { parsePdfToText } from './services/pdfParsingService';
import { llmChunkDocument } from './services/llmParsingService';
import Header from './components/Header';
import TripleCard from './components/TripleCard';
import SchemaViewer from './components/SchemaViewer';
import EntityList from './components/EntityList';
import FileList from './components/FileList';
import SchemaProposalReviewer from './components/SchemaProposalReviewer';
import StatisticsDisplay from './components/StatisticsDisplay';
import GraphViewer from './components/GraphViewer';
import ExtractionAnalysis from './components/ExtractionAnalysis';
import SettingsModal from './components/SettingsModal';
import PromptManager from './components/PromptManager';
import { BrainCircuitIcon, SchemaIcon, LoaderIcon, StopIcon, SparklesIcon, UploadCloudIcon, ShareIcon, LayoutListIcon, BookOpenIcon, AlertTriangleIcon } from './components/icons';
import { DEFAULT_SCHEMA } from './constants';
import { DEFAULT_PROMPTS } from './prompts';

interface ManagedFile {
    name: string;
    file: File;
    rawText?: string;
    chunks?: DocumentChunk[];
    status: { step: ExtractionStep; message?: string };
}

const semverMinorBump = (version: string): string => {
    let [major, minor, patch] = version.split('.').map(Number);
    minor++;
    patch = 0;
    return `${major}.${minor}.${patch}`;
}

const App: React.FC = () => {
  const [triples, setTriples] = useState<Triple[]>([]);
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [schemaProposals, setSchemaProposals] = useState<SchemaProposal[]>([]);
  const [paperCore, setPaperCore] = useState<PaperCore | null>(null);
  const [fitReport, setFitReport] = useState<FitReport | null>(null);
  
  const [managedFiles, setManagedFiles] = useState<ManagedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>(View.Extractor);
  const [activeResultTab, setActiveResultTab] = useState<'analysis' | 'triples' | 'entities' | 'graph'>('analysis');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const extractionStartTimeRef = useRef<number | null>(null);
  const [entityExtractionDuration, setEntityExtractionDuration] = useState<number | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const isProcessing = useMemo(() => managedFiles.some(f => ['queued', 'parsing', 'structuring', 'analyzingSchemaFit', 'extractingEntities', 'extractingRelationships'].includes(f.status.step)), [managedFiles]);
  
  const [schema, setSchema] = useState<Schema>(() => {
    try { const savedSchema = localStorage.getItem('deepTimeSchema'); return savedSchema ? JSON.parse(savedSchema) : DEFAULT_SCHEMA; } 
    catch (e) { console.error("Failed to parse schema from localStorage", e); return DEFAULT_SCHEMA; }
  });
  const [activeSchema, setActiveSchema] = useState<Schema>(schema);
  
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(() => {
    try { const saved = localStorage.getItem('llmConfig'); return saved ? JSON.parse(saved) : { apiKey: process.env.API_KEY || '', model: 'gemini-2.5-flash', temperature: 0.2 }; }
    catch(e) { return { apiKey: process.env.API_KEY || '', model: 'gemini-2.5-flash', temperature: 0.2 }; }
  });

  const [prompts, setPrompts] = useState<PromptCollection>(() => {
    try { const saved = localStorage.getItem('prompts'); return saved ? JSON.parse(saved) : DEFAULT_PROMPTS; }
    catch(e) { return DEFAULT_PROMPTS; }
  });

  useEffect(() => { localStorage.setItem('deepTimeSchema', JSON.stringify(schema)); }, [schema]);
  useEffect(() => { localStorage.setItem('llmConfig', JSON.stringify(llmConfig)); }, [llmConfig]);
  useEffect(() => { localStorage.setItem('prompts', JSON.stringify(prompts)); }, [prompts]);

  const handleNewSession = () => {
    setTriples([]); setEntities([]); setSchemaProposals([]); setError(null); setProcessingStats(null);
    setEntityExtractionDuration(null); setPaperCore(null); setFitReport(null);
    extractionStartTimeRef.current = null;
    const filesToReset = managedFiles.filter(mf => selectedFiles.has(mf.name));
    const otherFiles = managedFiles.filter(mf => !selectedFiles.has(mf.name));
    const resetFiles = filesToReset.map(mf => ({ ...mf, status: { step: 'ready' as ExtractionStep }, chunks: undefined, rawText: undefined }));
    setManagedFiles([...otherFiles, ...resetFiles]);
  };

  const handleFileChange = (eventOrFiles: React.ChangeEvent<HTMLInputElement> | FileList) => {
    const files = 'length' in eventOrFiles ? eventOrFiles : eventOrFiles.target.files;
    if (!files || files.length === 0) return;

    const newPdfFiles = Array.from(files).filter(file => file.type === 'application/pdf' && !managedFiles.some(mf => mf.name === file.name));
    const newManagedFiles: ManagedFile[] = newPdfFiles.map(file => ({ name: file.name, file, status: { step: 'ready' } }));
    setManagedFiles(prev => [...prev, ...newManagedFiles]);
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
          setIsDragging(true);
      } else if (e.type === "dragleave") {
          setIsDragging(false);
      }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFileChange(e.dataTransfer.files);
          e.dataTransfer.clearData();
      }
  };
  
  const updateFileStatus = useCallback((fileName: string, newStatus: Partial<ManagedFile['status']>) => {
    setManagedFiles(prev => prev.map(f => f.name === fileName ? { ...f, status: { ...f.status, ...newStatus } } : f));
  }, []);

  const getTextForFile = (file: ManagedFile): string => {
      return file.chunks?.filter(c => c.selected).map(c => c.content).join('\n\n') || file.rawText || '';
  };

  const getActivePrompt = (key: keyof PromptCollection): string => {
      const prompt = prompts[key];
      const active = prompt.versions.find(v => v.version === prompt.activeVersion);
      return active ? active.template : '';
  }

  const handleStartExtraction = async () => {
    if (!llmConfig.apiKey) { 
        setError('Gemini API key is not configured. Please set it in Settings.');
        setIsSettingsOpen(true);
        return;
    }
    const filesToProcess = managedFiles.filter(f => selectedFiles.has(f.name));
    if (filesToProcess.length === 0) return setError('No files selected for extraction.');
    
    abortControllerRef.current = new AbortController();
    const startTime = Date.now();
    extractionStartTimeRef.current = startTime;
    setActiveSchema(schema);
    handleNewSession();
    setActiveResultTab('analysis');
    setActiveView(View.Extractor);
    
    filesToProcess.forEach(file => updateFileStatus(file.name, { step: 'queued' }));

    try {
        // Step 1: Parse and chunk all files in parallel
        await Promise.all(filesToProcess.map(async (file) => {
            if (abortControllerRef.current?.signal.aborted) return;
            updateFileStatus(file.name, { step: 'parsing', message: "Parsing PDF..." });
            const rawText = await parsePdfToText(file.file);

            if (abortControllerRef.current?.signal.aborted) return;
            updateFileStatus(file.name, { step: 'structuring', message: "Structuring document..." });
            const chunkPrompt = getActivePrompt('DOCUMENT_STRUCTURE');
            const chunks = await llmChunkDocument(rawText, llmConfig, chunkPrompt, abortControllerRef.current!.signal);
            
            setManagedFiles(prev => prev.map(f => f.name === file.name ? { ...f, rawText, chunks } : f));
        }));
        if (abortControllerRef.current?.signal.aborted) throw new Error("Operation aborted by user.");
        
        // Step 2: Analyze schema fit on the first file (sequential is fine)
        const firstFile = managedFiles.find(f => selectedFiles.has(f.name));
        const firstFileChunks = firstFile?.chunks;
        const abstractText = firstFileChunks?.[0]?.content.slice(0, 4000) || '';
        let mode: 'schema_mode' | 'automated_mode' = 'schema_mode';

        if (abstractText) {
            updateFileStatus(firstFile!.name, { step: 'analyzingSchemaFit', message: "Analyzing paper core..." });
            const corePrompt = getActivePrompt('PAPER_CORE_EXTRACTION');
            const core = await extractPaperCore(abstractText, llmConfig, corePrompt, abortControllerRef.current!.signal);
            setPaperCore(core);
            const report = generateFitReport(core, generateSchemaCapabilityProfile(schema));
            setFitReport(report);
            mode = report.decision;
        }
        if (abortControllerRef.current?.signal.aborted) throw new Error("Operation aborted by user.");

        // Step 3: Extract entities from all files in parallel
        const entityExtractionStart = Date.now();
        const entityExtractionResults = await Promise.all(filesToProcess.map(async (file) => {
            if (abortControllerRef.current?.signal.aborted) return { entities: [], proposals: [] };
            updateFileStatus(file.name, { step: 'extractingEntities', message: "Extracting entities..." });
            const text = getTextForFile(file);
            if (!text) return { entities: [], proposals: [] };
            
            const entityPrompts = {
                schema: getActivePrompt('SCHEMA_ENTITY_EXTRACTION'),
                automated: getActivePrompt('AUTOMATED_ENTITY_EXTRACTION'),
            };
            return extractEntities(text, schema, mode, paperCore, llmConfig, entityPrompts, abortControllerRef.current!.signal);
        }));
        if (abortControllerRef.current?.signal.aborted) throw new Error("Operation aborted by user.");

        let allEntities: ExtractedEntity[] = [];
        entityExtractionResults.forEach(result => {
            result.entities.forEach(e => allEntities.push({ ...e, selected: true }));
            result.proposals.forEach(p => setSchemaProposals(prev => [...prev, p]));
        });
        setEntityExtractionDuration((Date.now() - entityExtractionStart) / 1000);
        setEntities(allEntities);

        // Step 4: Extract relationships from all files in parallel
        const relationshipExtractionResults = await Promise.all(filesToProcess.map(async (file) => {
             if (abortControllerRef.current?.signal.aborted) return { file, triples: [], proposals: [] };
             updateFileStatus(file.name, { step: 'extractingRelationships', message: "Extracting relationships..." });
             const text = getTextForFile(file);
             if (!text) return { file, triples: [], proposals: [] };
             const relationshipPrompts = {
                 schema: getActivePrompt('SCHEMA_RELATIONSHIP_EXTRACTION'),
                 automated: getActivePrompt('AUTOMATED_RELATIONSHIP_EXTRACTION'),
             };
             const result = await extractRelationships(text, schema, allEntities, mode, paperCore, llmConfig, relationshipPrompts, abortControllerRef.current!.signal);
             updateFileStatus(file.name, { step: 'complete' });
             return { file, ...result };
        }));
        if (abortControllerRef.current?.signal.aborted) throw new Error("Operation aborted by user.");

        let allTriples: Triple[] = [];
        relationshipExtractionResults.forEach(result => {
             result.triples.forEach(t => allTriples.push({ ...t, source: result.file.name }));
             result.proposals.forEach(p => setSchemaProposals(prev => [...prev, p]));
        });
        setTriples(allTriples);

        // Step 5: Final stats calculation
        const totalDurationSeconds = (Date.now() - startTime) / 1000;
        const entityTypeCounts = allEntities.reduce((acc, entity) => { acc[entity.type] = (acc[entity.type] || 0) + 1; return acc; }, {} as Record<string, number>);
        const predicateTypeCounts = allTriples.reduce((acc, triple) => { acc[triple.predicate] = (acc[triple.predicate] || 0) + 1; return acc; }, {} as Record<string, number>);
        setProcessingStats({ filesProcessed: filesToProcess.length, entitiesFound: allEntities.length, triplesExtracted: allTriples.length, totalDurationSeconds, entityExtractionDuration, relationshipExtractionDuration: totalDurationSeconds - (entityExtractionDuration || 0), entityTypeCounts, predicateTypeCounts });

    } catch (e: any) {
        setError(`Extraction failed: ${e.message}`);
        filesToProcess.forEach(f => updateFileStatus(f.name, { step: 'error', message: e.message }));
    }
  };
  
  const handleAcceptProposal = (proposal: SchemaProposal) => {
    setSchema(prev => {
        const newSchema = JSON.parse(JSON.stringify(prev));
        proposal.new_types.forEach(nt => {
            const parentKey = nt.closest_parent || 'Uncategorized';
            let targetAxis = Object.keys(newSchema.observableAxis).find(k => k === parentKey) ? 'observableAxis' : 'interpretiveAxis';
            if (!newSchema[targetAxis][parentKey]) {
                newSchema[targetAxis][parentKey] = { concepts: [] };
            }
            if (!newSchema[targetAxis][parentKey].concepts.includes(nt.name)) {
                newSchema[targetAxis][parentKey].concepts.push(nt.name);
            }
        });
        proposal.new_predicates.forEach(np => {
            const category = "AI Suggested Predicates";
            if (!newSchema.predicates.predicateCategories[category]) newSchema.predicates.predicateCategories[category] = [];
            if (!newSchema.predicates.predicateCategories[category].includes(np.name)) newSchema.predicates.predicateCategories[category].push(np.name);
            newSchema.predicates.definitions[np.name] = { description: np.description, domain: np.domain, range: np.range };
        });
        newSchema.meta.version = semverMinorBump(prev.meta.version);
        return newSchema;
    });
    setSchemaProposals(prev => prev.filter(p => p.id !== proposal.id));
  };
  
  const handleRejectProposal = (proposal: SchemaProposal) => {
    setSchemaProposals(prev => prev.filter(p => p.id !== proposal.id));
  };

  const handleStopExtraction = () => abortControllerRef.current?.abort();
  const handleFileSelectionChange = (fileName: string, isSelected: boolean) => { setSelectedFiles(prev => { const newSet = new Set(prev); if (isSelected) newSet.add(fileName); else newSet.delete(fileName); return newSet; }); };
  const handleSectionSelectionChange = (fileName: string, chunkId: string, selected: boolean) => { setManagedFiles(prev => prev.map(file => { if (file.name === fileName && file.chunks) { const newChunks = file.chunks.map(c => c.id === chunkId ? { ...c, selected } : c); return { ...file, chunks: newChunks }; } return file; })); };
  const handleDeleteFile = (fileName: string) => { setManagedFiles(prev => prev.filter(f => f.name !== fileName)); setSelectedFiles(prev => { const newSet = new Set(prev); newSet.delete(fileName); return newSet; }); };
  const handleSchemaReset = () => { if (window.confirm("Are you sure you want to reset the schema to its default state? This will clear any unsaved changes.")) { setSchema(DEFAULT_SCHEMA); } };

  const ViewSwitcher = () => (
    <div className="flex items-center p-1 bg-gray-200 rounded-lg">
        <button onClick={() => setActiveView(View.Extractor)} className={`flex items-center px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeView === View.Extractor ? 'bg-white text-brand-primary shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            <BrainCircuitIcon className="w-5 h-5 mr-2" /> Extractor
        </button>
        <button onClick={() => setActiveView(View.Schema)} className={`flex items-center px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeView === View.Schema ? 'bg-white text-brand-primary shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            <SchemaIcon className="w-5 h-5 mr-2" /> Schema Editor
        </button>
        <button onClick={() => setActiveView(View.Prompts)} className={`flex items-center px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeView === View.Prompts ? 'bg-white text-brand-primary shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            <BookOpenIcon className="w-5 h-5 mr-2" /> Prompts
        </button>
    </div>
  );

  const ResultTabs = () => (
    <div className="flex items-center border-b border-gray-200">
        <TabButton name="analysis" label="Analysis" icon={<SparklesIcon/>} count={paperCore ? 1 : 0} />
        <TabButton name="triples" label="Triples" icon={<LayoutListIcon/>} count={triples.length} />
        <TabButton name="entities" label="Entities" icon={<BrainCircuitIcon />} count={entities.length} />
        <TabButton name="graph" label="Graph" icon={<ShareIcon/>} count={triples.length > 0 ? 1 : 0} />
    </div>
  );

  const TabButton: React.FC<{name: typeof activeResultTab, label: string, icon: React.ReactNode, count: number}> = ({name, label, icon, count}) => (
    <button
        onClick={() => setActiveResultTab(name)}
        disabled={count === 0}
        className={`flex items-center space-x-2 px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${activeResultTab === name ? 'text-brand-primary border-b-2 border-brand-primary' : 'text-gray-500 hover:text-brand-dark disabled:text-gray-300'}`}
    >
        {icon}
        <span>{label}</span>
        {count > 0 && <span className="text-xs bg-gray-200 text-gray-700 font-bold px-2 py-0.5 rounded-full">{count}</span>}
    </button>
  );

  const WelcomeScreen = () => (
      <div className="text-center p-8">
          {!llmConfig.apiKey && (
              <div className="max-w-2xl mx-auto mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-md text-yellow-800 flex items-start space-x-3">
                  <AlertTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0"/>
                  <div>
                      <h3 className="font-bold">API Key Missing</h3>
                      <p className="text-sm">Please set your Gemini API key in the <button onClick={() => setIsSettingsOpen(true)} className="underline font-semibold">Settings</button> menu to begin extraction.</p>
                  </div>
              </div>
          )}
          <h2 className="text-2xl font-bold text-brand-dark mb-2">Welcome to the DeepTime KG Extractor</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
              To get started, upload one or more scientific papers in PDF format using the panel on the left.
              Then, select the files you wish to process and click the "Extract" button.
          </p>
      </div>
  );

  const LoadingScreen = () => {
      const fileInProgress = managedFiles.find(f => ['parsing', 'structuring', 'analyzingSchemaFit', 'extractingEntities', 'extractingRelationships'].includes(f.status.step));
      const message = fileInProgress ? `${fileInProgress.status.message || "Processing..."}` : "Processing files...";
      const fileName = fileInProgress ? `(${fileInProgress.name})` : '';

      return (
          <div className="flex flex-col items-center justify-center h-full text-brand-secondary p-8">
              <LoaderIcon className="w-12 h-12 animate-spin mb-4" />
              <p className="text-lg font-semibold">{message}</p>
              {fileName && <p className="text-sm text-gray-600 mt-1">{fileName}</p>}
          </div>
      );
  };
  
  return (
    <div className="min-h-screen bg-brand-light font-sans flex flex-col">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
       {isSettingsOpen && <SettingsModal config={llmConfig} onConfigChange={setLlmConfig} onClose={() => setIsSettingsOpen(false)} />}
      <main className="flex-grow flex flex-col lg:flex-row p-4 gap-4">
        <div className="w-full lg:w-1/3 xl:w-1/4 flex flex-col space-y-4 bg-white shadow-lg rounded-lg border border-gray-200 p-4">
            <div 
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${isDragging ? 'border-brand-accent bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-brand-primary'}`}
                onDragEnter={handleDragEvents} onDragOver={handleDragEvents} onDragLeave={handleDragEvents} onDrop={handleDrop}
            >
                <UploadCloudIcon className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Drag & drop PDF files here, or <label htmlFor="file-upload" className="font-semibold text-brand-primary cursor-pointer hover:underline">browse</label>.</p>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept=".pdf" onChange={handleFileChange} />
            </div>
            
            <div className="flex-grow min-h-0 overflow-y-auto">
                <FileList files={managedFiles} selectedFiles={selectedFiles} onFileSelectionChange={handleFileSelectionChange} onSectionSelectionChange={handleSectionSelectionChange} onDeleteFile={handleDeleteFile} />
            </div>

             <div className="mt-auto pt-4 flex-shrink-0">
              <button onClick={isProcessing ? handleStopExtraction : handleStartExtraction} disabled={!isProcessing && (selectedFiles.size === 0 || !llmConfig.apiKey)} className={`w-full flex items-center justify-center font-bold py-3 px-4 rounded-lg transition-colors duration-300 disabled:cursor-not-allowed shadow-md ${isProcessing ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-brand-secondary hover:bg-brand-primary text-white disabled:bg-gray-400'}`}>
                {isProcessing ? <><StopIcon className="w-5 h-5 mr-2" /> Stop Processing</> : <><SparklesIcon className="w-5 h-5 mr-2"/>Extract from {selectedFiles.size > 0 ? `${selectedFiles.size} ` : ''}File{selectedFiles.size !== 1 && 's'}</>}
              </button>
              {error && <p className="text-red-600 text-sm mt-2 text-center">{error}</p>}
            </div>
        </div>
        
        <div className="w-full lg:w-2/3 xl:w-3/4 bg-white shadow-lg rounded-lg border border-gray-200 p-4 flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-1">
                <ViewSwitcher />
            </div>
            <div className="flex-grow min-h-0 overflow-y-auto">
                {activeView === View.Schema && (
                    <SchemaViewer schema={schema} onSchemaChange={setSchema} onSchemaReset={handleSchemaReset} />
                )}
                 {activeView === View.Prompts && (
                    <PromptManager prompts={prompts} onPromptsChange={setPrompts} />
                )}
                {activeView === View.Extractor && (
                    <div className="h-full flex flex-col">
                        {isProcessing ? <LoadingScreen /> : 
                         !processingStats && triples.length === 0 ? <WelcomeScreen /> : (
                            <>
                                <ResultTabs />
                                <div className="flex-grow overflow-y-auto pt-4 pr-2">
                                    {activeResultTab === 'analysis' && (
                                        <div className="space-y-4">
                                            {paperCore && fitReport && <ExtractionAnalysis paperCore={paperCore} fitReport={fitReport} />}
                                            {processingStats && <StatisticsDisplay stats={processingStats} onNavigateToEntities={() => setActiveResultTab('entities')} onNavigateToTriples={() => setActiveResultTab('triples')} />}
                                            {schemaProposals.length > 0 && <SchemaProposalReviewer proposals={schemaProposals} onAccept={handleAcceptProposal} onReject={handleRejectProposal} />}
                                        </div>
                                    )}
                                    {activeResultTab === 'triples' && (
                                        <div className="grid grid-cols-1 gap-4">
                                            {triples.map((triple, index) => ( <TripleCard key={`${triple.source}-${index}`} triple={triple} index={index} /> ))}
                                        </div>
                                    )}
                                    {activeResultTab === 'entities' && (
                                        <EntityList entities={entities} readOnly={true} />
                                    )}
                                     {activeResultTab === 'graph' && (
                                        <div className="h-[calc(100vh-250px)]">
                                            <GraphViewer triples={triples} entities={entities} />
                                        </div>
                                    )}
                                </div>
                            </>
                         )}
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;
