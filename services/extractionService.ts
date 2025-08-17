
import { GoogleGenAI, Type } from "@google/genai";
import type { Triple, Schema, ExtractedEntity, PaperCore, SchemaCapabilityProfile, FitReport, Predicate, SchemaProposal, LlmConfig } from '../types';
import { preprocessText, Candidate } from './stratigraphyPreprocess';

type ExtractionMode = 'schema_mode' | 'automated_mode';

const getGeminiClient = (apiKey: string) => {
    if (!apiKey) {
        throw new Error("Gemini API key is not provided.");
    }
    return new GoogleGenAI({ apiKey });
}

// --- Utility Functions ---

const fillTemplate = (template: string, data: Record<string, any>): string => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
};

const flattenConcepts = (concepts: any): string[] => {
  if (Array.isArray(concepts)) {
    return concepts.flatMap(concept => {
      if (typeof concept === 'string') return [concept];
      if (typeof concept === 'object' && concept !== null) {
        const key = Object.keys(concept)[0];
        const values = concept[key];
        return [key, ...flattenConcepts(values)];
      }
      return [];
    });
  }
  if (typeof concepts === 'object' && concepts !== null) {
    return Object.entries(concepts).flatMap(([key, value]) =>
      [key, ...flattenConcepts(value)]
    );
  }
  return [];
};

const getAllConcepts = (schema: Schema): string[] => {
    const observable = Object.values(schema.observableAxis).flatMap(axis => flattenConcepts(axis.concepts));
    const interpretive = Object.values(schema.interpretiveAxis).flatMap(axis => flattenConcepts(axis.concepts));
    return [...new Set([...observable, ...interpretive])];
};


const generatePredicateReference = (definitions: Record<string, Predicate>): string => {
    return Object.entries(definitions)
        .map(([name, def]) => {
            return `
- Predicate: "${name}"
  - Description: ${def.description}
  - Valid Subject Types (Domain): [${def.domain.join(', ') || 'Any'}]
  - Valid Object Types (Range): [${def.range.join(', ') || 'Any'}]
`;
        }).join('');
};

const summarizePaperCoreForGuidance = (core: PaperCore | null): string => {
  if (!core) return "No abstract provided.";
  const q = core.questions.slice(0, 2).join(" • ");
  const data = core.data_used.slice(0, 5).map(d => `${d.name} (${d.role})`).join(", ");
  const scope = [...new Set([...core.study_area, ...core.time_interval])].slice(0, 6).join(", ");
  const methods = core.methods.slice(0, 3).join(", ");
  return `Core: Q=${q || "?"} | Data=${data || "?"} | Scope=${scope || "?"} | Methods=${methods || "?"}`;
};

export const extractPaperCore = async (
    abstractText: string,
    llmConfig: LlmConfig,
    promptTemplate: string,
    abortSignal: AbortSignal
): Promise<PaperCore> => {
    const ai = getGeminiClient(llmConfig.apiKey);
    const prompt = fillTemplate(promptTemplate, { abstractText });

    try {
        const response = await ai.models.generateContent({
            model: llmConfig.model, contents: prompt,
            config: {
                temperature: llmConfig.temperature, responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT, properties: {
                        questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        data_used: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, role: { type: Type.STRING }, type_hint: { type: Type.STRING } }, required: ["name", "role", "type_hint"] } },
                        study_area: { type: Type.ARRAY, items: { type: Type.STRING } }, time_interval: { type: Type.ARRAY, items: { type: Type.STRING } }, methods: { type: Type.ARRAY, items: { type: Type.STRING } }, key_results: { type: Type.ARRAY, items: { type: Type.STRING } },
                        evidence_spans: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { quote: { type: Type.STRING }, page: { type: Type.NUMBER, nullable: true }, offset: { type: Type.ARRAY, items: { type: Type.NUMBER }, nullable: true } }, required: ["quote", "page", "offset"] } }
                    },
                    required: ["questions", "data_used", "study_area", "time_interval", "methods", "key_results", "evidence_spans"]
                }
            }
        });
        if (abortSignal.aborted) throw new Error("Aborted");
        return JSON.parse(response.text) as PaperCore;
    } catch (e) {
        if (e instanceof Error) { if (e.message.includes('429')) { throw new Error("429 - Rate limit exceeded."); } throw e; } 
        else { throw new Error("An unknown error occurred during PaperCore extraction."); }
    }
};

export const generateSchemaCapabilityProfile = (schema: Schema): SchemaCapabilityProfile => {
    return {
        entity_types: getAllConcepts(schema),
        predicates: Object.keys(schema.predicates.definitions),
        type_rules: Object.entries(schema.predicates.definitions).reduce((acc, [pred, def]) => {
            acc[pred] = { domain: def.domain, range: def.range };
            return acc;
        }, {} as Record<string, { domain: string[], range: string[] }>)
    };
};

const mapToSchema = (item: string, schema: SchemaCapabilityProfile): string | undefined => {
  const norm = item.toLowerCase();
  const entityMap = new Map([
    ['formation','Formation'], ['member','Member'], ['group','Group'],
    ['locality','Locality'], ['basin','Basin'], ['aptian','ChronostratigraphicUnit'], ['albian','ChronostratigraphicUnit']
  ]);
  for (const [key, val] of entityMap) {
      if (norm.includes(key)) { if (schema.entity_types.includes(val)) return val; }
  }
  return schema.entity_types.find(t => norm.includes(t.toLowerCase()));
};

export const generateFitReport = (core: PaperCore, schema: SchemaCapabilityProfile): FitReport => {
  const items = [ ...core.study_area, ...core.time_interval, ...core.data_used.map(d => d.name), 'occurs in','part of','has age','located in'];
  const covered: FitReport['covered'] = [];
  const uncovered: FitReport['uncovered'] = [];

  for (const it of items) {
    const mapped = mapToSchema(it, schema);
    if (mapped) covered.push({ item: it, maps_to: mapped });
    else uncovered.push({ item: it, reason: 'no mapping' });
  }

  const coverage = items.length > 0 ? covered.length / items.length : 1;
  const hasScope = covered.some(x => ['Formation', 'Member', 'Locality'].includes(x.maps_to!)) && (core.time_interval.length === 0 || covered.some(x => x.maps_to === 'ChronostratigraphicUnit'));
  const decision = (coverage >= 0.70 && hasScope) ? 'schema_mode' : 'automated_mode';
  return { covered, uncovered, coverage_score: Number(coverage.toFixed(2)), decision, rationale: `Coverage is ${Math.round(coverage*100)}%. ${hasScope ? 'Critical scope elements are covered.' : 'Critical scope elements are missing.'}` };
};

export const extractEntities = async (
    documentText: string, schema: Schema, extractionMode: ExtractionMode, paperCore: PaperCore | null, llmConfig: LlmConfig, promptTemplates: { schema: string, automated: string }, abortSignal: AbortSignal
): Promise<{ entities: Omit<ExtractedEntity, 'selected'>[], proposals: SchemaProposal[] }> => {
    const guidance = summarizePaperCoreForGuidance(paperCore);
    const { cleanText, candidates } = preprocessText(documentText);
    const ai = getGeminiClient(llmConfig.apiKey);

    try {
        if (extractionMode === 'automated_mode') {
            const prompt = fillTemplate(promptTemplates.automated, {
                guidance,
                schema_concepts: getAllConcepts(schema).join(', '),
                text: cleanText,
            });
            const response = await ai.models.generateContent({
                model: llmConfig.model, contents: prompt,
                config: {
                    temperature: llmConfig.temperature, responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT, properties: {
                            entities: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, type: { type: Type.STRING }, confidence: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["name", "type", "confidence", "justification"] } },
                            new_types: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, definition: { type: Type.STRING }, closest_parent: { type: Type.STRING, nullable: true }, examples: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "definition", "closest_parent", "examples"] } }
                        }, required: ["entities", "new_types"]
                    }
                }
            });
            if (abortSignal.aborted) throw new Error("Aborted");
            const result = JSON.parse(response.text);
            const proposal: SchemaProposal | null = result.new_types.length > 0 ? { id: `prop-${Date.now()}`, baseVersion: schema.meta.version, new_types: result.new_types, new_predicates: [], evidence: { paperId: 'current', quotes: [] } } : null;
            return { entities: result.entities || [], proposals: proposal ? [proposal] : [] };
        }

        const prompt = fillTemplate(promptTemplates.schema, {
            guidance,
            all_concepts: getAllConcepts(schema).join(', '),
            text: cleanText,
            candidate_hints: JSON.stringify(candidates.map(c => ({ name: c.name, type: c.type })), null, 2),
        });
        const response = await ai.models.generateContent({ 
            model: llmConfig.model, 
            contents: prompt, 
            config: { 
                temperature: llmConfig.temperature, 
                responseMimeType: "application/json", 
                responseSchema: { 
                    type: Type.ARRAY, 
                    items: { 
                        type: Type.OBJECT, 
                        properties: { 
                            name: { type: Type.STRING }, 
                            type: { type: Type.STRING }, 
                            confidence: { type: Type.NUMBER }, 
                            justification: { type: Type.STRING } 
                        }, 
                        required: ["name", "type", "confidence", "justification"] 
                    } 
                } 
            } 
        });
        if (abortSignal.aborted) throw new Error("Aborted");
        const entities = JSON.parse(response.text);

        return { entities: entities, proposals: [] };

    } catch (e) {
         if (e instanceof Error) { if (e.message.includes('429')) throw new Error("429 - Rate limit exceeded."); throw e; } 
         else { throw new Error("An unknown error occurred during entity extraction."); }
    }
};

export const extractRelationships = async (
    documentText: string, schema: Schema, entities: ExtractedEntity[], extractionMode: ExtractionMode, paperCore: PaperCore | null, llmConfig: LlmConfig, promptTemplates: { schema: string, automated: string }, abortSignal: AbortSignal
): Promise<{triples: Omit<Triple, 'source'>[], proposals: SchemaProposal[]}> => {
    const guidance = summarizePaperCoreForGuidance(paperCore);
    const { cleanText } = preprocessText(documentText);
    const ai = getGeminiClient(llmConfig.apiKey);
    const typedEntitiesString = entities.map(e => `- "${e.name}" (type: ${e.type})`).join('\n');
    const predicateReference = generatePredicateReference(schema.predicates.definitions);

     try {
        if (extractionMode === 'automated_mode') {
            const prompt = fillTemplate(promptTemplates.automated, {
                guidance,
                typed_entity_list: typedEntitiesString,
                predicate_reference: predicateReference,
                text: cleanText,
            });
            const response = await ai.models.generateContent({
                model: llmConfig.model, contents: prompt,
                config: {
                    temperature: llmConfig.temperature, responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT, properties: {
                            triples: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subject: { type: Type.STRING }, predicate: { type: Type.STRING }, object: { type: Type.STRING }, evidenceText: { type: Type.STRING }, confidence: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["subject", "predicate", "object", "evidenceText", "confidence", "justification"] } },
                            new_predicates: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, domain: { type: Type.ARRAY, items: { type: Type.STRING } }, range: { type: Type.ARRAY, items: { type: Type.STRING } }, example: { type: Type.OBJECT, properties: { subject: { type: Type.STRING }, object: { type: Type.STRING }, evidenceText: { type: Type.STRING } }, required: ["subject", "object", "evidenceText"] } }, required: ["name", "description", "domain", "range", "example"] } }
                        }, required: ["triples", "new_predicates"]
                    }
                }
            });
            if (abortSignal.aborted) throw new Error("Aborted");
            const result = JSON.parse(response.text);
            const proposal: SchemaProposal | null = result.new_predicates.length > 0 ? { id: `prop-${Date.now()}`, baseVersion: schema.meta.version, new_types: [], new_predicates: result.new_predicates, evidence: { paperId: 'current', quotes: result.new_predicates.map((p: any) => p.example.evidenceText) } } : null;
            return { triples: result.triples || [], proposals: proposal ? [proposal] : [] };
        }
        
        const prompt = fillTemplate(promptTemplates.schema, {
            guidance,
            typed_entity_list: typedEntitiesString,
            predicate_reference: predicateReference,
            document: cleanText,
        });
        const response = await ai.models.generateContent({
            model: llmConfig.model, contents: prompt,
            config: {
                temperature: llmConfig.temperature, responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT, properties: { triples: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subject: { type: Type.STRING }, predicate: { type: Type.STRING }, object: { type: Type.STRING }, evidenceText: { type: Type.STRING }, confidence: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["subject", "predicate", "object", "evidenceText", "confidence", "justification"] } } }, required: ["triples"]
                }
            }
        });

        if (abortSignal.aborted) throw new Error("Aborted");
        const result = JSON.parse(response.text);
        return { triples: result.triples || [], proposals: [] };

    } catch (e) {
        if (e instanceof Error) { if (e.message.includes('429')) throw new Error("429 - Rate limit exceeded."); throw e; } 
        else { throw new Error("An unknown error occurred during relationship extraction."); }
    }
};
