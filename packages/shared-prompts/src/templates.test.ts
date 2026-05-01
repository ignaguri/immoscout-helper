import { describe, expect, it } from 'vitest';
import { renderTemplate, validateTemplate, MESSAGE_PLACEHOLDERS, SCORING_PLACEHOLDERS } from './index';

describe('renderTemplate', () => {
  it('replaces a known placeholder with its value', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(renderTemplate('{{greeting}}, {{name}}.', { greeting: 'Hi', name: 'Anna' })).toBe('Hi, Anna.');
  });

  it('replaces repeated occurrences of the same placeholder', () => {
    expect(renderTemplate('{{x}} + {{x}} = {{sum}}', { x: '1', sum: '2' })).toBe('1 + 1 = 2');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('Hello {{  name  }}!', { name: 'world' })).toBe('Hello world!');
  });

  it('leaves unknown placeholders intact so they surface in debug logs / UI', () => {
    expect(renderTemplate('Hello {{unknown}}!', {})).toBe('Hello {{unknown}}!');
  });

  it('treats an empty string value as filled (does not fall back to leaving it intact)', () => {
    expect(renderTemplate('[{{label}}]', { label: '' })).toBe('[]');
  });

  it('treats an explicit empty string as a substitution, not as a missing key', () => {
    // Object.hasOwn distinguishes "key missing" from "key set to ''".
    const vars: Record<string, string> = Object.create(null);
    vars.label = '';
    expect(renderTemplate('[{{label}}]', vars)).toBe('[]');
  });

  it('does not match malformed delimiters', () => {
    expect(renderTemplate('{name}', { name: 'world' })).toBe('{name}');
    expect(renderTemplate('{{name}', { name: 'world' })).toBe('{{name}');
    expect(renderTemplate('{{ 1bad }}', { '1bad': 'x' })).toBe('{{ 1bad }}');
  });

  it('returns the input unchanged when there are no placeholders', () => {
    expect(renderTemplate('plain text — no braces', {})).toBe('plain text — no braces');
  });
});

describe('validateTemplate', () => {
  it('returns no unknowns when every placeholder is allowed', () => {
    const allowed = [
      { name: 'a', description: '', source: '' },
      { name: 'b', description: '', source: '' },
    ];
    expect(validateTemplate('{{a}} and {{b}}', allowed).unknown).toEqual([]);
  });

  it('flags placeholders that are not in the allow-list', () => {
    const allowed = [{ name: 'known', description: '', source: '' }];
    const { unknown } = validateTemplate('{{known}} and {{mystery}}', allowed);
    expect(unknown).toEqual(['mystery']);
  });

  it('deduplicates repeated unknown placeholders', () => {
    const { unknown } = validateTemplate('{{x}} {{x}} {{y}} {{y}} {{x}}', []);
    expect(unknown.sort()).toEqual(['x', 'y']);
  });

  it('handles whitespace around the placeholder name', () => {
    const allowed = [{ name: 'foo', description: '', source: '' }];
    expect(validateTemplate('{{ foo }} {{ bar }}', allowed).unknown).toEqual(['bar']);
  });

  it('returns an empty list for templates with no placeholders', () => {
    expect(validateTemplate('plain text', []).unknown).toEqual([]);
  });

  it('shipped default templates do not contain unknown placeholders against their own legends', async () => {
    const { DEFAULT_SCORING_TEMPLATE, DEFAULT_MESSAGE_TEMPLATE } = await import('./templates');
    expect(validateTemplate(DEFAULT_SCORING_TEMPLATE, SCORING_PLACEHOLDERS).unknown).toEqual([]);
    expect(validateTemplate(DEFAULT_MESSAGE_TEMPLATE, MESSAGE_PLACEHOLDERS).unknown).toEqual([]);
  });
});
