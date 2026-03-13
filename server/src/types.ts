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
  title?: string;
  name?: string;
  isPrivate?: boolean;
  isTenantNetwork?: boolean;
}

export interface UserProfile {
  adults?: string;
  children?: string;
  pets?: string;
  smoker?: string;
  income?: string;
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

export type ProviderId = 'gemini' | 'openai';

export interface AnalyzeRequestBody {
  listingDetails: ListingDetails;
  landlordInfo?: LandlordInfo;
  userProfile?: UserProfile;
  messageTemplate?: string;
  minScore?: number;
  userNotes?: string;
  apiKey?: string;
  provider?: ProviderId;
  profile?: Profile;
  examples?: Example[];
}

export interface CaptchaRequestBody {
  imageBase64: string;
  apiKey?: string;
  provider?: ProviderId;
}

export interface ShortenRequestBody {
  message: string;
  maxLength: number;
  apiKey?: string;
  provider?: ProviderId;
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

export interface ReplyRequestBody {
  conversationHistory: ConversationMessage[];
  userProfile?: UserProfile;
  landlordInfo?: LandlordInfo;
  listingTitle?: string;
  apiKey?: string;
  provider?: ProviderId;
  profile?: Profile;
  appointmentAction?: AppointmentAction;
  userContext?: string;
}

export interface ScoreResult {
  score: number;
  reason: string;
  summary?: string;
  flags?: string[];
}

export interface DocumentsRequestBody {
  address: string;
  name: string;
  moveIn?: string;
  birthDate?: string;
  maritalStatus?: string;
  currentAddress?: string;
  phone?: string;
  email?: string;
  profession?: string;
  netIncome?: string;
  employer?: string;
  employedSince?: string;
  currentLandlord?: string;
  landlordPhone?: string;
  landlordEmail?: string;
  signingDate?: string;
  signatureName?: string;
  attachments?: string[];
  noAttach?: boolean;
}

export interface LogEntryBody {
  listingId: string;
  title?: string;
  address?: string;
  url?: string;
  score?: number;
  reason?: string;
  action: 'sent' | 'skipped' | 'failed';
  landlord?: string;
}
