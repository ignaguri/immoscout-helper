// Shared types used across background, content, and popup

export interface Listing {
  id: string;
  url: string;
  title: string;
  index: number;
}

export interface LandlordInfo {
  title: string | null;
  name: string | null;
  isPrivate: boolean;
}

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
  baujahr?: string;
  objekttyp?: string;
  heizungsart?: string;
  energieverbrauch?: string;
  energieeffizienzklasse?: string;
  aufzug?: string;
  garage?: string;
  haustiere?: string;
  heizkosten?: string;
  energietraeger?: string;
  objektzustand?: string;
  internet?: string;
  rauchen?: string;
  wbs?: string;
  description?: string;
  amenities?: string[];
  extraAttributes?: Record<string, string>;
  rawText?: string;
  [key: string]: unknown;
}

export interface ListingType {
  isTenantNetwork: boolean;
  hasContactForm: boolean;
  type: 'tenant-network' | 'standard';
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

// Queue item stored in chrome.storage
export interface QueueItem {
  id: string;
  url: string;
  title: string;
  addedAt: number;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  retries: number;
  error?: string;
}

// Appointment info in conversations
export interface AppointmentInfo {
  date?: string;
  startDate?: string;
  time?: string;
  startTime?: string;
  duration?: string;
  location?: string;
  address?: string;
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
  lastMessagePreview: string;
  imageUrl: string;
  shortDetails: Record<string, unknown>;
  appointment: AppointmentInfo | null;
  appointmentStatus: string | null;
  messages: ConversationMessage[];
  draftReply: string | null;
  draftStatus: string;
}

export interface ConversationMessage {
  role: string;
  text: string;
  timestamp: string;
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
