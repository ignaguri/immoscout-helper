# Port document generation (Selbstauskunft PDF) from Python to TypeScript

## Context

`apps/documents/fill_selbstauskunft.py` fills the Mieterselbstauskunft PDF by drawing
text at fixed coordinates (reportlab) onto a template that has no AcroForm fields,
then merges the overlay onto the template pages and appends supporting-document
attachments (pypdf). It's invoked by `apps/server/src/index.ts` via `execFile`
(`POST /documents/generate`), which the extension calls over HTTP from
`background/message-handler.ts`. This makes document generation dependent on the
user running the local Express server with a working Python venv — it doesn't work
from the shipped extension alone.

Since the template has no form fields, this is pure "draw text at pixel coordinates
+ merge PDF pages" — fully expressible in JS via `pdf-lib` (pure JS, no native/WASM
deps, works in a browser/extension context, supports loading an existing PDF,
drawing directly onto its pages, standard Helvetica fonts with WinAnsi encoding for
German umlauts, and copying pages from other PDFs for attachments).

## Goal

Move document generation entirely into the extension so it ships as a client-side
feature with no server/Python dependency. Full replacement, not a dual-mode fallback.

## Architecture & module structure

- Add `pdf-lib` to `apps/extension/package.json`.
- Move the template PDF: `apps/documents/templates/Selbstauskunft____neutral.pdf` →
  `apps/extension/static/templates/Selbstauskunft____neutral.pdf` (copied into
  `dist/` the same way `manifest.json`/icons are; loaded at runtime via
  `chrome.runtime.getURL(...)` + `fetch`).
- New module `apps/extension/src/popup/lib/documents.ts`:
  - `fillSelbstauskunft(data: DocumentsFormData): Promise<Uint8Array>`
  - Ports `create_overlay_page1` / `create_overlay_page2` / `generate_pdf` from the
    Python script 1:1 — same coordinates, same per-field logic (address split on
    comma, employer split on comma, "nein" checkbox X's, signature-name flip from
    "Last, First" to "First Last"). Draws directly onto the loaded template's pages
    via `page.drawText(...)` (no separate overlay-canvas + merge step needed — that
    was only necessary because reportlab can't draw onto an existing PDF page).
  - Appends stored attachments (see below) via `pdfDoc.copyPages()`, in upload
    order, matching the current CLI's append-in-given-order behavior.
- `DraftReplySection.svelte` calls `fillSelbstauskunft()` directly and downloads the
  result via a real `Blob` + anchor download (no more base64 data-URL workaround —
  that only existed because the service worker has no DOM).
- Field-mapping/formatting logic currently inline in
  `background/message-handler.ts` (name split "First Last" → "Last, First", ISO
  date → `DD.MM.YYYY`, plain number → German EUR currency format, today's date as
  signing date) moves into `documents.ts`, unchanged.
- Deleted: `generateDocuments` branch in `background/message-handler.ts`, the
  `generateDocuments()` helper in `popup/lib/messages.ts`, the `/documents/generate`
  route and `DOCUMENTS_SCRIPT`/`PYTHON_PATH`/`execFile` plumbing in
  `apps/server/src/index.ts`, and `DocumentsRequestBody` in `apps/server/src/types.ts`.
- Deleted: `apps/documents/` entirely (Python script, `templates/` after the move
  above, `requirements.txt`, `pyproject.toml`, `README.md`), the `@repo/documents`
  workspace entry and `npm run setup -w @repo/documents` references in the root
  `package.json`/README, and the "Documents (Python)" section in `CLAUDE.md`.

## Attachments (supporting documents: CV, payslips, Schufa, etc.)

The Python script's default attachment is a hardcoded personal file
(`attachments/Ignacio_Guri_Bewerbungsunterlagen.pdf`) that isn't in the repo — not
viable for a shipped extension used by others. Replaced with user-managed,
persistently stored attachments:

- New `apps/extension/src/shared/idb-attachments.ts`, following the existing
  `shared/idb-snapshots.ts` pattern (separate `IDBDatabase` open/get/put helpers).
  New object store `attachments`, keyed by auto-increment id (attachments aren't
  tied to a `listingId`). Record shape: `{ id, filename, bytes: ArrayBuffer, addedAt }`.
- UI in `ProfileTab.svelte`, near the existing document-profile fields (the
  `formDocuments` select around line 459): an "Attachments" sub-section with a
  `<input type="file" accept="application/pdf">` to add a PDF, and a list of
  currently-stored attachments with filename + remove button. Supports multiple
  files. No reordering UI — append order follows upload order.
- On generate, `documents.ts` reads all stored attachments from IndexedDB in
  insertion order and appends their pages after the 2-page filled form.

## Error handling

- Missing required fields (`address`/`name`): same validation as today, surfaced
  in the popup before attempting generation.
- Template fetch failure (missing/corrupted bundled asset): should not happen in
  practice since it's a build-time asset, but fails with a clear error message
  rather than silently producing a broken PDF.
- Attachment PDF fails to parse when appending: skip that attachment and surface a
  warning, rather than aborting the whole generation — matches the Python script's
  `Warning: attachment not found` behavior for missing files.
- No network calls in the new path, so the current "AI server URL not configured" /
  server-unreachable error cases go away entirely for this feature.

## Testing

No existing automated tests for this feature (the Python script had none either).
Verification is manual: generate a PDF with full profile data plus a real
attachment, and visually compare text placement and umlaut rendering (München,
beschäftigt) against a PDF produced by the current Python path, to confirm the
ported coordinates and font encoding match exactly. This is a manual QA step in
the implementation plan, not an automated test — acceptable for now given the
feature's low change frequency.
