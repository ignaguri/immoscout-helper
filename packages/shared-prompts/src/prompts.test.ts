import { describe, expect, it } from 'vitest';
import {
  formatListingForPrompt,
  buildScoringPrompt,
  buildMessagePrompt,
  buildReplyPrompt,
  buildShortenPrompt,
  buildConversationText,
  CAPTCHA_SYSTEM_PROMPT,
  CAPTCHA_USER_PROMPT,
} from './index';
import type { ListingDetails, LandlordInfo, UserProfile, Profile, ConversationMessage } from '@repo/shared-types';

// ── formatListingForPrompt ──

describe('formatListingForPrompt', () => {
  it('formats basic fields', () => {
    const details: ListingDetails = {
      title: '2-Zi Wohnung',
      address: 'Schwabing, München',
      kaltmiete: '900€',
      wohnflaeche: '60 m²',
      zimmer: '2',
    };
    const result = formatListingForPrompt(details);
    expect(result).toContain('Titel: 2-Zi Wohnung');
    expect(result).toContain('Adresse: Schwabing, München');
    expect(result).toContain('Kaltmiete: 900€');
    expect(result).toContain('Wohnfläche: 60 m²');
    expect(result).toContain('Zimmer: 2');
  });

  it('includes extraAttributes', () => {
    const details: ListingDetails = {
      extraAttributes: { 'Garage vorhanden': 'Ja', Barrierefrei: 'Nein' },
    };
    const result = formatListingForPrompt(details);
    expect(result).toContain('Garage vorhanden: Ja');
    expect(result).toContain('Barrierefrei: Nein');
  });

  it('includes amenities', () => {
    const result = formatListingForPrompt({ amenities: ['Einbauküche', 'Balkon', 'Aufzug'] });
    expect(result).toContain('Ausstattung: Einbauküche, Balkon, Aufzug');
  });

  it('includes description', () => {
    const result = formatListingForPrompt({ description: 'Schöne helle Wohnung' });
    expect(result).toContain('Beschreibung:\nSchöne helle Wohnung');
  });

  it('falls back to rawText when no structured fields', () => {
    const result = formatListingForPrompt({ rawText: 'Full page text here' });
    expect(result).toContain('Inseratstext:\nFull page text here');
  });

  it('omits undefined fields', () => {
    const result = formatListingForPrompt({ title: 'Test' });
    expect(result).toBe('Titel: Test');
    expect(result).not.toContain('Kaltmiete');
  });

  it('returns empty string for empty details', () => {
    expect(formatListingForPrompt({})).toBe('');
  });
});

// ── buildConversationText ──

describe('buildConversationText', () => {
  const messages: ConversationMessage[] = [
    { role: 'user', text: 'Hallo, ich interessiere mich für die Wohnung.', timestamp: '10:00' },
    { role: 'landlord', text: 'Wann können Sie zur Besichtigung kommen?', timestamp: '10:30' },
  ];

  it('formats messages with role labels', () => {
    const result = buildConversationText(messages);
    expect(result).toContain('ICH (Bewerber) [10:00]:');
    expect(result).toContain('VERMIETER/ANBIETER [10:30]:');
  });

  it('includes listing title when provided', () => {
    const result = buildConversationText(messages, '2-Zi Schwabing');
    expect(result).toContain('WOHNUNG: 2-Zi Schwabing');
  });

  it('omits listing title section when not provided', () => {
    const result = buildConversationText(messages);
    expect(result).not.toContain('WOHNUNG:');
  });

  it('includes appointment context when provided', () => {
    const result = buildConversationText(messages, undefined, {
      type: 'accept',
      date: '15.03.2025',
      time: '14:00',
      location: 'Schwabing Str. 5',
    });
    expect(result).toContain('TERMINEINLADUNG:');
    expect(result).toContain('Datum: 15.03.2025');
    expect(result).toContain('GEWÜNSCHTE AKTION: ZUSAGE');
  });

  it('includes reject action label', () => {
    const result = buildConversationText(messages, undefined, { type: 'reject' });
    expect(result).toContain('ABSAGE');
  });

  it('includes alternative action label', () => {
    const result = buildConversationText(messages, undefined, { type: 'alternative' });
    expect(result).toContain('ALTERNATIVVORSCHLAG');
  });

  it('includes user context when no appointment', () => {
    const result = buildConversationText(messages, undefined, undefined, 'Please mention my dog');
    expect(result).toContain('KONTEXT/ANWEISUNGEN VOM NUTZER: Please mention my dog');
  });

  it('includes default instruction when no context', () => {
    const result = buildConversationText(messages);
    expect(result).toContain('Schreibe die nächste Antwort des Bewerbers.');
  });

  it('handles messages without timestamps', () => {
    const msgs: ConversationMessage[] = [{ role: 'user', text: 'Hallo' }];
    const result = buildConversationText(msgs);
    expect(result).toContain('ICH (Bewerber):\nHallo');
    expect(result).not.toContain('[');
  });
});

// ── buildScoringPrompt ──

describe('buildScoringPrompt', () => {
  const userProfile: UserProfile = { adults: '2', income: '5000', pets: 'Nein' };
  const profile: Profile = {
    occupation: 'Software Engineer',
    age: 30,
    maxWarmmiete: 1500,
    dealbreakers: ['WBS', 'Tauschwohnung'],
    currentNeighborhood: 'Schwabing',
  };

  it('includes user profile fields', () => {
    const prompt = buildScoringPrompt(userProfile, profile);
    expect(prompt).toContain('Beruf: Software Engineer');
    expect(prompt).toContain('Alter: 30');
    expect(prompt).toContain('Erwachsene im Haushalt: 2');
    expect(prompt).toContain('Haustiere: Nein');
  });

  it('includes budget rule when maxWarmmiete set', () => {
    const prompt = buildScoringPrompt(userProfile, profile);
    expect(prompt).toContain('BUDGET LIMIT');
    expect(prompt).toContain('1500€');
  });

  it('uses generic budget rule when no maxWarmmiete', () => {
    const prompt = buildScoringPrompt(userProfile, {});
    expect(prompt).toContain('33-40% of net income');
    expect(prompt).not.toContain('BUDGET LIMIT');
  });

  it('includes dealbreakers', () => {
    const prompt = buildScoringPrompt(userProfile, profile);
    expect(prompt).toContain('- WBS');
    expect(prompt).toContain('- Tauschwohnung');
  });

  it('requests JSON-only response', () => {
    const prompt = buildScoringPrompt(userProfile, profile);
    expect(prompt).toContain('Reply with a JSON object only');
    expect(prompt).toContain('"score"');
  });

  it('includes today date', () => {
    const prompt = buildScoringPrompt(userProfile, profile);
    expect(prompt).toContain("TODAY'S DATE:");
  });
});

// ── buildMessagePrompt ──

describe('buildMessagePrompt', () => {
  const userProfile: UserProfile = { adults: '1', pets: 'Nein', smoker: 'Nein' };
  const landlordInfo: LandlordInfo = { title: 'Frau', name: 'Müller' };
  const profile: Profile = { name: 'Max Mustermann', occupation: 'Ingenieur' };

  it('uses formal greeting for Frau', () => {
    const prompt = buildMessagePrompt(userProfile, landlordInfo, undefined, profile);
    expect(prompt).toContain('Sehr geehrte Frau Müller,');
  });

  it('uses formal greeting for Herr', () => {
    const prompt = buildMessagePrompt(userProfile, { title: 'Herr', name: 'Schmidt' }, undefined, profile);
    expect(prompt).toContain('Sehr geehrter Herr Schmidt,');
  });

  it('uses generic greeting when no name', () => {
    const prompt = buildMessagePrompt(userProfile, {}, undefined, profile);
    expect(prompt).toContain('Sehr geehrte Damen und Herren,');
  });

  it('uses informal greeting for tenant network', () => {
    const prompt = buildMessagePrompt(userProfile, { name: 'Lisa', isTenantNetwork: true }, undefined, profile);
    expect(prompt).toContain('Hallo Lisa,');
  });

  it('uses gender-neutral when name but no title', () => {
    const prompt = buildMessagePrompt(userProfile, { name: 'Schmidt' }, undefined, profile);
    expect(prompt).toContain('Sehr geehrte/r Schmidt,');
  });

  it('includes tenant network tone guidance', () => {
    const prompt = buildMessagePrompt(userProfile, { isTenantNetwork: true }, undefined, profile);
    expect(prompt).toContain('NACHVERMIETUNG');
    expect(prompt).toContain('Du-Form');
  });

  it('includes private landlord tone guidance', () => {
    const prompt = buildMessagePrompt(userProfile, { isPrivate: true }, undefined, profile);
    expect(prompt).toContain('PRIVATER Vermieter');
  });

  it('includes commercial tone by default', () => {
    const prompt = buildMessagePrompt(userProfile, {}, undefined, profile);
    expect(prompt).toContain('GEWERBLICHER Vermieter');
  });

  it('includes example messages when provided', () => {
    const examples = [{ listing: 'Test listing', message: 'Test message' }];
    const prompt = buildMessagePrompt(userProfile, landlordInfo, undefined, profile, examples);
    expect(prompt).toContain('BEISPIELNACHRICHTEN');
    expect(prompt).toContain('Test message');
  });

  it('includes sign-off with name', () => {
    const prompt = buildMessagePrompt(userProfile, landlordInfo, undefined, profile);
    expect(prompt).toContain('Max Mustermann');
  });

  it('includes message template', () => {
    const prompt = buildMessagePrompt(userProfile, landlordInfo, 'Meine Vorlage hier', profile);
    expect(prompt).toContain('Meine Vorlage hier');
  });

  it('enforces character limit rule', () => {
    const prompt = buildMessagePrompt(userProfile, landlordInfo, undefined, profile);
    expect(prompt).toContain('2000 Zeichen');
  });
});

// ── buildReplyPrompt ──

describe('buildReplyPrompt', () => {
  const userProfile: UserProfile = { adults: '1', pets: 'Nein', smoker: 'Nein', income: '4000', phone: '+49123' };
  const landlordInfo: LandlordInfo = { name: 'Müller' };
  const profile: Profile = { name: 'Max', occupation: 'Dev' };

  it('includes user profile with income and phone', () => {
    const prompt = buildReplyPrompt(userProfile, landlordInfo, profile);
    expect(prompt).toContain('Netto-Haushaltseinkommen: 4000€');
    expect(prompt).toContain('Telefon: +49123');
  });

  it('includes reply-specific context', () => {
    const prompt = buildReplyPrompt(userProfile, landlordInfo, profile);
    expect(prompt).toContain('laufenden Konversation');
    expect(prompt).toContain('Folgenachricht');
  });

  it('includes common question guidance', () => {
    const prompt = buildReplyPrompt(userProfile, landlordInfo, profile);
    expect(prompt).toContain('Einzugsdatum');
    expect(prompt).toContain('Besichtigungstermin');
    expect(prompt).toContain('SCHUFA');
  });

  it('uses informal sign-off for tenant network', () => {
    const prompt = buildReplyPrompt(userProfile, { isTenantNetwork: true }, profile);
    expect(prompt).toContain('Viele Grüße');
  });

  it('uses formal sign-off for commercial', () => {
    const prompt = buildReplyPrompt(userProfile, landlordInfo, profile);
    expect(prompt).toContain('Mit freundlichen Grüßen');
  });
});

// ── buildShortenPrompt ──

describe('buildShortenPrompt', () => {
  it('includes character limit', () => {
    const prompt = buildShortenPrompt(1500);
    expect(prompt).toContain('1500 Zeichen');
  });

  it('preserves greeting and sign-off instruction', () => {
    const prompt = buildShortenPrompt(2000);
    expect(prompt).toContain('Anrede');
    expect(prompt).toContain('Grußformel');
  });
});

// ── Constants ──

describe('captcha constants', () => {
  it('CAPTCHA_SYSTEM_PROMPT is defined', () => {
    expect(CAPTCHA_SYSTEM_PROMPT).toContain('captcha');
    expect(CAPTCHA_SYSTEM_PROMPT).toContain('alphanumeric');
  });

  it('CAPTCHA_USER_PROMPT is defined', () => {
    expect(CAPTCHA_USER_PROMPT).toContain('characters');
  });
});
