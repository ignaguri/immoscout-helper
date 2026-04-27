# Privacy Policy — Apartment Messenger (ImmoScout24 Edition)

_Last updated: 2026-04-27_

This Chrome extension ("the extension") is designed to be transparent about the data it handles. This document explains exactly what is stored, what leaves your device, and what is never collected.

## Summary

- **Everything you enter into the extension is stored locally in your browser** (`chrome.storage.local`). It does not sync to any server we operate.
- **Outgoing data leaves your device only when you cause it to**: when the extension submits a contact form on ImmoScout24, or when it calls an AI provider (Google Gemini, OpenAI, or your own LiteLLM endpoint) using an API key you supplied.
- **No analytics. No telemetry. No third-party trackers.** No data is collected by the extension's author.

## Data stored locally on your device

The extension stores the following in `chrome.storage.local`. None of it is transmitted to any server we control.

- **Profile data** you enter for personalization and contact-form auto-fill: name, age, occupation, languages, household composition, income/salary, employment, salutation, phone number, neighborhood preferences, apartment preferences, dealbreakers, financial limits, document references.
- **Search configuration**: ImmoScout24 saved-search URLs, message templates, check intervals, send mode, rate-limit caps.
- **Activity log**: listings the extension has seen, whether messages were sent, send/skip/error outcomes, timestamps.
- **Conversations**: snapshots of conversations from your ImmoScout24 inbox that the extension has surfaced for reply drafting.
- **Queue and pending-approval state**: listings waiting to be processed or to be manually approved.
- **AI provider configuration**: provider selection (Gemini, OpenAI, or LiteLLM), API key(s) you supply, model name, optional LiteLLM endpoint URL/credentials.

This data persists across browser sessions until you clear it (via the extension's Settings tab, by uninstalling the extension, or by clearing extension storage in `chrome://extensions/`).

## Data that leaves your device

Outgoing network requests are limited to the destinations declared in the extension's `host_permissions`:

### To `immobilienscout24.de`

When monitoring or processing the queue, the extension submits contact forms and reply messages on your behalf. The data sent is the same data you would type manually into ImmoScout24's own forms: your message, your contact details from the Profile tab, and the listing reference. This traffic goes directly from your browser to ImmoScout24 over HTTPS.

You must already be logged into ImmoScout24 in your browser; the extension never sees, stores, or transmits your ImmoScout24 password.

### To `generativelanguage.googleapis.com` (Google Gemini), `api.openai.com` (OpenAI), or your configured LiteLLM endpoint

**Only if you supply an API key** for one of these providers, and **only when an AI feature runs** (listing scoring, message-draft generation, captcha solving, conversation reply drafting), the extension calls the provider directly from your browser with:

- Listing details (price, location, size, description, photos as needed for vision-based scoring).
- Relevant fields from your Profile (so the AI can personalize messages and judge fit).
- For captchas: the captcha image from the ImmoScout24 page.
- The conversation text when drafting replies.

Your data is then subject to that provider's privacy policy (Google's, OpenAI's, or your own LiteLLM operator's). Removing your API key in Settings disables all calls to that provider.

### Optional local AI server

If you choose to run the bundled `server/` Express application on `http://localhost:3456`, scoring and captcha requests can be routed through it instead of called directly from the extension. In that mode, the same data above flows to your local server first, then to the configured upstream AI provider. Nothing leaves your machine until your local server forwards it.

## What is never collected

- No analytics, telemetry, crash reporting, or usage tracking is sent to the extension's author or any third party.
- No advertising identifiers, fingerprints, or browsing history beyond the ImmoScout24 saved-search URLs you explicitly add.
- No ImmoScout24 credentials. The extension relies on your existing logged-in session; it never reads your password.
- No data is sold, shared with data brokers, or used for credit-worthiness or lending assessment.
- No third-party SDKs, analytics scripts, or trackers are bundled with the extension.

## Use of data

Data the extension handles is used only to operate the user-facing features of the extension: monitoring saved searches, drafting and sending personalized messages, scoring listings, solving captchas, and surfacing conversation replies. It is never sold, transferred to third parties for advertising, or used for credit-worthiness assessment.

## Permissions

The extension requests Chrome permissions only as needed for the features above. See the [README's Permissions section](./README.md#permissions) for a per-permission justification.

## Open source

The extension is open source. You can audit every network call and storage operation in the [source code](https://github.com/ignaguri/immoscout-helper).

## Contact

For privacy questions, contact: **pepe.grillo.parlante@gmail.com**

## Changes

If this policy changes materially, the updated version will be committed to the repository and the "Last updated" date above will change. Material changes will also be noted in the GitHub release notes.
