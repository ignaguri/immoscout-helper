import type {
  AppointmentAction,
  ConversationMessage,
  Example,
  LandlordInfo,
  ListingDetails,
  Profile,
  ProviderId,
  ScoreResult,
  UserProfile,
} from '@repo/shared-types';

export type {
  ListingDetails,
  LandlordInfo,
  UserProfile,
  Profile,
  Example,
  ConversationMessage,
  AppointmentAction,
  ScoreResult,
  ProviderId,
};

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
