import type {
  AnalyzeRequestBody,
  AppointmentAction,
  CaptchaRequestBody,
  ConversationMessage,
  Example,
  LandlordInfo,
  ListingDetails,
  LiteLLMConfig,
  Profile,
  ProviderId,
  ReplyRequestBody,
  ScoreResult,
  ShortenRequestBody,
  UserProfile,
} from '@repo/shared-types';

export type {
  AnalyzeRequestBody,
  AppointmentAction,
  CaptchaRequestBody,
  ConversationMessage,
  Example,
  LandlordInfo,
  ListingDetails,
  LiteLLMConfig,
  Profile,
  ProviderId,
  ReplyRequestBody,
  ScoreResult,
  ShortenRequestBody,
  UserProfile,
};

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
