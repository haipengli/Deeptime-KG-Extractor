

import { GoogleGenAI, Type, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import type { DocumentChunk, LlmConfig } from '../types';

export interface DocumentStructure {
    outline: { title: string; level: 1 | 2 | 3; start: number; end: number }[];
    chunks: {
        id: string;
        sectionPath: string[];
        kind: 'body' | 'caption' | 'table' | 'methods' | 'references';
        start: number;
        end: number;
        reason: string;
    }[];
}

const getGeminiClient = (apiKey: string) => {
    if (!apiKey) {
        throw new Error("Gemini API key is not provided.");
    }
    return new GoogleGenAI({ apiKey });
}

// Helper to make generateContent abortable, as the SDK doesn't support it natively.
const generateContentWithAbort = async (
    ai: GoogleGenAI,
    params: GenerateContentParameters,
    signal: AbortSignal
): Promise<GenerateContentResponse> => {
    if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }
    // Race the API call with a promise that rejects on abort.
    return new Promise(async (resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });

        try {
            const result = await ai.models.generateContent(params);
            signal.removeEventListener('abort', onAbort);
            resolve(result);
        } catch (error) {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        }
    });
};

const fillTemplate = (template: string, data: Record<string, any>): string => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
};

export const llmChunkDocument = async (
    rawText: string,
    llmConfig: LlmConfig,
    promptTemplate: string,
    abortSignal: AbortSignal
): Promise<DocumentChunk[]> => {
    if (llmConfig.provider !== 'gemini') {
        throw new Error(`Provider "${llmConfig.provider}" is not yet supported.`);
    }
    const ai = getGeminiClient(llmConfig.apiKey);
    const prompt = fillTemplate(promptTemplate, { rawText: rawText.slice(0, 30000) });

    try {
        const response = await generateContentWithAbort(ai, {
            model: llmConfig.model,
            contents: prompt,
            config: {
                temperature: llmConfig.temperature,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        outline: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    level: { type: Type.INTEGER },
                                    start: { type: Type.INTEGER },
                                    end: { type: Type.INTEGER },
                                },
                                required: ["title", "level", "start", "end"]
                            }
                        },
                        chunks: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    sectionPath: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    kind: { type: Type.STRING },
                                    start: { type: Type.INTEGER },
                                    end: { type: Type.INTEGER },
                                    reason: { type: Type.STRING }
                                },
                                required: ["id", "sectionPath", "kind", "start", "end", "reason"]
                            }
                        }
                    },
                    required: ["outline", "chunks"]
                }
            }
        }, abortSignal);
        
        const structure = JSON.parse(response.text) as DocumentStructure;
        
        return structure.chunks.map(chunk => ({
            ...chunk,
            content: rawText.substring(chunk.start, chunk.end),
            selected: true,
        }));
        
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e;
        if (e instanceof Error) {
            if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                throw new Error("429 - Rate limit exceeded during structuring.");
            }
            throw e;
        } else {
            throw new Error("An unknown error occurred during document structuring.");
        }
    }
};