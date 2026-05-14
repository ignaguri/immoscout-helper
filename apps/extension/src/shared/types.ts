// Shared types used across background, content, and popup

export interface Listing {
  id: string;
  url: string;
  title: string;
  index: number;
}

import type { ConversationMessage } from '@repo/shared-types';

export type { ConversationMessage, LandlordInfo, ListingDetails } from '@repo/shared-types';

export interface ListingType {
  isTenantNetwork: boolean;
  hasContactForm: boolean;
  hasTenantCTA: boolean;
  type: 'tenant-recommendation' | 'tenant-network' | 'coming-soon' | 'standard';
}

export interface PendingApprovalItem {
  id: string;
  url: string;
  title?: string;
  addedAt: number;
}

export interface ManualReviewData {
  message: string;
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  landlordName: string;
  landlordTitle: string;
  isTenantNetwork: boolean;
  isPrivateLandlord: boolean;
  tabId: number;
  aiScore?: number;
  aiReason?: string;
  notificationId?: string;
  timestamp: number;
}

export interface FormValues {
  adults?: number | string;
  children?: number | string;
  pets?: string;
  smoker?: string;
  income?: number | string;
  householdSize?: string;
  employmentType?: string;
  incomeRange?: string;
  documents?: string;
  salutation?: string;
  phone?: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
}

export interface CaptchaDetectResult {
  hasCaptcha: boolean;
  imageBase64?: string | null;
  error?: string;
}

export interface CaptchaSubmitResult {
  success: boolean;
  messageSent?: boolean;
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
  messageSent?: string | boolean;
  manualMode?: boolean;
  captchaBlocked?: boolean;
  messageTooLong?: boolean;
  maxLength?: number | null;
  log: string[];
}

export interface FillReplyResult {
  success: boolean;
  error?: string;
  filled?: boolean;
  charsFilled?: number;
}

export interface HandleAppointmentResult {
  success: boolean;
  error?: string;
  buttonClicked?: string;
  messageFilled?: boolean;
}

export interface CheckMessageSentResult {
  messageSent: boolean;
  hasContactForm: boolean;
  hasCaptcha: boolean;
  pageTitle: string;
  url: string;
}

export interface RateLimitResult {
  allowed: boolean;
  waitTime?: number;
}

// Content script message request
export interface ContentRequest {
  action: string;
  message?: string;
  text?: string;
  formValues?: FormValues;
  autoSend?: boolean;
  response?: string;
  courtesyMessage?: string;
}

// Popup status response
export interface StatusResponse {
  isMonitoring: boolean;
  messagesThisHour: number;
  rateLimit: number;
  checkInterval: number;
  totalSent: number;
  lastCheck: string | null;
  aiEnabled: boolean;
  aiMinScore: number;
  aiListingsScored: number;
  aiListingsSkipped: number;
  syncedContacted: number;
}

// Activity log entry stored in chrome.storage and broadcast via runtime messages
export interface ActivityLogEntry {
  _id?: string;
  timestamp?: number;
  message?: string;
  type?: string;
  current?: { id: string; title?: string; url?: string };
  lastResult?: 'success' | 'skipped' | 'failed';
  lastId?: string;
  lastTitle?: string;
  error?: string;
  duplicateDecisionId?: string;
  duplicateLandlordName?: string;
  action?: string;
}

// Queue item stored in chrome.storage
export interface QueueItem {
  id: string;
  url: string;
  title: string;
  addedAt: number;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  retries: number;
  error?: string;
  source?: string;
}

// Appointment info in conversations (matches ImmoScout API)
export interface AppointmentInfo {
  start?: string; // ISO datetime, e.g. "2026-03-15T13:30:00Z"
  duration?: number | string; // minutes (number from API) or legacy string
  address?: string;
  phoneNumber?: string | null;
  state?: 'ACCEPT' | 'DECLINE' | 'RESCHEDULE';
  // Legacy/fallback fields from older stored data
  date?: string;
  startDate?: string;
  time?: string;
  startTime?: string;
  location?: string;
}

// Conversation entry stored in chrome.storage (used by background + popup)
export interface ConversationEntry {
  conversationId: string;
  referenceId: string | null;
  listingTitle: string;
  landlordName: string;
  salutation: string;
  lastUpdateDateTime: string;
  hasUnreadReply: boolean;
  hasLandlordReply: boolean;
  lastMessagePreview: string;
  imageUrl: string;
  shortDetails: Record<string, string>;
  appointment: AppointmentInfo | null;
  appointmentStatus: string | null;
  messages: ConversationMessage[];
  draftReply: string | null;
  draftStatus: 'none' | 'generating' | 'ready' | 'sent' | 'error';
  draftError?: string | null;
}

// Queue status response from background
export interface QueueStatusResponse {
  queue: QueueItem[];
  isProcessing: boolean;
}

// Capture queue items response
export interface CaptureQueueResponse {
  success: boolean;
  added: number;
  total: number;
  error?: string;
}

export interface UpdateInfo {
  version: string;
  url: string;
  checkedAt: number;
}

// --- Saved listing snapshots ---

export type ExportFormat = 'html' | 'pdf' | 'zip';

/** Small per-listing metadata stored in chrome.storage.local. */
export interface SavedSnapshotMeta {
  listingId: string;
  url: string;
  title: string;
  address: string;
  landlordName: string;
  savedAt: number;
  imageCount: number;
  /** URLs that failed to fetch during the save (so the UI can surface it). */
  failedImageUrls?: string[];
}

/** Individual image bytes stored in IndexedDB. */
export interface SavedImage {
  url: string;
  blob: Blob;
  mimeType: string;
}

/** Full snapshot, used for view/export. Images and details live in IndexedDB, meta in chrome.storage.local. */
export interface SavedSnapshotFull {
  meta: SavedSnapshotMeta;
  details: import('@repo/shared-types').ListingDetails;
  landlord: import('@repo/shared-types').LandlordInfo;
  images: SavedImage[];
}

/** Payload sent from content script to background when archiving. */
export interface ExtractForArchiveResult {
  listingId: string;
  url: string;
  details: import('@repo/shared-types').ListingDetails;
  landlord: import('@repo/shared-types').LandlordInfo;
  imageUrls: string[];
}
