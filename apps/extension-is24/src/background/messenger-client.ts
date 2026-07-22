import type { MessengerClient } from '@repo/site-adapter';
import { checkForNewReplies } from './conversations';
import { checkListingAlreadyContacted, syncContactedListings } from './sync';

// IS24 messenger integration (immoscout nachrichten-manager API), passed to the
// engine via the descriptor. The conversation-thread methods used by the popup
// (fetchConversationMessages, draft/appointment) stay direct app imports until
// message-handler moves into the engine (Task 3.5).
export const is24Messenger: MessengerClient = {
  syncContacted: syncContactedListings,
  checkListingAlreadyContacted,
  checkForNewReplies,
};
