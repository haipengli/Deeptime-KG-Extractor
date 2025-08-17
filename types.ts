

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  evidenceText: string;
  source: string;
  confidence?: number;
  justification?: string;
}

export interface ExtractedEntity {
  name: string;
  type: string;
  selected: boolean;
  confidence?: number;
  justification?: string;
}

export interface DocumentChunk {
    id: string;
    sectionPath: string[];
    kind: 'body' | 'caption' | 'table' | 'methods' | 'references';
    content: string;
    selected: boolean;
}

export interface Predicate {
  description: string;
  domain: string[];
  range: string[];
}

export interface Schema {
  meta: {
    id: string;
    purpose: string;
    version: string;
  };
  predicates: {
    predicateCategories: Record<string, string[]>;
    definitions: Record<string, Predicate>;
    alias_map: Record<string, string[]>;
  };
  observableAxis: Record<string, { concepts: any }>;
  interpretiveAxis: Record<string, any>;
  relations: Record<string, string>;
}

export enum View {
  Extractor,
  Schema,
  Prompts,
}

export type LLMProvider = 'gemini' | 'openai' | 'anthropic';

export type ExtractionStep =
  | 'ready'
  | 'queued'
  | 'parsing'
  | 'structuring'
  | 'analyzingSchemaFit'
  | 'extractingEntities'
  | 'awaitingReview' 
  | 'reviewing'
  | 'extractingRelationships'
  | 'complete'
  | 'cached'
  | 'error';

export interface TurboOutput {
    entities: Omit<ExtractedEntity, 'selected'>[];
    triples: Omit<Triple, 'source'>[];
}

export interface ProcessingStats {
  filesProcessed: number;
  entitiesFound: number;
  triplesExtracted: number;
  totalDurationSeconds: number;
  entityExtractionDuration?: number;
  relationshipExtractionDuration?: number;
  entityTypeCounts: Record<string, number>;
  predicateTypeCounts: Record<string, number>;
}

export interface PaperCore {
  questions: string[];
  data_used: { name: string; role: string; type_hint: string }[];
  study_area: string[];
  time_interval: string[];
  methods: string[];
  key_results: string[];
  evidence_spans: { quote: string; page: number | null; offset: [number, number] | null }[];
}

export interface SchemaCapabilityProfile {
  entity_types: string[];
  predicates: string[];
  type_rules: Record<string, { domain: string[]; range: string[] }>;
}

export interface FitReport {
  covered: { item: string; maps_to?: string; reason?: string }[];
  uncovered: { item: string; maps_to?: string; reason?: string }[];
  coverage_score: number;
  decision: 'schema_mode' | 'automated_mode';
  rationale: string;
}

export interface SchemaSuggestion {
  type: 'entity' | 'predicate';
  name: string;
  justification: string;
  categorySuggestion?: string;
  exampleTriple?: { subject: string; object: string; };
}

export interface SchemaProposal {
  id: string; // e.g., proposal-168...
  baseVersion: string;
  new_types: {
    name: string;
    definition: string;
    closest_parent: string | null;
    examples: string[];
  }[];
  new_predicates: {
    name: string;
    description: string;
    domain: string[];
    range: string[];
    example: {
      subject: string;
      object: string;
      evidenceText: string;
    };
  }[];
  evidence: {
    paperId: string;
    quotes: string[];
  };
}

export interface LlmConfig {
  apiKey: string;
  provider: LLMProvider;
  model: string;
  temperature: number;
}

export interface PromptVersion {
  version: number;
  template: string;
  date: string;
}

export interface Prompt {
  name: string;
  description: string;
  versions: PromptVersion[];
  activeVersion: number;
}

export type PromptCollection = Record<string, Prompt>;