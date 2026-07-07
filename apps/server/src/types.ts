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
