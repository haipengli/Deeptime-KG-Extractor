import { GoogleGenAI } from "@google/genai";
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
    Your output MUST be a stream of valid, complete JSON objects.
    - Do NOT wrap the output in a markdown block (e.g., \`\`\`json) or a top-level JSON array.
    - Send each JSON object as soon as it is identified.

    - For an EXISTING entity, stream a JSON object like this:
      {"entity": "Lingshui Formation"}

    - For a NEW suggested entity concept, stream a JSON object like this:
      {"newEntitySuggestion": {"name": "Seismic Facies", "categorySuggestion": "ObservationalRecord", "justification": "This term appears frequently and is a key concept for analysis but is not in the schema."}}
      - 'categorySuggestion' MUST be one of: ${observableCategories}, ${interpretiveCategories}.
      - 'justification' should be a brief explanation of why it's a good suggestion.

    Now, process the following document text and extract all relevant entities and suggestions:

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
    onEntityReceived: (entity: string) => void,
    onSuggestionReceived: (suggestion: SchemaSuggestion) => void,
    onStreamEnd: () => void,
    onError: (error: Error) => void,
    abortSignal: AbortSignal
) => {
    if (provider !== 'gemini') {
        onError(new Error(`${provider} is not yet supported. Please select Google Gemini.`));
        onStreamEnd();
        return;
    }
    if (!apiKey) {
        onError(new Error('Gemini API key is missing.'));
        onStreamEnd();
        return;
    }

    const prompt = generateEntityPrompt(documentText, schema);
    let buffer = '';
    const ai = new GoogleGenAI({ apiKey });

    try {
        const responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents: prompt,
        });

        for await (const chunk of responseStream) {
            if (abortSignal.aborted) break;

            buffer += chunk.text;
            let lastIndex = 0;
            while (true) {
                const startIndex = buffer.indexOf('{', lastIndex);
                if (startIndex === -1) break;
                
                let braceCount = 1;
                let endIndex = -1;
                let inString = false;
                
                for (let i = startIndex + 1; i < buffer.length; i++) {
                    const char = buffer[i];
                    if (char === '"' && (i === 0 || buffer[i-1] !== '\\')) inString = !inString;
                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                    }
                    if (!inString && braceCount === 0) {
                        endIndex = i;
                        break;
                    }
                }

                if (endIndex !== -1) {
                    const objectString = buffer.substring(startIndex, endIndex + 1);
                    try {
                        const item = JSON.parse(objectString);
                        if (item.entity && typeof item.entity === 'string') {
                            onEntityReceived(item.entity);
                        } else if (item.newEntitySuggestion) {
                            const sug = item.newEntitySuggestion;
                            onSuggestionReceived({
                                type: 'entity',
                                name: sug.name,
                                categorySuggestion: sug.categorySuggestion,
                                justification: sug.justification
                            });
                        }
                    } catch (e) {
                        console.warn('Could not parse potential JSON object from entity stream:', objectString);
                    }
                    lastIndex = endIndex + 1;
                } else {
                  break;
                }
            }
            if (lastIndex > 0) buffer = buffer.substring(lastIndex);
        }
    } catch (e) {
        if (abortSignal.aborted) {
            console.log("Entity stream intentionally aborted.");
        } else if (e instanceof Error) {
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                onError(new Error("429 - Rate limit exceeded."));
            } else {
                onError(e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e);
            }
        } else {
            onError(new Error("An unknown error occurred."));
        }
    } finally {
        onStreamEnd();
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
    Your output MUST be a stream of valid, complete JSON objects.
    - Each JSON object represents a single triple.
    - Do NOT wrap the output in a markdown block (e.g., \`\`\`json) or a top-level JSON array.
    - Send each JSON object as soon as it is identified.
    - For each triple, the 'evidenceText' must be a direct quote from the source document that supports the assertion.
    - CRITICAL: Ensure all string values within the JSON, especially 'evidenceText', are properly escaped (e.g., \\" for double quotes).
    - Example of a single, complete JSON object to stream:
      {"subject": "Sandstone", "predicate": "hasProperty", "object": "high porosity", "evidenceText": "The report stated, \\"the sandstone exhibited high porosity.\\""}

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
    onTripleReceived: (triple: Omit<Triple, 'source'>) => void,
    onStreamEnd: () => void,
    onError: (error: Error) => void,
    abortSignal: AbortSignal
) => {
    if (provider !== 'gemini') {
        onError(new Error(`${provider} is not yet supported. Please select Google Gemini.`));
        onStreamEnd();
        return;
    }
     if (!apiKey) {
        onError(new Error('Gemini API key is missing.'));
        onStreamEnd();
        return;
    }

    const prompt = generateRelationshipPrompt(documentText, schema, entities);
    let buffer = '';
    const ai = new GoogleGenAI({ apiKey });

     try {
        const responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents: prompt,
        });

        for await (const chunk of responseStream) {
            if (abortSignal.aborted) break;

            buffer += chunk.text;
            let lastIndex = 0;
            while (true) {
                const startIndex = buffer.indexOf('{', lastIndex);
                if (startIndex === -1) break;

                let braceCount = 0;
                let endIndex = -1;
                let inString = false;
                
                for (let i = startIndex; i < buffer.length; i++) {
                    const char = buffer[i];
                    if (char === '"' && (i === 0 || buffer[i-1] !== '\\')) inString = !inString;
                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                    }
                    if (!inString && braceCount === 0 && startIndex < i) {
                        endIndex = i;
                        break;
                    }
                }
                
                if (endIndex !== -1) {
                    const objectString = buffer.substring(startIndex, endIndex + 1);
                    try {
                        const potentialTriple = JSON.parse(objectString);
                        if (potentialTriple.subject && potentialTriple.predicate && potentialTriple.object && typeof potentialTriple.evidenceText !== 'undefined') {
                            onTripleReceived(potentialTriple);
                        }
                    } catch (e) {
                        console.warn('Could not parse potential JSON object from triple stream:', objectString);
                    }
                    lastIndex = endIndex + 1;
                } else {
                    break;
                }
            }
            if (lastIndex > 0) buffer = buffer.substring(lastIndex);
        }
    } catch (e) {
        if (abortSignal.aborted) {
            console.log("Relationship stream intentionally aborted.");
        } else if (e instanceof Error) {
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                onError(new Error("429 - Rate limit exceeded."));
            } else {
                onError(e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e);
            }
        } else {
            onError(new Error("An unknown error occurred."));
        }
    } finally {
        onStreamEnd();
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
    Your output MUST be a stream of valid, complete JSON objects.
    - Do NOT wrap the output in a markdown block or a top-level array.
    - Each JSON object represents one new predicate suggestion.
    - For each suggestion, provide the name, a justification, and an example triple from the text using entities from the list.
    - Example of a single JSON object to stream:
      {"suggestion": {"type": "predicate", "name": "erodedBy", "justification": "Captures the physical process of erosion between geological units.", "exampleTriple": {"subject": "Yinggehai Formation", "object": "Ancient River System"}}}

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
    onSuggestionReceived: (suggestion: SchemaSuggestion) => void,
    onStreamEnd: () => void,
    onError: (error: Error) => void,
    abortSignal: AbortSignal
) => {
    if (provider !== 'gemini' || !apiKey) {
        onStreamEnd(); return;
    }

    const prompt = generateRelationshipSuggestionPrompt(documentText, schema, entities);
    let buffer = '';
    const ai = new GoogleGenAI({ apiKey });

    try {
        const responseStream = await ai.models.generateContentStream({ model: modelName, contents: prompt });

        for await (const chunk of responseStream) {
            if (abortSignal.aborted) break;
            buffer += chunk.text;
            let lastIndex = 0;
            while (true) {
                const startIndex = buffer.indexOf('{', lastIndex);
                if (startIndex === -1) break;

                let braceCount = 1, endIndex = -1, inString = false;
                for (let i = startIndex + 1; i < buffer.length; i++) {
                    const char = buffer[i];
                    if (char === '"' && (i === 0 || buffer[i-1] !== '\\')) inString = !inString;
                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                    }
                    if (!inString && braceCount === 0) {
                        endIndex = i;
                        break;
                    }
                }

                if (endIndex !== -1) {
                    const objectString = buffer.substring(startIndex, endIndex + 1);
                    try {
                        const item = JSON.parse(objectString);
                        if (item.suggestion && item.suggestion.type === 'predicate') {
                            onSuggestionReceived(item.suggestion);
                        }
                    } catch (e) {
                        console.warn('Could not parse potential JSON object from suggestion stream:', objectString);
                    }
                    lastIndex = endIndex + 1;
                } else {
                    break;
                }
            }
            if (lastIndex > 0) buffer = buffer.substring(lastIndex);
        }
    } catch (e) {
        if (abortSignal.aborted) {
            console.log("Suggestion stream intentionally aborted.");
        } else if (e instanceof Error) {
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                onError(new Error("429 - Rate limit exceeded."));
            } else {
                onError(e.message.includes('API key not valid') ? new Error("The provided Gemini API key is not valid.") : e);
            }
        } else {
            onError(new Error("An unknown error occurred during suggestion generation."));
        }
    } finally {
        onStreamEnd();
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

    Example Output:
    {
      "entities": ["Lingshui Formation", "Sandstone", "high porosity"],
      "triples": [
        {
          "subject": "Lingshui Formation",
          "predicate": "contains",
          "object": "Sandstone",
          "evidenceText": "The Lingshui Formation contains thick layers of sandstone."
        },
        {
          "subject": "Sandstone",
          "predicate": "hasProperty",
          "object": "high porosity",
          "evidenceText": "The report stated, \\"the sandstone exhibited high porosity.\\""
        }
      ]
    }

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
                responseMimeType: "application/json",
            }
        });
        
        if (abortSignal.aborted) {
            throw new Error("Aborted");
        }

        const rawJson = response.text;
        const result = JSON.parse(rawJson);

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