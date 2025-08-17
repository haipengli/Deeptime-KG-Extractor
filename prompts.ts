
import type { PromptCollection } from './types';

export const DEFAULT_PROMPTS: PromptCollection = {
    DOCUMENT_STRUCTURE: {
        name: 'Document Structuring',
        description: 'Parses raw text into a structured outline and logical chunks for processing.',
        activeVersion: 1,
        versions: [{
            version: 1,
            date: '2024-01-01',
            template: `You are an expert academic document parser. Your task is to analyze the raw text of a scientific paper and segment it into a structured JSON output, consisting of a high-level outline and detailed content chunks.

Return STRICT JSON with the following schema, and no additional prose.
{
  "outline": [ { "title": "string", "level": 1|2|3, "start": "integer", "end": "integer" } ],
  "chunks": [ { "id": "string", "sectionPath": ["string"], "kind": "body"|"caption"|"table"|"methods"|"references", "start": "integer", "end": "integer", "reason": "string" } ]
}

PRIMARY DIRECTIVE: Your most important goal is to preserve the semantic integrity of the paper's logical sections.
- A single, continuous "Methodology" section in the source text must NOT be split into multiple chunks with the same sectionPath. It should be one chunk.
- The same applies to other core sections like "Introduction", "Results", "Discussion", and "Conclusion".
- Only split a major section if it is exceptionally long (over 10,000 characters) AND contains clear, distinct sub-headings.

Additional Rules:
- Chunk size should be secondary to logical coherence.
- Chunks for tables and their captions must be separate and marked with kind="table" or kind="caption".
- sectionPath should reflect the hierarchy from the outline. For a subsection "2.1 Data analysis" under "2. Methodology", the path would be ["Methodology", "Data analysis"].

Raw Text:
{{rawText}}
`
        }]
    },
    PAPER_CORE_EXTRACTION: {
        name: 'Paper Core Extraction',
        description: 'Extracts the key questions, data, scope, and results from a paper\'s abstract.',
        activeVersion: 1,
        versions: [{
            version: 1,
            date: '2024-01-01',
            template: `You are a scientific reader. From the ABSTRACT only, extract the paper's core:
- questions (what is being asked),
- data_used (what evidence is analyzed),
- study_area (formations, members, basins, localities),
- time_interval (geologic time terms),
- methods,
- key_results (1–3 short bullet claims).
Return STRICT JSON matching the PaperCore schema. No extra fields.

ABSTRACT (preprocessed):
{{abstractText}}
SOURCE: page 1`
        }]
    },
    SCHEMA_ENTITY_EXTRACTION: {
        name: 'Schema-mode Entity Extraction',
        description: 'Extracts all named entities based on the full schema.',
        activeVersion: 1,
        versions: [{
            version: 1,
            date: '2024-01-01',
            template: `GUIDANCE (from abstract): {{guidance}}
You are an expert deeptime researcher. Extract all relevant geological, stratigraphic, locational, and biological named entities from the text.
Allowed Entity Types: [{{all_concepts}}]
Rules:
- Extract specific instances (e.g., "Morrison Formation", "Tyrannosaurus rex"), not general concepts.
- Use the provided candidate hints to guide stratigraphy extraction.
- Return STRICT JSON array of entities: [{ "name": "string", "type": "string", "confidence": number, "justification": "string" }]. If none are found, return an empty array [].
TEXT:
{{text}}
STRATIGRAPHY CANDIDATE HINTS (for geological units):
{{candidate_hints}}`
        }]
    },
    AUTOMATED_ENTITY_EXTRACTION: {
        name: 'Automated Entity Extraction',
        description: 'Extracts all potential entities and proposes new types if they don\'t fit the schema.',
        activeVersion: 1,
        versions: [{
            version: 1,
            date: '2024-01-01',
            template: `GUIDANCE (from abstract): {{guidance}}
You are an ontologist building a knowledge graph for deep-time research. Comprehensively extract ALL potential named entities.
Process:
1. Extract all specific nouns/phrases for key concepts.
2. Assign a type: Prioritize an existing type, or propose a NEW PascalCase type if no good fit exists.
Existing Schema Types: [{{schema_concepts}}]
Return STRICT JSON of schema below. No prose.
{"entities": [ { "name": "string", "type": "string", "confidence": number, "justification": "string" } ], "new_types": [ { "name": "string", "definition": "string", "closest_parent": "string|null", "examples": ["string"] } ]}
TEXT:
{{text}}`
        }]
    },
    SCHEMA_RELATIONSHIP_EXTRACTION: {
        name: 'Schema-mode Relationship Extraction',
        description: 'Extracts triples strictly adhering to the provided schema and entity list.',
        activeVersion: 1,
        versions: [{
            version: 1,
            date: '2024-01-01',
            template: `GUIDANCE (from abstract): {{guidance}}
You are an expert AI specializing in geological knowledge extraction with strict ontology adherence.
Task: Extract Subject-Predicate-Object triples.
CRITICAL RULES:
1. USE ONLY PROVIDED ENTITIES: Subjects and objects MUST be from the "Typed Entity List".
2. STRICTLY ADHERE TO ONTOLOGY: Subject/object types must match the predicate's Domain/Range from the "Predicate Reference Guide".
3. EVIDENCE IS MANDATORY: Every triple needs a direct quote.
Typed Entity List:
{{typed_entity_list}}
Predicate Reference Guide:
{{predicate_reference}}
Output Format: Return JSON: { "triples": [...] }.
DOCUMENT:
{{document}}`
        }]
    },
    AUTOMATED_RELATIONSHIP_EXTRACTION: {
        name: 'Automated Relationship Extraction',
        description: 'Extracts triples using existing entities and proposes new predicates if needed.',
        activeVersion: 1,
        versions: [{
            version: 1,
            date: '2024-01-01',
            template: `GUIDANCE (from abstract): {{guidance}}
You are an expert AI creating a knowledge graph for deeptime research. Extract meaningful relationships as Subject-Predicate-Object triples.
RULES:
1. USE ONLY PROVIDED ENTITIES.
2. PREFER EXISTING PREDICATES. If no good fit, you MAY invent a new, concise, camelCase predicate.
3. EVIDENCE IS MANDATORY.
Typed Entity List:
{{typed_entity_list}}
Existing Predicates Reference:
{{predicate_reference}}
Return STRICT JSON of schema below:
{"triples": [ { "subject": string, "predicate": string, "object": string, "evidenceText": string, "confidence": number, "justification": string } ], "new_predicates": [ { "name": string, "description": string, "domain": [string], "range": [string], "example": { "subject": string, "object": string, "evidenceText": string } } ]}
TEXT:
{{text}}`
        }]
    },
}
