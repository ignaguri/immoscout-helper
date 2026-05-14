// ImmoScout24 API response types — derived from real API responses captured via Chrome DevTools.
// Prefix: IS24 to distinguish external API shapes from internal app types.

// --- Conversation List API ---
// GET /nachrichten-manager/api/seeker/conversations
// Pagination: ?timestampOfLastConversationPaginated={ISO8601}

export interface IS24ConversationsResponse {
  conversations: IS24Conversation[];
}

export interface IS24Conversation {
  conversationId: string;
  participantName: string;
  salutation: string; // "Herr" | "Frau" | ""
  referenceStatus: 'ACTIVE' | 'DEACTIVE';
  lastUpdateDateTime: string; // ISO 8601
  previewMessage: string | null;
  read: boolean;
  appointment: IS24Appointment | null;
  appointmentSettings: unknown | null;
  status: 'ACTIVE' | (string & {});
  imageUrl: string;
  referenceId: string | null; // expose ID (numeric string)
  address: IS24Address | null;
  shortDetails: IS24ShortDetails | null;
  participantSsoId: string;
  communicationType: 'CONVERSATION' | (string & {});
  invitationPending: unknown | null;
  originUseCase: string | null; // e.g. "CONTACT_REQUEST"
}

export interface IS24Address {
  street: string;
  houseNumber: string;
  city: string;
  postcode: string;
}

export interface IS24ShortDetails {
  sort: string[];
  details: Record<string, string>; // e.g. { price: "1540.00", numberOfRooms: "2", livingSpace: "62.26" }
}

export interface IS24Appointment {
  state?: 'ACCEPT' | 'DECLINE' | 'RESCHEDULE';
  start?: string; // ISO datetime
  duration?: number; // minutes
  address?: string;
  phoneNumber?: string | null;
}

// --- Conversation Detail API ---
// GET /nachrichten-manager/api/seeker/conversations/{conversationId}

export interface IS24ConversationDetailResponse {
  messages: IS24Message[];
  conversation: IS24Conversation;
  messageDraft: unknown | null;
  systemMessageExists: boolean;
  realtorData: IS24RealtorData | null;
  referenceData: IS24ReferenceData | null;
  recommendedActionVariant: unknown | null;
}

export interface IS24Message {
  id: string;
  conversationId: string;
  read: boolean;
  autoReply: boolean;
  message: string;
  creationDateTime: string; // ISO 8601
  userType: 'SEEKER' | 'REALTOR';
  attachments: unknown[];
  intent: unknown | null;
  source: string; // e.g. "API"
  tags: unknown | null;
  messageType: 'TEXT' | (string & {});
  messageKey: string;
  payload: string;
}

export interface IS24RealtorData {
  realtorName: string;
  companyName: string | null;
  isVerified: boolean;
}

export interface IS24ReferenceData {
  immoType: string; // e.g. "ApartmentRent"
  title: string;
}

// --- Seeker Metadata API ---
// GET /nachrichten-manager/api/seeker/metadata

export interface IS24SeekerMetadata {
  isInternalUser: boolean;
  ssoId: string;
  hasRentPlus: boolean;
  hasBuyPlus: boolean;
}
