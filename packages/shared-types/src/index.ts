export interface ListingDetails {
  title?: string;
  address?: string;
  kaltmiete?: string;
  warmmiete?: string;
  nebenkosten?: string;
  kaution?: string;
  wohnflaeche?: string;
  zimmer?: string;
  etage?: string;
  bezugsfrei?: string;
  haustiere?: string;
  rauchen?: string;
  extraAttributes?: Record<string, string>;
  amenities?: string[];
  description?: string;
  rawText?: string;
  baujahr?: string;
  objekttyp?: string;
  heizungsart?: string;
  energieverbrauch?: string;
  energieeffizienzklasse?: string;
  balkon?: string;
  garage?: string;
  aufzug?: string;
  keller?: string;
  internet?: string;
  wbs?: string;
  heizkosten?: string;
  energietraeger?: string;
  objektzustand?: string;
}

export interface LandlordInfo {
  title?: string | null;
  name?: string | null;
  isPrivate?: boolean;
  isTenantNetwork?: boolean;
}

export interface UserProfile {
  adults?: string | number;
  children?: string | number;
  pets?: string;
  smoker?: string;
  income?: string | number;
  incomeRange?: string;
  aboutMe?: string;
  phone?: string;
}

export interface Profile {
  name?: string;
  age?: number;
  occupation?: string;
  aboutMe?: string;
  languages?: string[];
  movingReason?: string;
  currentNeighborhood?: string;
  idealApartment?: string;
  dealbreakers?: string[];
  strengths?: string[];
  maxWarmmiete?: number;
}

export interface Example {
  listing: string;
  message: string;
  notes?: string;
}

export interface ConversationMessage {
  role: 'user' | 'landlord';
  text: string;
  timestamp?: string;
}

export interface AppointmentAction {
  type: 'accept' | 'reject' | 'alternative';
  date?: string;
  time?: string;
  location?: string;
  userContext?: string;
}

export interface ScoreResult {
  score: number;
  reason: string;
  summary?: string;
  flags?: string[];
}

export type ProviderId = 'gemini' | 'openai';
