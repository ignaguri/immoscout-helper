// Background service worker entry point for the IS24 app.
// createEngine owns the site-agnostic lifecycle (alarms, monitoring restore,
// storage seeding, side panel); the app registers its own message/notification
// handlers, which wire the IS24-specific messenger + snapshot features.

import { createEngine } from '@repo/core-engine';
import { is24Descriptor } from './is24-descriptor';
import { registerMessageHandler, registerNotificationHandler } from './message-handler';

createEngine(is24Descriptor);
registerMessageHandler();
registerNotificationHandler();
