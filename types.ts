
export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  evidenceText: string;
  source: string;
}

export interface ExtractedEntity {
  name: string;
  selected: boolean;
}

export interface SchemaSuggestion {
  type: 'entity' | 'predicate';
  name: string;
  justification: string;
  
  // For 'entity' type
  categorySuggestion?: string;

  // For 'predicate' type
  exampleTriple?: {
    subject: string;
    object: string;
  };
}

export interface DocumentSection {
    title: string;
    content: string;
    selected: boolean;
}

export interface Schema {
  meta: {
    id: string;
    purpose: string;
  };
  predicates: {
    predicateCategories: Record<string, string[]>;
    alias_map: Record<string, string[]>;
  };
  observableAxis: Record<string, { concepts: any }>;
  interpretiveAxis: Record<string, any>;
  relations: Record<string, string>;
}

export enum View {
  Extractor,
  Schema,
}

export type LLMProvider = 'gemini' | 'openai' | 'anthropic';

export type ExtractionStep =
  | 'ready'
  | 'queued'
  | 'parsing'
  | 'extractingEntities'
  | 'awaitingReview' // For an individual file that is done and waiting for others
  | 'reviewing' // Global step when all files are ready for review
  | 'extractingRelationships'
  | 'complete'
  | 'cached'
  | 'error';

export interface TurboOutput {
    entities: string[];
    triples: Omit<Triple, 'source'>[];
}
