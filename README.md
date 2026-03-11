# Apartment Messenger — ImmoScout24 Edition

A Chrome extension that monitors ImmoScout24 search results and automatically sends personalized messages to landlords when new listings appear. Includes a local AI server for listing scoring, captcha solving, and AI-assisted conversation replies.

## Project Structure

```
extension/     Chrome extension (Manifest V3, vanilla JS)
server/        AI server (Express + TypeScript + Gemini)
```

## Setup

### Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin the extension icon in your toolbar

**Recommended: Open as sidebar** for a better experience while browsing ImmoScout24:

1. Right-click the extension icon in your toolbar
2. Select **Open side panel**
3. The extension stays visible alongside the page — no more opening/closing the popup

You can also open it from Chrome's menu: **View → Open side panel** (or click the side panel icon next to the address bar), then select "Apartment Messenger" from the dropdown.

### AI Server

```bash
cd server
npm install
cp .env.example .env   # then add your Gemini API key
npm run dev             # starts on http://localhost:3456
```

The server provides:
- `/analyze` — AI scoring of listings against your profile
- `/captcha` — Captcha image → text extraction
- `/reply` — AI-generated draft replies to landlord messages
- `/health` — Health check

## Quick Start

1. Log into ImmoScout24
2. Set up your search filters and copy the URL
3. Click the extension icon → paste the URL into **Search URL**
4. Write your message in **Message to Landlords**
5. Fill in **Form** tab with your personal details
6. Click **Start**

The extension will periodically check for new listings and contact landlords for you.

## Features

### Automatic Messaging

The extension monitors your search URL and when new listings appear:
- Opens the listing page
- Detects the landlord's name and adds a formal German greeting
- Fills ImmoScout's contact form with your details
- Sends the message (or leaves it for review in manual mode)

### AI Listing Scoring

With the AI server running, the extension can score listings against your profile and skip low-quality matches.

### Conversation Replies

The extension monitors your ImmoScout inbox for landlord replies and:
- Shows unread conversations in the **Replies** tab
- Generates AI draft replies using your profile context
- Pre-fills the reply in the messenger for you to review and send

### Message Personalization

- **Frau detected** → `Sehr geehrte Frau [Name],`
- **Herr detected** → `Sehr geehrter Herr [Name],`
- **Unknown** → `Sehr geehrte Damen und Herren,`
- Use `{name}` in your template for inline name replacement

### Rate Limiting

- **Hourly cap** — Stops sending after reaching your configured limit
- **Minimum delay** — Waits between messages to avoid detection

## Popup Tabs

| Tab | Purpose |
|-----|---------|
| **Settings** | Search URL, message template, send mode |
| **Form** | Personal details for contact form auto-fill |
| **AI** | AI server URL, scoring threshold, profile |
| **Replies** | Conversations with landlords, AI draft replies |
| **Queue** | Manual queue for specific listings |
| **Advanced** | Check interval, rate limits, clear data |
| **Test** | Test message flow on a single listing |
| **Activity** | Real-time activity log |

## Development

### Extension

```bash
# Validate syntax (no build step)
node -c extension/background.js
node -c extension/content.js
node -c extension/popup.js
node -c extension/shared.js
```

After editing, reload the extension in `chrome://extensions/`. For content script changes, also refresh the ImmoScout24 tab.

**Debug:** Service worker logs → `chrome://extensions/` → "Inspect views: service worker". Content script logs → page DevTools (F12), filter by `[IS24]`.

### Server

```bash
cd server
npm run dev        # watch mode
npm run typecheck  # TypeScript check
```

## Architecture

```
┌─────────────┐  messages   ┌──────────────┐  messages   ┌─────────────┐
│  popup.js   │ ◄────────► │ background.js │ ◄────────► │ content.js  │
│ (popup UI)  │            │ (svc worker)  │            │ (page DOM)  │
└─────────────┘            └──────────────┘            └─────────────┘
       │                          │
       └──── both import ─────────┘
                  │
            ┌───────────┐
            │ shared.js │
            └───────────┘
                                   │ HTTP
                            ┌──────────────┐
                            │  AI Server   │
                            │  (Express)   │
                            └──────────────┘
```

- **shared.js** — Storage key constants, message personalization, utility functions
- **background.js** — Service worker: alarms, tab management, rate limiting, conversation detection
- **content.js** — DOM interaction: listing extraction, form filling, reply filling
- **popup.js** — UI controller: settings, stats, conversations, queue management
- **server/** — AI endpoints for scoring, captcha, and reply generation

## Data Storage

All extension data is stored locally in `chrome.storage.local`. The AI server stores no persistent data (captcha images and activity logs are gitignored).

## Troubleshooting

**"Receiving end does not exist"** → Refresh the ImmoScout24 page and try again.

**Extension stops checking** → Toggle Stop/Start to restart the alarm.

**Messages not sending** → Make sure you're logged into ImmoScout24.

**Rate limit reached** → Wait for the hourly reset or increase the limit in Advanced settings.

## Disclaimer

For personal use. Please use responsibly and respect ImmoScout24's terms of service.

## License

MIT
