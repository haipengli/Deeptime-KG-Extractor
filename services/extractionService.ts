
import { GoogleGenAI, Type } from "@google/genai";
import type { Triple, Schema, LLMProvider, SchemaSuggestion, TurboOutput, ExtractedEntity, PaperCore, SchemaCapabilityProfile, FitReport, Predicate } from '../types';
import { preprocessText, Candidate } from './stratigraphyPreprocess';

type ExtractionMode = 'schema_mode' | 'automated_mode';

// --- Utility Functions ---

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

const getBiologicalConcepts = (schema: Schema): string[] => {
    return flattenConcepts(schema.interpretiveAxis.Biostratigraphy.concepts);
}

const getGeologicalConcepts = (schema: Schema): string[] => {
    const observable = [
        ...flattenConcepts(schema.observableAxis.Time.concepts),
        ...flattenConcepts(schema.observableAxis.Space.concepts),
        ...flattenConcepts(schema.observableAxis.GeologicObject.concepts),
        ...flattenConcepts(schema.observableAxis.GeologicUnit.concepts),
        ...flattenConcepts(schema.observableAxis.GeologicFeatureMorphologic.concepts),
    ];
    const interpretive = [
        ...flattenConcepts(schema.interpretiveAxis.Realm.concepts),
        ...flattenConcepts(schema.interpretiveAxis.EnvironmentsSystems.concepts),
        ...flattenConcepts(schema.interpretiveAxis.RockOrigin.concepts),
        ...flattenConcepts(schema.interpretiveAxis.SurfacesInterpretive.concepts),
        ...flattenConcepts(schema.interpretiveAxis.Events.concepts),
    ];
    const bioConcepts = getBiologicalConcepts(schema);
    const all = [...new Set([...observable, ...interpretive])];
    // Filter out bio concepts to get purely geological ones
    return all.filter(c => !bioConcepts.includes(c));
}

const getAllConcepts = (schema: Schema): string[] => {
    return [...new Set([...getGeologicalConcepts(schema), ...getBiologicalConcepts(schema)])];
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

// --- Pre-flight Analysis Pipeline ---

const generatePaperCorePrompt = (abstractText: string): string => `
You are an expert academic researcher specializing in deeptime research, especially paleogeography, geology and paleontology. 
Your task is to meticulously analyze the provided research paper ABSTRACT and distill its core scientific contribution.. From the ABSTRACT only, extract the paper's core:
- questions (what is being asked),
- data_used (what evidence is analyzed),
- study_area (formations, members, basins, localities),
- time_interval (geologic time terms),
- methods,
- key_results (1–3 short bullet claims).
Return STRICT JSON matching the PaperCore schema. No extra fields.
Include short evidence quotes with page/offsets.

ABSTRACT (preprocessed):
${abstractText}
SOURCE: page 1
`;

export const extractPaperCore = async (
    provider: LLMProvider,
    apiKey: string,
    abstractText: string,
    modelName: string,
    abortSignal: AbortSignal
): Promise<PaperCore> => {
    if (provider !== 'gemini' || !apiKey) {
        throw new Error('Only Gemini provider is supported for this operation.');
    }
    const ai = new GoogleGenAI({ apiKey });
    const prompt = generatePaperCorePrompt(abstractText);

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        data_used: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    role: { type: Type.STRING },
                                    type_hint: { type: Type.STRING }
                                },
                                required: ["name", "role", "type_hint"]
                            }
                        },
                        study_area: { type: Type.ARRAY, items: { type: Type.STRING } },
                        time_interval: { type: Type.ARRAY, items: { type: Type.STRING } },
                        methods: { type: Type.ARRAY, items: { type: Type.STRING } },
                        key_results: { type: Type.ARRAY, items: { type: Type.STRING } },
                        evidence_spans: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    quote: { type: Type.STRING },
                                    page: { type: Type.NUMBER, nullable: true },
                                    offset: { type: Type.ARRAY, items: { type: Type.NUMBER }, nullable: true }
                                },
                                required: ["quote", "page", "offset"]
                            }
                        }
                    },
                    required: ["questions", "data_used", "study_area", "time_interval", "methods", "key_results", "evidence_spans"]
                }
            }
        });
        if (abortSignal.aborted) throw new Error("Aborted");
        return JSON.parse(response.text) as PaperCore;
    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "Aborted") console.log("PaperCore extraction intentionally aborted.");
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                throw new Error("429 - Rate limit exceeded.");
            }
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during PaperCore extraction.");
        }
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
    ['locality','Locality'], ['basin','Basin'], ['aptian','ChronostratigraphicUnit'],
    ['albian','ChronostratigraphicUnit'], ['mni','Measurement'] // Note: Measurement is not in schema yet
  ]);
  for (const [key, val] of entityMap) {
      if (norm.includes(key)) {
          if (schema.entity_types.includes(val)) return val;
      }
  }
  return schema.entity_types.find(t => norm.includes(t.toLowerCase()));
};

export const generateFitReport = (core: PaperCore, schema: SchemaCapabilityProfile): FitReport => {
  const items = [
    ...core.study_area,
    ...core.time_interval,
    ...core.data_used.map(d => d.name),
    'occurs in','part of','has age','located in' // expected relation cues
  ];
  const covered: FitReport['covered'] = [];
  const uncovered: FitReport['uncovered'] = [];

  for (const it of items) {
    const mapped = mapToSchema(it, schema);
    if (mapped) covered.push({ item: it, maps_to: mapped });
    else uncovered.push({ item: it, reason: 'no mapping' });
  }

  const coverage = items.length > 0 ? covered.length / items.length : 1;

  const hasScope =
    covered.some(x => x.maps_to === 'Formation' || x.maps_to === 'Member' || x.maps_to === 'Locality') &&
    (core.time_interval.length === 0 || covered.some(x => x.maps_to === 'ChronostratigraphicUnit'));

  const decision = (coverage >= 0.70 && hasScope) ? 'schema_mode' : 'automated_mode';
  return { 
      covered, 
      uncovered, 
      coverage_score: Number(coverage.toFixed(2)), 
      decision,
      rationale: `Coverage is ${Math.round(coverage*100)}%. ${hasScope ? 'Critical scope elements are covered.' : 'Critical scope elements are missing.'}` 
  };
};

// --- Multi-pass and Automated Entity Extraction ---

const generateStratigraphyEntityPrompt = (cleanText: string, schema: Schema, candidates: Candidate[]): string => {
    const candidateHints = candidates.map(c => ({ name: c.name, type: c.type }));
    const geologicalConcepts = getGeologicalConcepts(schema);
    return `
You are an expert deeptime researcher. Your task is to extract geological, stratigraphic, and locational named entities from the provided text chunk.
Focus on concepts related to geology, stratigraphy, structural geology (e.g., faults, folds), sedimentology (e.g., depositional environments), and paleogeography.

Allowed entity types:
[${geologicalConcepts.join(', ')}]

Rules:
- Extract from Allowed Types: You MUST first extract entities whose type is present in the "Allowed Entity Types" list.
- Focus on Instances, Not Classes: Extract specific, named entities (e.g., "Morrison Formation", "San Juan Basin"). Do NOT extract general concepts (e.g., "formations", "basin").
- Return STRICT JSON: an array of entities with the exact schema below. No prose.

Entity schema (JSON):
[ { "name": "string", "type": "string", "confidence": 0.9, "justification": "string", "evidenceText": "string" } ]

If nothing is present, return [].

TEXT (preprocessed):
${cleanText}

CANDIDATE HINTS (optional, from regex):
${JSON.stringify(candidateHints, null, 2)}
`;
};

const generateAnatomyTaxaEntityPrompt = (cleanText: string, schema: Schema): string => {
  const biologicalConcepts = getBiologicalConcepts(schema);
  return `
You are an expert AI assistant specializing in paleontology. Your goal is to extract BIOLOGICAL entities.
Focus on fossils, taxa, and biological specimens.

Valid Biological Entity Types:
[${biologicalConcepts.join(', ')}]

Output Format:
Your output MUST be a single, valid JSON object with a key 'entities'.
- For each entity, provide a 'name', its assigned 'type' from the list above, a 'confidence' score (0.0 to 1.0), and a brief 'justification'.

Now, process the following document text and extract all relevant biological entities.

--- DOCUMENT START ---
${cleanText}
--- DOCUMENT END ---
  `;
};

const generateAutomatedEntityPrompt = (cleanText: string, schema: Schema): string => {
    const allConcepts = getAllConcepts(schema);
    return `
You are an ontologist and knowledge engineer building a knowledge graph for deep-time research (geology, paleontology, structural geology, sedimentology). Your goal is to comprehensively extract ALL potential named entities (specific nouns and noun phrases) from the text.

Extraction & Typing Process:
1. Extract Comprehensively: Identify all specific nouns and noun phrases representing key concepts (formations, locations, fossils, measurements, events, etc.).
2. Assign a Type: For each entity, you MUST assign a type by following these rules:
    a. Prioritize Existing Types: First, try to assign a type from the "Existing Schema Types" list.
    b. Propose New Types When Necessary: If no existing type is a good fit, propose a NEW, sensible, PascalCase type.
3.  Principles for New Types:
    - A new type must be a general category (e.g., 'TectonicEvent'), not the name of the instance itself.
    - Good examples: 'DepositionalSequence', 'GeochemicalMarker', 'VolcanicAshBed'.
    - Bad examples: 'TheGreatUnconformity', 'K-PgBoundaryEvent' (these are entity names, not types).

CRITICAL: Extract comprehensively. Do not miss important geological formations, tectonic settings, depositional environments, structural features, locations, fossils, measurements, or processes.

Existing Schema Types:
[${allConcepts.join(', ')}]

Return STRICT JSON: an array of entities with the schema below. No prose.

Entity schema (JSON):
[
  {
    "name": "string",
    "type": "string",
    "confidence": 0.9,
    "justification": "string",
    "evidenceText": "string"
  }
]

TEXT:
${cleanText}
`;
};


export const extractEntities = async (
    provider: LLMProvider,
    apiKey: string,
    documentText: string,
    schema: Schema,
    modelName: string,
    extractionMode: ExtractionMode,
    abortSignal: AbortSignal
): Promise<{ entities: Omit<ExtractedEntity, 'selected'>[], suggestions: SchemaSuggestion[] }> => {
    if (provider !== 'gemini' || !apiKey) throw new Error('Only Gemini provider is supported for this operation.');

    const { cleanText, candidates } = preprocessText(documentText);
    const ai = new GoogleGenAI({ apiKey });

    try {
        if (extractionMode === 'automated_mode') {
            const prompt = generateAutomatedEntityPrompt(cleanText, schema);
            const response = await ai.models.generateContent({
                model: modelName, contents: prompt,
                config: {
                    temperature: 0, responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY, items: {
                            type: Type.OBJECT, properties: {
                                name: { type: Type.STRING }, type: { type: Type.STRING }, confidence: { type: Type.NUMBER },
                                justification: { type: Type.STRING }, evidenceText: { type: Type.STRING },
                            }, required: ["name", "type", "confidence", "justification", "evidenceText"]
                        }
                    }
                }
            });
            if (abortSignal.aborted) throw new Error("Aborted");
            return { entities: JSON.parse(response.text), suggestions: [] };
        }

        // --- Schema Mode ---
        // Pass 1: Stratigraphy
        const stratPrompt = generateStratigraphyEntityPrompt(cleanText, schema, candidates);
        const stratResponse = await ai.models.generateContent({
            model: modelName, contents: stratPrompt,
            config: {
                temperature: 0, responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY, items: {
                        type: Type.OBJECT, properties: {
                            name: { type: Type.STRING }, type: { type: Type.STRING }, confidence: { type: Type.NUMBER },
                            justification: { type: Type.STRING }, evidenceText: { type: Type.STRING },
                        }, required: ["name", "type", "confidence", "justification", "evidenceText"]
                    }
                }
            }
        });
        if (abortSignal.aborted) throw new Error("Aborted");
        const stratEntities = JSON.parse(stratResponse.text);

        // Pass 2: Anatomy, Taxa
        const anatomyPrompt = generateAnatomyTaxaEntityPrompt(cleanText, schema);
        const anatomyResponse = await ai.models.generateContent({
             model: modelName, contents: anatomyPrompt,
             config: {
                temperature: 0, responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT, properties: {
                        entities: {
                            type: Type.ARRAY, items: {
                                type: Type.OBJECT, properties: {
                                    name: { type: Type.STRING }, type: { type: Type.STRING }, confidence: { type: Type.NUMBER }, justification: { type: Type.STRING }
                                }, required: ["name", "type", "confidence", "justification"]
                            }
                        }
                    }, required: ["entities"]
                }
            }
        });
        if (abortSignal.aborted) throw new Error("Aborted");
        const anatomyResult = JSON.parse(anatomyResponse.text);

        return { entities: [...stratEntities, ...anatomyResult.entities], suggestions: [] };

    } catch (e) {
         if (e instanceof Error) {
            if (e.message === "Aborted") console.log("Entity extraction intentionally aborted.");
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) throw new Error("429 - Rate limit exceeded.");
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during entity extraction.");
        }
    }
};

// --- Relationship Extraction ---

const generateRelationshipPrompt = (documentText: string, schema: Schema, entities: ExtractedEntity[]): string => {
  const predicateReference = generatePredicateReference(schema.predicates.definitions);
  const typedEntitiesString = entities.map(e => `- "${e.name}" (type: ${e.type})`).join('\n');

  return `
You are an expert AI assistant specializing in geological knowledge extraction with a strict adherence to a provided ontology.
Your task is to extract information as Subject-Predicate-Object triples based on the provided text and a list of typed entities.

**CRITICAL INSTRUCTIONS:**
1.  **USE ONLY PROVIDED ENTITIES**: You MUST ONLY use the entities from the "Typed Entity List" for the subjects and objects of your triples.
2.  **STRICTLY ADHERE TO ONTOLOGY**: For each triple, consult the "Predicate Reference Guide". The type of your subject MUST be in the predicate's "Domain" list, and the type of your object MUST be in the predicate's "Range" list. An empty domain/range means any type is allowed.
3.  **NO DOMAIN/RANGE VIOLATIONS**: If a relationship seems plausible but violates the domain/range constraints, DO NOT extract it.
4.  **EVIDENCE IS MANDATORY**: Every triple must be supported by a direct quote from the text.

**Typed Entity List:**
${typedEntitiesString}

**Predicate Reference Guide:**
${predicateReference}

**Output Format:**
Return a single JSON object with a "triples" key, containing an array of triple objects.

--- DOCUMENT START ---
${documentText}
--- DOCUMENT END ---
  `;
};

const generateAutomatedRelationshipPrompt = (cleanText: string, schema: Schema, entities: ExtractedEntity[]): string => {
    const typedEntitiesString = entities.map(e => `- "${e.name}" (type: ${e.type})`).join('\n');
    return `
You are an expert AI assistant creating a knowledge graph for deeptime research. Your task is to extract meaningful relationships between the provided entities as Subject-Predicate-Object triples.
CRITICAL INSTRUCTIONS:
1. USE ONLY PROVIDED ENTITIES: You MUST ONLY use the entities from the "Typed Entity List" for subjects and objects.
2. PREFER EXISTING PREDICATES: First, try to use a predicate from the "Existing Predicates" list.
3. INVENT WHEN NECESSARY: If a clear, important relationship exists in the text that is NOT well-represented by the existing predicates, you MAY invent a new, concise, self-explanatory predicate in camelCase (e.g., 'hasDepositionalContext', 'indicatesTectonicEvent').
4. EVIDENCE IS MANDATORY: Every triple must be supported by a direct quote.

Typed Entity List:
${typedEntitiesString}

Existing Predicates Reference:
${generatePredicateReference(schema.predicates.definitions)}

Return STRICT JSON: an array of triples.

Triple Schema (JSON):
[ { "subject": "string", "predicate": "string", "object": "string", "evidenceText": "string", "confidence": 0.9, "justification": "string" } ]

TEXT:
${cleanText}
`;
};

export const extractRelationships = async (
    provider: LLMProvider,
    apiKey: string,
    documentText: string,
    schema: Schema,
    entities: ExtractedEntity[],
    modelName: string,
    extractionMode: ExtractionMode,
    abortSignal: AbortSignal
): Promise<Omit<Triple, 'source'>[]> => {
    if (provider !== 'gemini' || !apiKey) throw new Error('Only Gemini provider is supported.');
    
    const { cleanText } = preprocessText(documentText);
    const prompt = extractionMode === 'automated_mode'
        ? generateAutomatedRelationshipPrompt(cleanText, schema, entities)
        : generateRelationshipPrompt(cleanText, schema, entities);
    
    const ai = new GoogleGenAI({ apiKey });

     try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        triples: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    subject: { type: Type.STRING },
                                    predicate: { type: Type.STRING },
                                    object: { type: Type.STRING },
                                    evidenceText: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER },
                                    justification: { type: Type.STRING }
                                },
                                required: ["subject", "predicate", "object", "evidenceText", "confidence", "justification"]
                            }
                        }
                    },
                    required: ["triples"]
                }
            }
        });

        if (abortSignal.aborted) throw new Error("Aborted");
        
        const result = JSON.parse(response.text);
        return result.triples || [];

    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "Aborted") console.log("Relationship extraction intentionally aborted.");
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) throw new Error("429 - Rate limit exceeded.");
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during relationship extraction.");
        }
    }
};

// --- Relationship Suggestion ---

const generateRelationshipSuggestionPrompt = (documentText: string, schema: Schema, entities: ExtractedEntity[]): string => {
  const existingPredicates = Object.keys(schema.predicates.definitions).join(', ');
  const typedEntitiesString = entities.map(e => `- "${e.name}" (type: ${e.type})`).join('\n');
  const { cleanText } = preprocessText(documentText);

  return `
    You are a knowledge graph ontologist. Your task is to analyze the provided text for meaningful relationships between the given typed entities that are NOT captured by the existing predicate schema.
    Suggest new, general-purpose predicates that could be added to the schema.

    Existing Predicates (DO NOT suggest these):
    [${existingPredicates}]

    Typed Entity List:
    ${typedEntitiesString}

    Output Format:
    Your output MUST be a single, valid JSON object with a top-level key "suggestions".
    - The value of "suggestions" must be an array of suggestion objects.
    - Each suggestion object represents one new predicate suggestion.
    - For each suggestion, provide the name, a justification, and an example triple from the text using entities from the list.

    Now, analyze the following text for novel relationship suggestions:

    --- DOCUMENT START ---
    ${cleanText}
    --- DOCUMENT END ---
  `;
};

export const suggestRelationships = async (
    provider: LLMProvider,
    apiKey: string,
    documentText: string,
    schema: Schema,
    entities: ExtractedEntity[],
    modelName: string,
    abortSignal: AbortSignal
): Promise<SchemaSuggestion[]> => {
    if (provider !== 'gemini' || !apiKey) {
        return [];
    }

    const prompt = generateRelationshipSuggestionPrompt(documentText, schema, entities);
    const ai = new GoogleGenAI({ apiKey });

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING, enum: ["predicate"] },
                                    name: { type: Type.STRING },
                                    justification: { type: Type.STRING },
                                    exampleTriple: {
                                        type: Type.OBJECT,
                                        properties: {
                                            subject: { type: Type.STRING },
                                            object: { type: Type.STRING }
                                        },
                                        required: ["subject", "object"]
                                    }
                                },
                                required: ["type", "name", "justification", "exampleTriple"]
                            }
                        }
                    },
                    required: ["suggestions"]
                }
            }
        });

        if (abortSignal.aborted) {
            throw new Error("Aborted");
        }
        
        const result = JSON.parse(response.text);
        return result.suggestions || [];

    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "Aborted") console.log("Suggestion generation intentionally aborted.");
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                throw new Error("429 - Rate limit exceeded.");
            }
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during suggestion generation.");
        }
    }
};

// --- NEW: Turbo Mode Extraction ---

const generateTurboPrompt = (documentText: string, schema: Schema, candidates: Candidate[]): string => {
  const allConcepts = getAllConcepts(schema);
  const predicateReference = generatePredicateReference(schema.predicates.definitions);
  const candidateHints = candidates.map(c => ({ name: c.name, type: c.type }));
  
  return `
    You are a highly efficient knowledge extraction engine with a strict adherence to a provided ontology. Your task is to perform a two-step process in a single pass using pre-processed text and candidate hints:
    1.  **Entity Identification & Typing**: First, read the entire document text and identify all specific *instances* of concepts. For each entity, you MUST assign a 'type' from the list of "Valid Entity Types". All entities MUST be nouns or noun phrases. Use the Candidate Hints to guide your extraction of stratigraphic entities.
    2.  **Triple Extraction with Schema Enforcement**: Second, using ONLY the typed entities you just identified and the predicates from the "Predicate Reference Guide", extract all possible Subject-Predicate-Object triples. The type of your chosen subject MUST be in the predicate's "Domain" list, and the type of your chosen object MUST be in the predicate's "Range" list.

    Valid Entity Types:
    [${allConcepts.join(', ')}]

    Predicate Reference Guide:
    ${predicateReference}
    
    CANDIDATE HINTS (optional, from regex):
    ${JSON.stringify(candidateHints, null, 2)}

    Output Format:
    Your output MUST be a single, valid JSON object.
    - The JSON object must have two top-level keys: "entities" and "triples".
    - Each entity object in the "entities" array must have a 'name', 'type', 'confidence' score (0.0-1.0), and a brief 'justification'.
    - Each triple object in the "triples" array must have "subject", "predicate", "object", "evidenceText" (a direct quote), "confidence" score (0.0-1.0), and a brief "justification".
    - Ensure all string values within the JSON are properly escaped.

    Now, process the following document text and generate the complete JSON output:

    --- DOCUMENT START ---
    ${documentText}
    --- DOCUMENT END ---
  `;
};


export const extractInTurboMode = async (
    provider: LLMProvider,
    apiKey: string,
    documentText: string,
    schema: Schema,
    modelName: string,
    abortSignal: AbortSignal
): Promise<TurboOutput> => {
     if (provider !== 'gemini') {
        throw new Error(`${provider} is not yet supported. Please select Google Gemini.`);
    }
     if (!apiKey) {
        throw new Error('Gemini API key is missing.');
    }

    const { cleanText, candidates } = preprocessText(documentText);
    const prompt = generateTurboPrompt(cleanText, schema, candidates);
    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        entities: {
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
                        },
                        triples: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    subject: { type: Type.STRING },
                                    predicate: { type: Type.STRING },
                                    object: { type: Type.STRING },
                                    evidenceText: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER },
                                    justification: { type: Type.STRING }
                                },
                                required: ["subject", "predicate", "object", "evidenceText", "confidence", "justification"]
                            }
                        }
                    },
                    required: ["entities", "triples"]
                }
            }
        });
        
        if (abortSignal.aborted) {
            throw new Error("Aborted");
        }

        const result = JSON.parse(response.text);

        if (result.entities && Array.isArray(result.entities) && result.triples && Array.isArray(result.triples)) {
            return result;
        }
        throw new Error("Invalid structure in AI response for turbo extraction.");

    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "Aborted") {
                console.log("Turbo extraction intentionally aborted.");
                return { entities: [], triples: [] };
            }
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                throw new Error("429 - Rate limit exceeded.");
            }
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during turbo extraction.");
        }
    }
};
