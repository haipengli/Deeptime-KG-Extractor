/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { preprocessText } from './stratigraphyPreprocess';

describe('preprocessText', () => {

  it('should fix end-of-line hyphenation', () => {
    const raw = 'The Cedar Moun-\ntain Formation is a key unit.';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toContain('The Cedar Mountain Formation is a key unit.');
  });

  it('should not affect in-word hyphens', () => {
    const raw = 'This is a salt-bearing unit.';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toBe('This is a salt-bearing unit.');
  });

  it('should expand the "Fm." abbreviation to "Formation"', () => {
    const raw = 'The Morrison Fm. is famous for dinosaurs.';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toContain('The Morrison Formation is famous for dinosaurs.');
  });
  
  it('should expand the "Mbr" abbreviation to "Member"', () => {
    const raw = 'We studied the Ruby Ranch Mbr of the Cedar Mountain Formation.';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toContain('the Ruby Ranch Member of');
  });

  it('should expand the "Gp" abbreviation to "Group"', () => {
    const raw = 'The Wasatch Gp. is widespread.';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toContain('The Wasatch Group is widespread.');
  });
  
  it('should normalize multiple spaces and tabs into single spaces', () => {
    const raw = 'This   has		too much   space.';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toBe('This has too much space.');
  });
  
  it('should trim whitespace from the start and end of the text', () => {
    const raw = '  \n  extra space \t ';
    const { cleanText } = preprocessText(raw);
    expect(cleanText).toBe('extra space');
  });

  it('should identify a single-word Formation candidate', () => {
    const raw = 'The Wasatch Formation is present.';
    const { candidates } = preprocessText(raw);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: 'Wasatch Formation',
      type: 'Formation'
    });
  });

  it('should identify a multi-word Formation candidate', () => {
    const raw = 'The Cedar Mountain Formation is a key unit.';
    const { candidates } = preprocessText(raw);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: 'Cedar Mountain Formation',
      type: 'Formation'
    });
  });

  it('should identify multiple, different candidates', () => {
    const raw = 'The Mancos Shale overlies the Dakota Group. The Burro Canyon Formation is below it.';
    const { candidates } = preprocessText(raw);
    expect(candidates).toHaveLength(2);
    expect(candidates.map(c => c.name)).toContain('Dakota Group');
    expect(candidates.map(c => c.name)).toContain('Burro Canyon Formation');
  });

  it('should deduplicate candidates, keeping the first occurrence', () => {
    const raw = 'The Morrison Formation is vast. Later, the Morrison Formation is mentioned again.';
    const { candidates } = preprocessText(raw);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('Morrison Formation');
  });

  it('should return an empty array when no candidates are found', () => {
     const raw = 'This text contains no stratigraphic units.';
     const { candidates } = preprocessText(raw);
     expect(candidates).toHaveLength(0);
  });

});
