import { GoogleGenAI, Type } from "@google/genai";
import type { Triple, Schema, LLMProvider, SchemaSuggestion, TurboOutput } from '../types';

// --- Utility Functions ---

const serializeConcepts = (concepts: any, level = 0): string => {
  if (Array.isArray(concepts)) {
    return concepts.map(concept => {
      if (typeof concept === 'string') return concept;
      if (typeof concept === 'object' && concept !== null) {
        const key = Object.keys(concept)[0];
        const values = concept[key];
        return `${key}: (${serializeConcepts(values, level + 1)})`;
      }
      return '';
    }).join(', ');
  }
  if (typeof concepts === 'object' && concepts !== null) {
    return Object.entries(concepts).map(([key, value]) =>
      `\n${' '.repeat(level * 2)}- ${key}: ${serializeConcepts(value, level + 1)}`
    ).join('');
  }
  return '';
};

const serializeAxis = (axis: Record<string, { concepts: any }>): string => {
  return Object.entries(axis).map(([category, data]) =>
    `  - ${category}: ${serializeConcepts(data.concepts)}`
  ).join('\n');
};

const getVisibleSchema = (schema: Schema): string => `
    Observable Axis (Direct Observations):
${serializeAxis(schema.observableAxis)}

    Interpretive Axis (Conclusions & Inferences):
${serializeAxis(schema.interpretiveAxis)}
`;


// --- Step 1: Entity Extraction with Suggestions ---

const generateEntityPrompt = (documentText: string, schema: Schema): string => {
  const schemaSummary = getVisibleSchema(schema);
  const observableCategories = Object.keys(schema.observableAxis).join(', ');
  const interpretiveCategories = Object.keys(schema.interpretiveAxis).join(', ');

  return `
    You are an expert AI assistant specializing in geological knowledge extraction. Your goal is to extract specific *instances* of the concepts defined in the schema. All extracted entities MUST be nouns or noun phrases.
    Your task is to identify and list all potential named entities from the text.
    You will perform two types of extraction simultaneously:
    1.  **Existing Entities**: Identify entities that are specific instances of the concepts in the provided schema. For example, if the schema has a concept 'GeologicUnit', you should extract specific names like 'Lingshui Formation' or 'Yinggehai Formation', not the general term 'Formation' itself.
    2.  **New Entity Suggestions**: Identify important, abstract, high-level domain-specific concepts that are NOT in the schema but should be. For example, 'Depositional Sequence' would be a good suggestion if it's a recurring theme not in the schema. 'Sequence A' would be a bad suggestion as it's an instance.

    Schema of Concepts to look for:
    ${schemaSummary}

    Output Format:
    Your output MUST be a single, valid JSON object conforming to the required schema. It should contain two keys: 'entities' (an array of strings) and 'suggestions' (an array of suggestion objects).

    - 'categorySuggestion' for new suggestions MUST be one of: ${observableCategories}, ${interpretiveCategories}.
    - 'justification' should be a brief explanation of why it's a good suggestion.

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
): Promise<{ entities: string[], suggestions: SchemaSuggestion[] }> => {
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
                        entities: { type: Type.ARRAY, items: { type: Type.STRING } },
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

const generateRelationshipPrompt = (documentText: string, schema: Schema, entities: string[]): string => {
  const predicateSummary = Object.entries(schema.predicates.predicateCategories)
    .map(([category, predicates]) => `  - ${category}: ${predicates.join(', ')}`)
    .join('\n');

  return `
    You are an expert AI assistant specializing in geological knowledge extraction.
    Your task is to extract information as Subject-Predicate-Object triples based on the provided text.
    You MUST ONLY use the entities from the "Entity List" for the subjects and objects of your triples.
    You MUST strictly adhere to the provided schema of predicates.

    CRITICAL RULE: The 'subject' and 'object' must be nouns or complete noun phrases that represent distinct geological entities. Do NOT extract adjectives, verbs, or adverbs as entities.
    For example, from the phrase 'The formation contains igneous and sedimentary rocks', a bad triple would be \`(Sedimentary, hasProperty, Igneous)\`. A good triple would be \`(Rock, hasProperty, Sedimentary)\` if 'Sedimentary' is treated as a property, or better, \`(Formation, contains, Igneous Rock)\`. Focus on extracting the full, meaningful noun phrase.

    Entity List:
    [${entities.map(e => `"${e}"`).join(', ')}]

    Predicate Schema:
    ${predicateSummary}

    Output Format:
    Your output MUST be a single, valid JSON object containing a single top-level key "triples".
    - The value of "triples" must be an array of triple objects.
    - Each triple object must have four keys: "subject" (string), "predicate" (string), "object" (string), and "evidenceText" (a direct quote from the source document).
    - CRITICAL: Ensure all string values within the JSON, especially 'evidenceText', are properly escaped (e.g., \\" for double quotes).
    
    Now, process the following document text and extract the triples:

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
    entities: string[],
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
                                    evidenceText: { type: Type.STRING }
                                },
                                required: ["subject", "predicate", "object", "evidenceText"]
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

const generateRelationshipSuggestionPrompt = (documentText: string, schema: Schema, entities: string[]): string => {
  const existingPredicates = Object.values(schema.predicates.predicateCategories).flat().join(', ');

  return `
    You are a knowledge graph expert. Your task is to analyze the provided text for meaningful relationships between the given entities that are NOT captured by the existing predicate schema.
    Suggest new, general-purpose predicates that could be added to the schema.

    Existing Predicates (DO NOT suggest these):
    [${existingPredicates}]

    Entity List:
    [${entities.map(e => `"${e}"`).join(', ')}]

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
    entities: string[],
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
  const schemaSummary = getVisibleSchema(schema);
  const predicateSummary = Object.entries(schema.predicates.predicateCategories)
    .map(([category, predicates]) => `  - ${category}: ${predicates.join(', ')}`)
    .join('\n');
  
  return `
    You are a highly efficient knowledge extraction engine. Your task is to perform a two-step process in a single pass:
    1.  **Entity Identification**: First, read the entire document text and identify all specific *instances* of concepts defined in the provided schema (e.g., 'Lingshui Formation' for the concept 'Formation'). All entities MUST be nouns or noun phrases.
    2.  **Triple Extraction**: Second, using ONLY the entities you just identified and the predicates from the schema, extract all possible Subject-Predicate-Object triples.

    Schema of Concepts to look for:
    ${schemaSummary}

    Predicate Schema:
    ${predicateSummary}

    Output Format:
    Your output MUST be a single, valid JSON object.
    - Do NOT wrap the output in a markdown block (e.g., \`\`\`json).
    - The JSON object must have two top-level keys: "entities" and "triples".
    - The value of "entities" must be an array of unique entity name strings you identified.
    - The value of "triples" must be an array of triple objects.
    - Each triple object must have four keys: "subject" (string), "predicate" (string), "object" (string), and "evidenceText" (a direct quote from the source document).
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
                        entities: { type: Type.ARRAY, items: { type: Type.STRING } },
                        triples: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    subject: { type: Type.STRING },
                                    predicate: { type: Type.STRING },
                                    object: { type: Type.STRING },
                                    evidenceText: { type: Type.STRING }
                                },
                                required: ["subject", "predicate", "object", "evidenceText"]
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