# TypeScript Document Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Mieterselbstauskunft PDF generation out of the Python/server path and into the Chrome extension popup using `pdf-lib`, so it ships as a client-side feature with no server or Python dependency.

**Architecture:** A new popup module (`popup/lib/documents.ts`) loads the bundled template PDF, draws text at the same fixed coordinates the Python script used (`page.drawText` directly onto the template pages — no overlay/merge step), appends user-managed attachment PDFs stored in IndexedDB, and returns a `Uint8Array`. The popup (`DraftReplySection.svelte`) downloads it via a real `Blob` (no base64 data-URL workaround). The old server route, background message branch, and the entire `apps/documents/` Python app are deleted.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vite, `pdf-lib`, IndexedDB, Chrome extension APIs.

## Global Constraints

- Braces on ALL `if`/`else` bodies, even single-line ones (user code style).
- Descriptive variable names (`fallbackTimerId`, not `fallback`).
- Use `clsx`/`cx` for conditional/dynamic classNames, never string interpolation (project has `clsx` + `tailwind-merge`).
- No em-dashes in user-facing prose/UI copy; use commas, parentheses, colons, or hyphens.
- Svelte 5 runes: `$state()`, `$derived()`, `$effect()`, `onMount` for one-time setup.
- Storage keys come from `apps/extension/src/shared/constants.ts` — never string literals.
- pdf-lib and reportlab share the same coordinate system (origin bottom-left, y up), so coordinates transfer 1:1. Standard Helvetica uses WinAnsi encoding, which covers all German umlauts (ü, ä, ö, ß).
- Lint/typecheck gates: `npm run check -w apps/extension` (svelte-check), `npm run typecheck -w apps/server` (tsc), `npm run lint` (biome) at repo root.
- No automated tests for this feature (per spec) — verification is build + typecheck + manual visual comparison against the current Python output.

---

## File Structure

**Created:**
- `apps/extension/static/templates/Selbstauskunft____neutral.pdf` — bundled template (moved from `apps/documents/templates/`)
- `apps/extension/src/shared/idb-attachments.ts` — IndexedDB helpers for stored attachment PDFs
- `apps/extension/src/popup/lib/documents.ts` — PDF generation: gather profile data, fill template, append attachments
- `apps/extension/src/popup/components/DocumentAttachments.svelte` — upload/list/remove attachments UI

**Modified:**
- `apps/extension/package.json` — add `pdf-lib`
- `apps/extension/src/shared/constants.ts` — add attachments IDB constants
- `apps/extension/src/popup/tabs/ProfileTab.svelte` — render `DocumentAttachments` in the Document Profile section
- `apps/extension/src/popup/components/DraftReplySection.svelte` — call `documents.ts` directly, Blob download, remove `aiMode === 'server'` gate, update error copy
- `apps/extension/src/popup/lib/messages.ts` — remove `generateDocuments()` helper
- `apps/extension/src/background/message-handler.ts` — remove `generateDocuments` action branch
- `apps/server/src/index.ts` — remove `/documents/generate` route + now-unused imports
- `apps/server/src/types.ts` — remove `DocumentsRequestBody`
- `package.json` (root) — drop `@repo/documents` from setup script
- `CLAUDE.md`, `README.md` (if present) — remove Python/documents references

**Deleted:**
- `apps/documents/` (entire directory)

---

## Task 1: Add pdf-lib and relocate the template into the extension bundle

**Files:**
- Modify: `apps/extension/package.json`
- Create: `apps/extension/static/templates/Selbstauskunft____neutral.pdf` (moved)
- Delete later (Task 8): `apps/documents/templates/Selbstauskunft____neutral.pdf`

**Interfaces:**
- Produces: the template is fetchable at runtime via `chrome.runtime.getURL('templates/Selbstauskunft____neutral.pdf')` from the popup; `pdf-lib` is importable as `pdf-lib`.

- [ ] **Step 1: Add pdf-lib dependency**

Run from repo root:

```bash
npm install pdf-lib@^1.17.1 -w apps/extension
```

Expected: `apps/extension/package.json` `dependencies` now includes `"pdf-lib": "^1.17.1"`, and the root `package-lock.json` updates.

- [ ] **Step 2: Copy the template into the extension static dir**

The template must be COPIED (not moved yet — the Python app still exists until Task 8, and we want the build verifiable now). Vite copies `apps/extension/static/` verbatim into `dist/` (see `vite.config.ts` `cpSync(resolve(__dirname, 'static'), ...)`), so a file in `static/templates/` lands at `dist/templates/`.

```bash
mkdir -p apps/extension/static/templates
cp apps/documents/templates/Selbstauskunft____neutral.pdf apps/extension/static/templates/Selbstauskunft____neutral.pdf
```

- [ ] **Step 3: Build and verify the template is bundled**

```bash
npm run build -w apps/extension
ls -la apps/extension/dist/templates/Selbstauskunft____neutral.pdf
```

Expected: build succeeds; the file exists in `dist/templates/` and is a non-zero-byte PDF (~identical size to the source).

- [ ] **Step 4: Commit**

```bash
git add apps/extension/package.json apps/extension/static/templates/Selbstauskunft____neutral.pdf package-lock.json
git commit -m "chore(extension): add pdf-lib and bundle Selbstauskunft template"
```

---

## Task 2: Attachments IndexedDB module

**Files:**
- Modify: `apps/extension/src/shared/constants.ts`
- Create: `apps/extension/src/shared/idb-attachments.ts`

**Interfaces:**
- Consumes: `indexedDB` (browser global), constants from `./constants`.
- Produces:
  - `interface AttachmentRecord { id: number; filename: string; bytes: ArrayBuffer; addedAt: number }`
  - `addAttachment(filename: string, bytes: ArrayBuffer): Promise<number>`
  - `listAttachments(): Promise<AttachmentRecord[]>` (ascending by `id` = insertion order)
  - `deleteAttachment(id: number): Promise<void>`

- [ ] **Step 1: Add IDB constants**

In `apps/extension/src/shared/constants.ts`, immediately after the existing `SAVED_SNAPSHOTS_IDB_*` block (around line 150), add:

```typescript
export const ATTACHMENTS_IDB_NAME = 'documentAttachments' as const;
export const ATTACHMENTS_IDB_VERSION = 1;
export const ATTACHMENTS_IDB_STORE = 'attachments' as const;
```

- [ ] **Step 2: Create the IDB helper module**

Create `apps/extension/src/shared/idb-attachments.ts`:

```typescript
// IndexedDB helpers for user-uploaded document attachments (CV, payslips, Schufa,
// etc.) that get appended after the filled Selbstauskunft form. Mirrors the
// idb-snapshots.ts pattern but uses an auto-increment key since attachments are
// not tied to a listingId.

import * as C from './constants';

export interface AttachmentRecord {
  id: number;
  filename: string;
  bytes: ArrayBuffer;
  addedAt: number;
}

function openAttachmentsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(C.ATTACHMENTS_IDB_NAME, C.ATTACHMENTS_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(C.ATTACHMENTS_IDB_STORE)) {
        db.createObjectStore(C.ATTACHMENTS_IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addAttachment(filename: string, bytes: ArrayBuffer): Promise<number> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_IDB_STORE, 'readwrite');
    // id is auto-assigned by the store; omit it from the written record.
    const record = { filename, bytes, addedAt: Date.now() };
    const req = tx.objectStore(C.ATTACHMENTS_IDB_STORE).add(record);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function listAttachments(): Promise<AttachmentRecord[]> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_IDB_STORE, 'readonly');
    const req = tx.objectStore(C.ATTACHMENTS_IDB_STORE).getAll();
    req.onsuccess = () => {
      const records = (req.result as AttachmentRecord[]) || [];
      records.sort((a, b) => a.id - b.id);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_IDB_STORE, 'readwrite');
    const req = tx.objectStore(C.ATTACHMENTS_IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run check -w apps/extension
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/shared/constants.ts apps/extension/src/shared/idb-attachments.ts
git commit -m "feat(extension): add IndexedDB store for document attachments"
```

---

## Task 3: Document generation module (the core port)

**Files:**
- Create: `apps/extension/src/popup/lib/documents.ts`

**Interfaces:**
- Consumes:
  - `pdf-lib` (`PDFDocument`, `StandardFonts`, `PDFFont`, `PDFPage`)
  - `listAttachments()` from `../../shared/idb-attachments`
  - constants from `../../shared/constants` (profile/form storage keys)
  - `chrome.storage.local`, `chrome.runtime.getURL`
- Produces:
  - `interface DocumentsFormData { address: string; moveIn: string; name: string; maritalStatus: string; birthDate: string; currentAddress: string; phone: string; email: string; profession: string; netIncome: string; employer: string; employedSince: string; currentLandlord: string; landlordPhone: string; landlordEmail: string; signingDate: string; signatureName: string }`
  - `buildDocumentData(address: string, moveIn: string): Promise<DocumentsFormData>`
  - `fillSelbstauskunft(data: DocumentsFormData): Promise<Uint8Array>`
  - `documentFilename(address: string, name: string): string`

- [ ] **Step 1: Create the module**

Create `apps/extension/src/popup/lib/documents.ts`. This ports `apps/documents/fill_selbstauskunft.py` (`create_overlay_page1`, `create_overlay_page2`, `generate_pdf`) plus the data-gathering/formatting that currently lives in `background/message-handler.ts` (lines ~493-555). Coordinates are copied verbatim from the Python source.

```typescript
// Client-side Mieterselbstauskunft PDF generation. Ports the Python
// fill_selbstauskunft.py: draws text at fixed coordinates onto the bundled
// template (which has no AcroForm fields) and appends user-uploaded attachments.
// Runs entirely in the popup (DOM context) - no server, no Python.

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts } from 'pdf-lib';
import * as C from '../../shared/constants';
import { listAttachments } from '../../shared/idb-attachments';

const TEMPLATE_URL = 'templates/Selbstauskunft____neutral.pdf';
const COL_X = 250;

export interface DocumentsFormData {
  address: string;
  moveIn: string;
  name: string;
  maritalStatus: string;
  birthDate: string;
  currentAddress: string;
  phone: string;
  email: string;
  profession: string;
  netIncome: string;
  employer: string;
  employedSince: string;
  currentLandlord: string;
  landlordPhone: string;
  landlordEmail: string;
  signingDate: string;
  signatureName: string;
}

// ISO date (YYYY-MM-DD from a date input) -> German DD.MM.YYYY. Leaves other input as-is.
function formatDate(isoDate: string | undefined): string {
  if (!isoDate?.includes('-')) {
    return isoDate || '';
  }
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

// Plain number -> German currency "X.XXX,XX EUR".
function formatEurAmount(val: string | number | undefined): string {
  if (!val) {
    return '';
  }
  const num = Number.parseFloat(String(val));
  if (Number.isNaN(num)) {
    return String(val);
  }
  const parts = num.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intPart},${parts[1]} EUR`;
}

function todayGermanDate(): string {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${today.getFullYear()}`;
}

// Gather profile data from chrome.storage.local and format it into the shape the
// template filler expects. Ported from background/message-handler.ts.
export async function buildDocumentData(address: string, moveIn: string): Promise<DocumentsFormData> {
  const docKeys = [
    C.PROFILE_NAME_KEY,
    C.PROFILE_BIRTH_DATE_KEY,
    C.PROFILE_MARITAL_STATUS_KEY,
    C.PROFILE_CURRENT_ADDRESS_KEY,
    C.PROFILE_EMAIL_KEY,
    C.PROFILE_OCCUPATION_KEY,
    C.PROFILE_NET_INCOME_KEY,
    C.PROFILE_EMPLOYER_KEY,
    C.PROFILE_EMPLOYED_SINCE_KEY,
    C.PROFILE_CURRENT_LANDLORD_KEY,
    C.PROFILE_LANDLORD_PHONE_KEY,
    C.PROFILE_LANDLORD_EMAIL_KEY,
    C.FORM_PHONE_KEY,
  ];
  const profile: Record<string, string | undefined> = await chrome.storage.local.get(docKeys);

  const nameRaw = profile[C.PROFILE_NAME_KEY] || '';
  // Convert "First Last" to "Last, First" for the form.
  const nameParts = nameRaw.split(' ').filter(Boolean);
  const formName = nameParts.length >= 2 ? `${nameParts.slice(1).join(' ')}, ${nameParts[0]}` : nameRaw;

  return {
    address,
    name: formName,
    moveIn: formatDate(moveIn),
    birthDate: formatDate(profile[C.PROFILE_BIRTH_DATE_KEY]),
    maritalStatus: profile[C.PROFILE_MARITAL_STATUS_KEY] || '',
    currentAddress: profile[C.PROFILE_CURRENT_ADDRESS_KEY] || '',
    phone: profile[C.FORM_PHONE_KEY] || '',
    email: profile[C.PROFILE_EMAIL_KEY] || '',
    profession: profile[C.PROFILE_OCCUPATION_KEY] || '',
    netIncome: formatEurAmount(profile[C.PROFILE_NET_INCOME_KEY]),
    employer: profile[C.PROFILE_EMPLOYER_KEY] || '',
    employedSince: formatDate(profile[C.PROFILE_EMPLOYED_SINCE_KEY]),
    currentLandlord: profile[C.PROFILE_CURRENT_LANDLORD_KEY] || '',
    landlordPhone: profile[C.PROFILE_LANDLORD_PHONE_KEY] || '',
    landlordEmail: profile[C.PROFILE_LANDLORD_EMAIL_KEY] || '',
    signingDate: todayGermanDate(),
    signatureName: nameRaw,
  };
}

// Draws page 1. Coordinates copied verbatim from create_overlay_page1 in the
// Python source. pdf-lib origin is bottom-left, matching reportlab.
function drawPage1(page: PDFPage, helv: PDFFont, helvBold: PDFFont, data: DocumentsFormData): void {
  const put = (x: number, y: number, text: string, size = 10, font = helv) => {
    page.drawText(text, { x, y, size, font });
  };

  put(45, 708, data.address);
  put(75, 661, data.moveIn);
  put(COL_X, 496, data.name);
  put(COL_X, 476, data.maritalStatus);
  put(COL_X, 457, data.birthDate);

  const currentAddress = data.currentAddress;
  if (currentAddress.includes(',')) {
    const idx = currentAddress.indexOf(',');
    const street = currentAddress.slice(0, idx).trim();
    const city = currentAddress.slice(idx + 1).trim();
    put(COL_X, 440, street);
    put(COL_X, 427, city);
  } else {
    put(COL_X, 440, currentAddress);
  }

  put(COL_X, 369, data.phone);
  put(COL_X, 350, data.email);
  put(COL_X, 331, data.profession);
  put(COL_X, 312, data.netIncome);

  // Employer (Helvetica 9), split on first comma into up to 2 lines.
  const employer = data.employer;
  const employerLines = employer.includes(',')
    ? [employer.slice(0, employer.indexOf(',')).trim(), employer.slice(employer.indexOf(',') + 1).trim()]
    : [employer];
  put(COL_X, 295, employerLines[0], 9);
  if (employerLines.length > 1) {
    put(COL_X, 283, employerLines[1], 9);
  }
  if (data.employedSince) {
    const yEmployed = employerLines.length <= 1 ? 283 : 271;
    put(COL_X, yEmployed, `beschäftigt seit ${data.employedSince}`, 9);
  }

  // Current landlord (Helvetica 9).
  put(COL_X, 229, data.currentLandlord, 9);
  put(COL_X, 217, data.landlordPhone, 9);
  put(COL_X, 205, data.landlordEmail, 9);

  // "Weitere Personen" nein checkbox (Helvetica-Bold 11).
  put(399, 137, 'X', 11, helvBold);
}

// Draws page 2. Coordinates copied verbatim from create_overlay_page2.
function drawPage2(page: PDFPage, helv: PDFFont, helvBold: PDFFont, data: DocumentsFormData): void {
  // "nein" checkboxes (Helvetica-Bold 11).
  const neinX = 256;
  const rowsY = [753, 720, 681, 632, 591, 553, 508, 470];
  for (const y of rowsY) {
    page.drawText('X', { x: neinX, y, size: 11, font: helvBold });
  }

  // Ort, Datum (Helvetica 10).
  const signingDate = data.signingDate || todayGermanDate();
  page.drawText(`München, ${signingDate}`, { x: 40, y: 185, size: 10, font: helv });

  // Signature (Helvetica 10). signatureName is always provided by buildDocumentData,
  // but keep the Python fallback (flip "Last, First" -> "First Last") for safety.
  let signatureName = data.signatureName || data.name.split(',')[0].trim();
  const nameParts = data.name.split(',');
  if (nameParts.length === 2 && !data.signatureName) {
    signatureName = `${nameParts[1].trim()} ${nameParts[0].trim()}`;
  }
  page.drawText(signatureName, { x: 260, y: 185, size: 10, font: helv });
}

// Fills the template and appends stored attachments. Returns the final PDF bytes.
export async function fillSelbstauskunft(data: DocumentsFormData): Promise<Uint8Array> {
  const templateResp = await fetch(chrome.runtime.getURL(TEMPLATE_URL));
  if (!templateResp.ok) {
    throw new Error('Template PDF not found in extension bundle');
  }
  const templateBytes = await templateResp.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes);
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  drawPage1(pdfDoc.getPage(0), helv, helvBold, data);
  drawPage2(pdfDoc.getPage(1), helv, helvBold, data);

  // Append attachments in upload order. Skip any that fail to parse.
  const attachments = await listAttachments();
  for (const attachment of attachments) {
    try {
      const donor = await PDFDocument.load(attachment.bytes);
      const copied = await pdfDoc.copyPages(donor, donor.getPageIndices());
      for (const donorPage of copied) {
        pdfDoc.addPage(donorPage);
      }
    } catch (err) {
      console.warn(`[Documents] Skipping unreadable attachment "${attachment.filename}":`, err);
    }
  }

  return pdfDoc.save();
}

// Builds the download filename: Bewerbungsunterlagen_<LastName>_<Street>.pdf
export function documentFilename(address: string, name: string): string {
  const nameParts = name.split(' ').filter(Boolean);
  const lastName = nameParts[nameParts.length - 1] || 'Tenant';
  const street = address.split(',')[0].trim().replace(/\s+/g, '_') || 'output';
  return `Bewerbungsunterlagen_${lastName}_${street}.pdf`;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run check -w apps/extension
```

Expected: no errors. (The module is not yet imported anywhere; unused exports are fine.)

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/popup/lib/documents.ts
git commit -m "feat(extension): add client-side Selbstauskunft PDF generation"
```

---

## Task 4: Attachments UI in ProfileTab

**Files:**
- Create: `apps/extension/src/popup/components/DocumentAttachments.svelte`
- Modify: `apps/extension/src/popup/tabs/ProfileTab.svelte`

**Interfaces:**
- Consumes: `addAttachment`, `listAttachments`, `deleteAttachment`, `AttachmentRecord` from `../../shared/idb-attachments`; `Button` from `$lib/components/ui/button`.
- Produces: a self-contained Svelte component with no props that manages its own attachment list state.

- [ ] **Step 1: Create the component**

Create `apps/extension/src/popup/components/DocumentAttachments.svelte`:

```svelte
<script lang="ts">
import Trash from '@lucide/svelte/icons/trash-2';
import Upload from '@lucide/svelte/icons/upload';
import { onMount } from 'svelte';
import { Button } from '$lib/components/ui/button';
import {
  addAttachment,
  type AttachmentRecord,
  deleteAttachment,
  listAttachments,
} from '../../shared/idb-attachments';

let attachments = $state<AttachmentRecord[]>([]);
let fileInput = $state<HTMLInputElement | null>(null);

async function refresh() {
  attachments = await listAttachments();
}

onMount(refresh);

async function handleFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) {
    return;
  }
  for (const file of Array.from(files)) {
    if (file.type !== 'application/pdf') {
      continue;
    }
    const bytes = await file.arrayBuffer();
    await addAttachment(file.name, bytes);
  }
  // Reset so selecting the same file again re-fires change.
  target.value = '';
  await refresh();
}

async function handleRemove(id: number) {
  await deleteAttachment(id);
  await refresh();
}
</script>

<div class="mt-3">
  <div class="mb-1.5 flex items-center justify-between">
    <span class="text-[11px] font-medium text-muted-foreground">Attachments (appended after the form)</span>
    <Button size="sm" variant="secondary" onclick={() => fileInput?.click()}>
      <Upload aria-hidden="true" />
      Add PDF
    </Button>
  </div>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/pdf"
    multiple
    class="hidden"
    onchange={handleFiles}
  />
  {#if attachments.length === 0}
    <p class="text-[11px] text-muted-foreground">No attachments. Upload CV, payslips, Schufa, etc. as PDFs.</p>
  {:else}
    <ul class="space-y-1">
      {#each attachments as attachment (attachment.id)}
        <li class="flex items-center justify-between gap-2 rounded border border-border bg-muted/40 px-2 py-1">
          <span class="truncate text-[11px]" title={attachment.filename}>{attachment.filename}</span>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${attachment.filename}`}
            onclick={() => handleRemove(attachment.id)}
          >
            <Trash class="size-3.5" aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 2: Render it in the Document Profile section**

In `apps/extension/src/popup/tabs/ProfileTab.svelte`, add the import near the other component imports (after line 3, the `Section` import):

```typescript
import DocumentAttachments from '../components/DocumentAttachments.svelte';
```

Then, inside the Document Profile `CollapsibleSection`, place the component just before the closing `</div>` that wraps the doc fields. Replace this block (currently around lines 345-347):

```svelte
      </FormField>
    </div>
  </div>
</CollapsibleSection>
```

with:

```svelte
      </FormField>
    </div>

    <DocumentAttachments />
  </div>
</CollapsibleSection>
```

Note: this is the first `</div></CollapsibleSection>` pair (the Document Profile section, closing at line ~348), NOT the Form Auto-Fill one. Confirm by checking that the preceding `FormField` is `profileLandlordEmail`.

- [ ] **Step 3: Typecheck**

```bash
npm run check -w apps/extension
```

Expected: no errors.

- [ ] **Step 4: Manual check**

Load the unpacked extension (`npm run build -w apps/extension`, then reload in `chrome://extensions/`), open the popup, expand Document Profile, and confirm: "Add PDF" opens a file picker; selecting a PDF adds it to the list; the remove (trash) button removes it; reopening the popup still shows the persisted attachment.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/popup/components/DocumentAttachments.svelte apps/extension/src/popup/tabs/ProfileTab.svelte
git commit -m "feat(extension): manage document attachments in the popup"
```

---

## Task 5: Wire DraftReplySection to generate + download client-side

**Files:**
- Modify: `apps/extension/src/popup/components/DraftReplySection.svelte`

**Interfaces:**
- Consumes: `buildDocumentData`, `fillSelbstauskunft`, `documentFilename` from `../lib/documents`.
- Removes reliance on: `generateDocuments` from `../lib/messages` (import dropped here; the helper itself is deleted in Task 6).

- [ ] **Step 1: Swap the import**

In `apps/extension/src/popup/components/DraftReplySection.svelte`, change the messages import (line 12) from:

```typescript
import { dismissDraftError, generateDocuments, regenerateDraft, sendConversationReply } from '../lib/messages';
```

to:

```typescript
import { dismissDraftError, regenerateDraft, sendConversationReply } from '../lib/messages';
import { buildDocumentData, documentFilename, fillSelbstauskunft } from '../lib/documents';
```

- [ ] **Step 2: Replace `handleGenerateDocs` with a client-side implementation**

Replace the whole `handleGenerateDocs` function (currently lines 184-206) with:

```typescript
async function handleGenerateDocs() {
  docsBtnDisabled = true;
  docsBtnText = 'Generating…';
  docsStatus = 'idle';
  try {
    const address = docsAddress || '';
    const data = await buildDocumentData(address, moveInDate || '');
    const bytes = await fillSelbstauskunft(data);
    const filename = documentFilename(address, data.signatureName);

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename, saveAs: true });
    } finally {
      // Revoke after a tick so the download has time to start.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    docsBtnText = 'Downloaded!';
    docsStatus = 'success';
  } catch (err) {
    console.error('[Documents] Generation failed:', err);
    docsBtnText = 'Failed';
    docsStatus = 'error';
  }
  setTimeout(() => {
    docsBtnDisabled = false;
    docsBtnText = 'Generate';
    docsStatus = 'idle';
  }, 5000);
}
```

- [ ] **Step 3: Remove the `aiMode === 'server'` gates**

The feature is now client-side and must work in any AI mode. In the same file:

Change the dropdown gate (lines 290-295) from:

```svelte
          {#if aiMode === 'server'}
            <DropdownMenu.Item onSelect={() => { showDocsForm = true; }}>
              <FileText aria-hidden="true" />
              Generate Docs
            </DropdownMenu.Item>
          {/if}
```

to (unconditional):

```svelte
          <DropdownMenu.Item onSelect={() => { showDocsForm = true; }}>
            <FileText aria-hidden="true" />
            Generate Docs
          </DropdownMenu.Item>
```

Change the form gate (line 317) from:

```svelte
    {#if aiMode === 'server' && showDocsForm}
```

to:

```svelte
    {#if showDocsForm}
```

- [ ] **Step 4: Update the error copy (no server anymore)**

Change the error message (line 352) from:

```svelte
              Generation failed. Is the server running?
```

to:

```svelte
              Generation failed. Check your profile fields and try again.
```

- [ ] **Step 5: Typecheck**

```bash
npm run check -w apps/extension
```

Expected: no errors. If svelte-check flags `aiMode` as unused, leave the prop declared (it is still part of the component's public props and may be used elsewhere in the template); only remove it if svelte-check explicitly errors on it, in which case also remove it from the `$props()` destructure and from callers.

- [ ] **Step 6: Manual end-to-end check**

Build and reload the extension. Open a conversation in the popup, use the "..." menu, click "Generate Docs", fill address + move-in date, click Generate. Confirm a PDF downloads and opens correctly, with the two filled form pages followed by any attachments added in Task 4.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/popup/components/DraftReplySection.svelte
git commit -m "feat(extension): generate documents client-side, drop server dependency"
```

---

## Task 6: Remove the server route, message branch, and message helper

**Files:**
- Modify: `apps/extension/src/popup/lib/messages.ts`
- Modify: `apps/extension/src/background/message-handler.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/types.ts`

**Interfaces:**
- Removes: `generateDocuments()` (messages.ts), the `generateDocuments` action branch (message-handler.ts), `POST /documents/generate` + related consts (index.ts), `DocumentsRequestBody` (types.ts). Nothing should reference these after Task 5.

- [ ] **Step 1: Remove `generateDocuments` from messages.ts**

In `apps/extension/src/popup/lib/messages.ts`, delete the entire `generateDocuments` function (lines 133-144):

```typescript
export async function generateDocuments(
  conversationId: string,
  address: string,
  moveIn: string,
): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({
    action: 'generateDocuments',
    conversationId,
    address,
    moveIn,
  });
}
```

- [ ] **Step 2: Remove the `generateDocuments` branch in message-handler.ts**

In `apps/extension/src/background/message-handler.ts`, delete the entire `else if (request.action === 'generateDocuments') { ... }` block (lines 477-587, from `} else if (request.action === 'generateDocuments') {` up to and including its closing `return true;`). The next branch (`} else if (request.action === 'blacklistListing') {`) becomes the continuation — ensure it reads `} else if (request.action === 'blacklistListing') {` immediately after the previous branch's `return true;`.

Verify no other reference to `C.PROFILE_*`/`C.FORM_PHONE_KEY` in that file becomes newly unused causing a lint error; if the constants import (`import * as C`) is still used elsewhere in the file (it is — many other branches use it), leave it.

- [ ] **Step 3: Remove the route and unused imports in server index.ts**

In `apps/server/src/index.ts`:

Delete the entire documents block (lines 532-603): the `DOCUMENTS_SCRIPT`/`PYTHON_PATH` consts and the whole `app.post('/documents/generate', ...)` handler.

Remove the now-unused `execFile` import (line 2) entirely:

```typescript
import { execFile } from 'node:child_process';
```

Update the `node:fs` import (line 3) to drop `existsSync` and `readFileSync` (both only used by the deleted route; `unlinkSync`, `appendFileSync`, `mkdirSync`, `readdirSync`, `writeFileSync` are still used elsewhere). Change:

```typescript
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
```

to:

```typescript
import { appendFileSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
```

Remove `DocumentsRequestBody` from the types import (line 27) — delete just that identifier from the existing multi-line import from `./types`.

- [ ] **Step 4: Remove `DocumentsRequestBody` from server types.ts**

In `apps/server/src/types.ts`, delete the `export interface DocumentsRequestBody { ... }` block (starting line 35). Read the file first to capture its exact extent before deleting.

- [ ] **Step 5: Typecheck both projects**

```bash
npm run check -w apps/extension
npm run typecheck -w apps/server
```

Expected: both pass with no errors (no unused-import or missing-symbol complaints).

- [ ] **Step 6: Lint**

```bash
npm run lint
```

Expected: biome passes (no unused imports/vars flagged).

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/popup/lib/messages.ts apps/extension/src/background/message-handler.ts apps/server/src/index.ts apps/server/src/types.ts
git commit -m "refactor: remove server-side document generation route and plumbing"
```

---

## Task 7: Delete the Python app and update workspace/docs

**Files:**
- Delete: `apps/documents/` (entire directory)
- Modify: `package.json` (root)
- Modify: `CLAUDE.md`
- Modify: `README.md` (if it references documents/Python)

**Interfaces:**
- Removes the `@repo/documents` workspace and all references to Python setup for this feature.

- [ ] **Step 1: Delete the directory**

```bash
git rm -r apps/documents
```

- [ ] **Step 2: Fix the root setup script**

In root `package.json`, change the `setup` script from:

```json
    "setup": "npm install && npm run setup -w @repo/documents",
```

to:

```json
    "setup": "npm install",
```

- [ ] **Step 3: Regenerate the lockfile / prune the workspace**

```bash
npm install
```

Expected: `package-lock.json` updates, `@repo/documents` no longer present. No errors about the missing workspace.

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, remove references to the documents Python app:
- In "What This Is", delete item 3 (`apps/documents` — Python helper) and renumber.
- Remove the "### Documents (Python)" subsection under Development.
- In the Project Structure tree, remove the `documents/` entry.
- In the Server "Endpoints" line, remove `/documents/generate`.
- Remove the sentence about `DOCUMENTS_SCRIPT` resolution in the Server architecture section.

Replace the "Documents (Python)" dev section with a short note under the Extension section, for example: "Document generation (Mieterselbstauskunft PDF) runs entirely in the popup via pdf-lib; the template lives in `apps/extension/static/templates/`."

- [ ] **Step 5: Update README.md if applicable**

```bash
grep -rn "documents\|Python\|@repo/documents\|DOCUMENTS_PYTHON" README.md 2>/dev/null
```

If any hits reference the documents Python app or `DOCUMENTS_PYTHON_PATH`, remove those lines/sections. If `README.md` does not exist or has no such references, skip.

- [ ] **Step 6: Full verification**

```bash
npm run typecheck
npm run lint
npm run build -w apps/extension
```

Expected: all pass; `apps/extension/dist/templates/Selbstauskunft____neutral.pdf` still present in the build output.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove Python documents app and update workspace + docs"
```

---

## Task 8: Manual QA — visual comparison against the Python output

This is the acceptance gate for the port. No automated test (per spec).

- [ ] **Step 1: Produce a reference PDF from the (pre-change) Python path**

Before this branch, or from a checkout of `main`, generate a reference PDF using representative data. From `apps/documents` on `main`:

```bash
python3 fill_selbstauskunft.py --json '{"address":"Musterstr. 1, 80331 München","moveIn":"01.08.2026","name":"Mustermann, Max","maritalStatus":"ledig","birthDate":"15.03.1990","currentAddress":"Altstr. 5, 81667 München","phone":"+49 179 1234567","email":"max@example.com","profession":"Software Engineer","netIncome":"5.203,97 EUR","employer":"Acme GmbH, Musterstr. 1, 80331 München","employedSince":"01.01.2020","currentLandlord":"Frau Schmidt","landlordPhone":"+49 89 111111","landlordEmail":"schmidt@example.com","signingDate":"07.07.2026","signatureName":"Max Mustermann"}' --no-attach -o /tmp/reference_python.pdf
```

- [ ] **Step 2: Produce the TS output with equivalent data**

In the popup, enter matching profile fields (name "Max Mustermann", birth date 1990-03-15, etc.), no attachments, then Generate Docs with address "Musterstr. 1, 80331 München" and move-in 2026-08-01. Save the downloaded PDF as `/tmp/output_ts.pdf`.

- [ ] **Step 3: Compare visually, page by page**

Open both PDFs side by side. Verify:
- Every field sits at the same position on page 1 (address, move-in, name, marital status, birth date, current address split across two lines, phone, email, profession, net income, employer split, "beschäftigt seit …", landlord block, the "nein" X at top-right).
- Page 2: all eight "nein" X marks, "München, <date>" bottom-left, signature name bottom-right.
- Umlauts render correctly (München, beschäftigt) with no missing-glyph boxes.

- [ ] **Step 4: Verify attachments append correctly**

Add one multi-page PDF attachment in the popup, regenerate, and confirm the output is the 2 form pages followed by all attachment pages in order.

- [ ] **Step 5: If discrepancies found**

Any misaligned field means a coordinate typo in `drawPage1`/`drawPage2` — fix the specific coordinate in `documents.ts` (compare against the Python `create_overlay_page*` source), rebuild, recompare. Commit fixes:

```bash
git add apps/extension/src/popup/lib/documents.ts
git commit -m "fix(extension): correct <field> placement in Selbstauskunft PDF"
```

- [ ] **Step 6: Final confirmation**

Once the TS output visually matches the Python reference and attachments append correctly, the port is complete. Run the finishing-a-development-branch skill to decide on merge/PR.

---

## Self-Review Notes

- **Spec coverage:** Full replacement (Tasks 6-7 delete server route + Python app) ✓; template bundled in extension (Task 1) ✓; pdf-lib port with 1:1 coordinates (Task 3) ✓; persistent multi-attachment upload UI in popup (Tasks 2, 4) ✓; generation + download in popup, no base64 workaround (Task 5) ✓; error handling for missing template / missing fields / unreadable attachments (Task 3, 5) ✓; manual visual comparison (Task 8) ✓.
- **Type consistency:** `DocumentsFormData`, `AttachmentRecord`, and function names (`buildDocumentData`, `fillSelbstauskunft`, `documentFilename`, `addAttachment`, `listAttachments`, `deleteAttachment`) are used consistently across Tasks 2-5.
- **Ordering:** IDB module (T2) before documents.ts (T3) before UI (T4) and wiring (T5); deletions (T6-7) only after nothing references the old path.
