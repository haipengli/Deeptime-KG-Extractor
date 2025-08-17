
import { GoogleGenAI, Type } from "@google/genai";
import type { Triple, Schema, LLMProvider, SchemaSuggestion, TurboOutput, ExtractedEntity } from '../types';

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

const getAllConcepts = (schema: Schema): string[] => {
    const observable = Object.values(schema.observableAxis).flatMap(c => flattenConcepts(c.concepts));
    const interpretive = Object.values(schema.interpretiveAxis).flatMap(c => flattenConcepts(c.concepts));
    return [...new Set([...observable, ...interpretive])];
};


const generatePredicateReference = (schema: Schema): string => {
    return Object.entries(schema.predicates.definitions)
        .map(([name, def]) => {
            return `
- Predicate: "${name}"
  - Description: ${def.description}
  - Valid Subject Types (Domain): [${def.domain.join(', ') || 'Any'}]
  - Valid Object Types (Range): [${def.range.join(', ') || 'Any'}]
`;
        }).join('');
};


// --- Step 1: Entity Extraction with Suggestions ---

const generateEntityPrompt = (documentText: string, schema: Schema): string => {
  const allConcepts = getAllConcepts(schema);

  return `
    You are an expert AI assistant specializing in geological and paleontological knowledge extraction. Your goal is to extract specific *instances* of the concepts defined in the schema from scientific texts. All extracted entities MUST be nouns or noun phrases.

    Your task is to identify and list all potential named entities from the text and assign a type to each one, ensuring you capture a balanced view of all entity types present, from geological formations to biological taxa.

    You will perform two types of extraction simultaneously:
    1.  **Existing Entities**: Identify entities that are specific instances of the concepts in the provided schema. For each entity, you MUST assign a 'type' from the list of "Valid Entity Types".
        - **Geological Example**: If you find 'Cedar Mountain Formation', its type should be 'Formation'.
        - **Paleontological Example**: If you find 'Utahraptor', its type should be 'Taxon'.
        - **Specimen Example**: If you find a reference to a specific fossil bone, its type should be 'Specimen'.
    2.  **New Entity Suggestions**: Identify important, abstract, high-level domain-specific concepts that are NOT in the schema but should be. For example, 'Depositional Sequence' would be a good suggestion if it's a recurring theme not in the schema.

    Valid Entity Types:
    [${allConcepts.join(', ')}]

    Output Format:
    Your output MUST be a single, valid JSON object conforming to the required schema. It should contain two keys: 'entities' (an array of entity objects) and 'suggestions' (an array of suggestion objects).
    - For each entity, provide a 'name', its assigned 'type' from the list above, a 'confidence' score (0.0 to 1.0), and a brief 'justification'.
    - 'justification' should explain why the text supports the extraction and typing.

    Now, process the following document text and extract all relevant entities and suggestions.

    --- DOCUMENT START ---
    ${documentText}
    --- DOCUMENT END ---
  `;
};

export const extractEntities = async (
    provider: LLMProvider,
    apiKey: string,
    documentText: string,
    schema: Schema,
    modelName: string,
    abortSignal: AbortSignal
): Promise<{ entities: Omit<ExtractedEntity, 'selected'>[], suggestions: SchemaSuggestion[] }> => {
    if (provider !== 'gemini') {
        throw new Error(`${provider} is not yet supported. Please select Google Gemini.`);
    }
    if (!apiKey) {
        throw new Error('Gemini API key is missing.');
    }

    const prompt = generateEntityPrompt(documentText, schema);
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
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    categorySuggestion: { type: Type.STRING },
                                    justification: { type: Type.STRING }
                                },
                                required: ["name", "categorySuggestion", "justification"]
                            }
                        }
                    },
                    required: ["entities", "suggestions"]
                }
            }
        });

        if (abortSignal.aborted) {
            throw new Error("Aborted");
        }
        
        const result = JSON.parse(response.text);
        
        const formattedSuggestions: SchemaSuggestion[] = result.suggestions.map((s: any) => ({
            type: 'entity',
            name: s.name,
            categorySuggestion: s.categorySuggestion,
            justification: s.justification,
        }));

        return { entities: result.entities, suggestions: formattedSuggestions };

    } catch (e) {
         if (e instanceof Error) {
            if (e.message === "Aborted") console.log("Entity extraction intentionally aborted.");
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                throw new Error("429 - Rate limit exceeded.");
            }
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during entity extraction.");
        }
    }
};


// --- Step 2: Relationship Extraction ---

const generateRelationshipPrompt = (documentText: string, schema: Schema, entities: ExtractedEntity[]): string => {
  const predicateReference = generatePredicateReference(schema);
  const typedEntitiesString = entities.map(e => `- "${e.name}" (type: ${e.type})`).join('\n');

  return `
    You are an expert AI assistant specializing in geological knowledge extraction with a strict adherence to a provided ontology.
    Your task is to extract information as Subject-Predicate-Object triples based on the provided text and a list of typed entities.

    **CRITICAL INSTRUCTIONS:**
    1.  **USE ONLY PROVIDED ENTITIES**: You MUST ONLY use the entities from the "Typed Entity List" for the subjects and objects of your triples. Do not invent new entities.
    2.  **STRICTLY ADHERE TO ONTOLOGY**: For each triple you generate, you MUST consult the "Predicate Reference Guide". The type of your chosen subject MUST be present in the predicate's "Domain" list, and the type of your chosen object MUST be present in the predicate's "Range" list. If a domain or range is empty (i.e., 'Any'), it can match any entity type.
    3.  **NO DOMAIN/RANGE VIOLATIONS**: If a relationship seems plausible but violates the domain/range constraints for a predicate, DO NOT extract it. Adherence to the schema is more important than capturing every possible relationship.
    4.  **EVIDENCE IS MANDATORY**: Every triple must be supported by a direct quote from the text, which you will provide in the "evidenceText" field.

    **Typed Entity List:**
    ${typedEntitiesString}

    **Predicate Reference Guide:**
    ${predicateReference}

    **Output Format:**
    Your output MUST be a single, valid JSON object containing a single top-level key "triples".
    - The value of "triples" must be an array of triple objects.
    - Each triple object must have "subject", "predicate", "object", "evidenceText", a "confidence" score (0.0-1.0), and a brief "justification" for why the triple is valid according to the text and the ontology.
    - Ensure all string values are properly escaped.
    
    Now, process the following document text and extract the triples, following all instructions precisely.

    --- DOCUMENT START ---
    ${documentText}
    --- DOCUMENT END ---
  `;
};

export const extractRelationships = async (
    provider: LLMProvider,
    apiKey: string,
    documentText: string,
    schema: Schema,
    entities: ExtractedEntity[],
    modelName: string,
    abortSignal: AbortSignal
): Promise<Omit<Triple, 'source'>[]> => {
    if (provider !== 'gemini') {
        throw new Error(`${provider} is not yet supported. Please select Google Gemini.`);
    }
     if (!apiKey) {
        throw new Error('Gemini API key is missing.');
    }

    const prompt = generateRelationshipPrompt(documentText, schema, entities);
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

        if (abortSignal.aborted) {
            throw new Error("Aborted");
        }
        
        const result = JSON.parse(response.text);
        return result.triples || [];

    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "Aborted") console.log("Relationship extraction intentionally aborted.");
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                throw new Error("429 - Rate limit exceeded.");
            }
            throw e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e;
        } else {
            throw new Error("An unknown error occurred during relationship extraction.");
        }
    }
};


// --- Step 3: Relationship Suggestion ---

const generateRelationshipSuggestionPrompt = (documentText: string, schema: Schema, entities: ExtractedEntity[]): string => {
  const existingPredicates = Object.keys(schema.predicates.definitions).join(', ');
  const typedEntitiesString = entities.map(e => `- "${e.name}" (type: ${e.type})`).join('\n');

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
    ${documentText}
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

const generateTurboPrompt = (documentText: string, schema: Schema): string => {
  const allConcepts = getAllConcepts(schema);
  const predicateReference = generatePredicateReference(schema);
  
  return `
    You are a highly efficient knowledge extraction engine with a strict adherence to a provided ontology. Your task is to perform a two-step process in a single pass:
    1.  **Entity Identification & Typing**: First, read the entire document text and identify all specific *instances* of concepts. For each entity, you MUST assign a 'type' from the list of "Valid Entity Types". All entities MUST be nouns or noun phrases.
    2.  **Triple Extraction with Schema Enforcement**: Second, using ONLY the typed entities you just identified and the predicates from the "Predicate Reference Guide", extract all possible Subject-Predicate-Object triples. The type of your chosen subject MUST be in the predicate's "Domain" list, and the type of your chosen object MUST be in the predicate's "Range" list.

    Valid Entity Types:
    [${allConcepts.join(', ')}]

    Predicate Reference Guide:
    ${predicateReference}

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

    const prompt = generateTurboPrompt(documentText, schema);
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