import { describe, expect, it } from 'vitest';
import { parseScoreJSON } from './index';

describe('parseScoreJSON', () => {
  it('parses clean JSON', () => {
    const result = parseScoreJSON('{"score": 7, "reason": "Good match", "summary": "Nice flat", "flags": []}');
    expect(result).toEqual({ score: 7, reason: 'Good match', summary: 'Nice flat', flags: [] });
  });

  it('parses JSON with leading/trailing whitespace', () => {
    const result = parseScoreJSON('  \n {"score": 5, "reason": "ok"} \n ');
    expect(result).toEqual({ score: 5, reason: 'ok' });
  });

  it('parses markdown-fenced JSON (```json)', () => {
    const input = '```json\n{"score": 8, "reason": "Great", "summary": "Excellent", "flags": []}\n```';
    const result = parseScoreJSON(input);
    expect(result).toEqual({ score: 8, reason: 'Great', summary: 'Excellent', flags: [] });
  });

  it('parses markdown-fenced JSON (``` without language tag)', () => {
    const input = '```\n{"score": 6, "reason": "Decent"}\n```';
    const result = parseScoreJSON(input);
    expect(result).toEqual({ score: 6, reason: 'Decent' });
  });

  it('parses markdown-fenced JSON with extra whitespace around fences', () => {
    const input = '  ```json\n  {"score": 9, "reason": "Perfect"}  \n  ```  ';
    const result = parseScoreJSON(input);
    expect(result).toEqual({ score: 9, reason: 'Perfect' });
  });

  it('handles trailing commas in objects', () => {
    const input = '{"score": 7, "reason": "ok", "flags": ["befristet",],}';
    const result = parseScoreJSON(input);
    expect(result).toEqual({ score: 7, reason: 'ok', flags: ['befristet'] });
  });

  it('handles trailing commas in markdown-fenced JSON', () => {
    const input = '```json\n{"score": 4, "reason": "meh", "flags": [],}\n```';
    const result = parseScoreJSON(input);
    expect(result).toEqual({ score: 4, reason: 'meh', flags: [] });
  });

  it('extracts JSON embedded in prose text', () => {
    const input = 'Here is my analysis:\n{"score": 3, "reason": "Too expensive"}\nHope that helps!';
    const result = parseScoreJSON(input);
    expect(result).toEqual({ score: 3, reason: 'Too expensive' });
  });

  it('extracts JSON with nested objects from prose', () => {
    const input = 'Result: {"score": 6, "reason": "Fine", "details": {"price": 1200}}. Done.';
    const result = parseScoreJSON(input);
    expect(result?.score).toBe(6);
    expect(result?.reason).toBe('Fine');
  });

  it('returns null when no score key exists', () => {
    expect(parseScoreJSON('{"rating": 5}')).toBeNull();
  });

  it('returns null when score is not a number', () => {
    expect(parseScoreJSON('{"score": "high"}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseScoreJSON('')).toBeNull();
  });

  it('returns null for garbage text', () => {
    expect(parseScoreJSON('I cannot analyze this listing.')).toBeNull();
  });

  it('returns null for unclosed JSON', () => {
    expect(parseScoreJSON('{"score": 5, "reason": "test"')).toBeNull();
  });

  it('handles score of 0', () => {
    // 0 is falsy but still a valid number
    const result = parseScoreJSON('{"score": 0, "reason": "Invalid listing"}');
    expect(result).toEqual({ score: 0, reason: 'Invalid listing' });
  });

  it('handles score of 10', () => {
    const result = parseScoreJSON('{"score": 10, "reason": "Perfect"}');
    expect(result?.score).toBe(10);
  });

  it('preserves commas inside string values (does not corrupt content)', () => {
    const input = '{"score": 5, "reason": "too expensive, }bad area", "summary": "Price is high, ]not ideal"}';
    const result = parseScoreJSON(input);
    expect(result?.score).toBe(5);
    expect(result?.reason).toBe('too expensive, }bad area');
    expect(result?.summary).toBe('Price is high, ]not ideal');
  });

  it('handles trailing commas with commas inside strings', () => {
    const input = '{"score": 6, "reason": "ok, decent",}';
    const result = parseScoreJSON(input);
    expect(result?.score).toBe(6);
    expect(result?.reason).toBe('ok, decent');
  });

  it('handles real-world LiteLLM markdown response', () => {
    const input = `\`\`\`json
{
  "score": 7,
  "reason": "Good 2-room flat in Sendling, fair price at 17.5€/m², but no balcony",
  "summary": "The flat is well-priced at 875€ warm (17.5€/m²) for 50m² in Sendling. Good transport links. Missing balcony and elevator. Building from 1965 without noted renovation could mean noise issues.",
  "flags": ["unrenovated"]
}
\`\`\``;
    const result = parseScoreJSON(input);
    expect(result?.score).toBe(7);
    expect(result?.flags).toEqual(['unrenovated']);
  });
});
