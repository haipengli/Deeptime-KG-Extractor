// Minimal text cleanup + candidate spotting for stratigraphy terms.
// No external deps.

export type StratType = 'Formation' | 'Member' | 'Group';
export interface Candidate {
  name: string;
  type: StratType;
  index: number;   // offset in CLEAN text
  length: number;
  evidenceText: string;
}

export interface PreprocessResult {
  cleanText: string;
  candidates: Candidate[];
}

/**
 * Join end-of-line hyphenations: "Cedar Moun-\n tain" => "Cedar Mountain"
 * We only join when the hyphen is at EOL immediately followed by a newline.
 * We avoid touching in-word hyphens like "salt-bearing".
 */
function fixHyphenation(input: string): string {
  // Join A-<newline>B  where A and B look like word parts
  return input.replace(/([A-Za-z]{2,})-\s*\n\s*([A-Za-z]{2,})/g, '$1$2');
}

/**
 * Expand common abbreviations used in geology/stratigraphy.
 * We normalize *tokens* only (respecting word boundaries).
 */
function expandAbbreviations(input: string): string {
  return input
    // Formation
    .replace(/\bFm\.?\b/gi, 'Formation')
    // Member
    .replace(/\bMbr\.?\b/gi, 'Member')
    // Group
    .replace(/\bGp\.?\b/gi, 'Group')
    // Mountain (to help Cedar Mtn./Mt.)
    .replace(/\bMtns?\.?\b/gi, 'Mountain')
    .replace(/\bMt\.?\b/gi, 'Mountain');
}

/**
 * Normalize whitespace (collapse runs, normalize newlines).
 */
function normalizeWhitespace(input: string): string {
  const collapsed = input.replace(/[ \t]+/g, ' ');
  // keep newlines (paragraph boundaries) but trim spaces around them
  return collapsed.replace(/[ \t]*\n[ \t]*/g, '\n').trim();
}

/**
 * Extract candidate Formation/Member/Group mentions from CLEAN text.
 * Pattern looks for Proper Noun sequences followed by one of the target types.
 * Examples caught: "Cedar Mountain Formation", "Ruby Ranch Member", "Wasatch Group"
 */
function extractStratCandidates(clean: string): Candidate[] {
  const candidates: Candidate[] = [];

  // Allow multi-word proper names (up to 5 tokens before the type).
  // Tokens can include internal hyphens and "of the" style connectors are intentionally excluded
  // to keep names tight; the LLM can expand context in evidence.
  const typeWords = '(Formation|Member|Group)';
  const nameToken = '(?:[A-Z][a-zA-Z\\-]+)';
  const nameSeq = `${nameToken}(?:\\s+${nameToken}){0,4}`; // up to 5 tokens
  const regex = new RegExp(`\\b(${nameSeq})\\s+${typeWords}\\b`, 'g');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    const rawName = match[1];
    const typeWord = match[2] as StratType;
    const name = `${rawName} ${typeWord}`;
    const index = match.index;
    const length = match[0].length;

    // Short evidence: ±120 chars window
    const start = Math.max(0, index - 120);
    const end = Math.min(clean.length, index + length + 120);
    const evidenceText = clean.slice(start, end).replace(/\s+/g, ' ').trim();

    candidates.push({ name, type: typeWord, index, length, evidenceText });
  }

  return dedupeCandidates(candidates);
}

/**
 * Deduplicate by name + nearest index (keep first occurrence).
 */
function dedupeCandidates(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of list) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Full preprocessing pipeline.
 */
export function preprocessText(raw: string): PreprocessResult {
  const step1 = fixHyphenation(raw);
  const step2 = expandAbbreviations(step1);
  const cleanText = normalizeWhitespace(step2);
  const candidates = extractStratCandidates(cleanText);
  return { cleanText, candidates };
}
