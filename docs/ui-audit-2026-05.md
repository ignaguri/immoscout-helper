# Popup UI Audit — May 2026

A snapshot of the extension popup's design state and a roadmap for the work
that was deliberately left out of the May 2026 "tokens + targeted UX" pass.
Use this as the starting point for a future overhaul that goes all the way:
reusable primitives, IA rework, dark mode, accessibility.

## TL;DR

- The popup grew organically across 5 tabs and ~10 sub-components without a
  shared design language. Colors, spacing, font sizes, button variants, and
  badge styles were each picked by feel.
- May 2026 introduced a **minimal CSS-variable token layer** in
  `extension/src/popup/App.svelte` and used it to fix the
  highest-friction screens (Activity / Queue, plus targeted polish on
  Settings, Profile, Conversations).
- **Reusable Svelte primitives, IA rework, dark mode, and a full a11y sweep
  were explicitly deferred.** That is the work this document scopes.

## Snapshot of the previous state (pre-tokens)

Numbers from a sweep of `extension/src/popup/`:

| Dimension | Value | Notes |
|---|---|---|
| Distinct hex colors | ~56 | grays alone: `#1a1a1a`, `#333`, `#444`, `#555`, `#666`, `#888`, `#999`, `#aaa`, `#bbb`, `#ccc`, `#ddd`, `#eee`, `#f0f0f0`, `#f5f5f5`, `#fafafa` |
| Distinct font sizes | 9 | `9px`, `10px`, `11px` (54 occurrences alone), `12px`, `13px`, `14px`, `15px`, `16px`, `18px` |
| Spacing values used | 10+ | `4`, `6`, `8`, `10`, `12`, `14`, `16`, `20`, `40` — no 8px base discipline |
| CSS variables | 0 | All values literal |
| Button variants | 6+ | `.btn`, `.btn-secondary`, `.btn-test`, `.btn-danger`, `.btn-pending-sm`, `.btn-decision`, `.btn-capture`, `.snap-btn`, `.snap-save`, `.toggle-btn.start/.stop` |
| Badge patterns | 3+ | `.tab-badge`, `.snap-badge`, appointment-status badge, AI status pill — none unified |
| Inline styles | Pervasive | Especially in `ActivityLogEntry`, `ConversationCard`, `SettingsTab` |
| Brand teal | 2 values | `#83F1DC` (header / primary) and `#3dbda8` (snap-save / active tab text) |
| `prefers-color-scheme` | None | Light only, all colors hardcoded |

Where styles live: ~500 lines of global CSS in `App.svelte`, plus per-component scoped `<style>` blocks, plus inline `style="..."` attributes scattered across components.

## Per-tab UX issues (pre-May 2026)

### `App.svelte` (header / tabs / stats bar / toggle)

- Stats bar labels were `9px` uppercase — illegible at a glance.
- Toggle button disabled state had no on-screen reason; only a `title` tooltip mentioned why.
- Header status badge subtle; status colors competed with the brand gradient.

### `ActivityTab.svelte` (~600 lines)

- **Pending Approval** rows used `.btn-pending-sm` (`3px` padding, `11px` font). Approve/Skip looked equal, and both were tiny — the most consequential decision in the UI was the smallest target.
- **Activity log** auto-scrolled to bottom unconditionally on every new entry. Users trying to read older entries got their scroll yanked.
- **Empty states** for the queue / pending approval were single gray text strings with no visual treatment.
- **Capture status** rendered at `#888` on white — low contrast.
- Heavy use of `<CollapsibleSection>` (5 sections in this tab alone) hid functionality; nothing on screen indicated what was inside until the user clicked.

### `ProfileTab.svelte` (~230 lines)

- 35+ flat fields across three sections. No "X of Y filled" signal — users had no way to gauge profile completeness.
- Both secondary collapsibles (`Document Profile`, `Form Auto-Fill`) defaulted closed. New users with empty profiles didn't know what was missing.
- Auto-save was silent — no confirmation that data persisted.
- No required vs. optional distinction; no validation feedback.

### `SettingsTab.svelte` (~900 lines)

- ~50 settings in one tab. The AI Configuration section had deep conditional nesting (`isLitellm` × `aiMode === 'server'` × `aiServerConnected`) that produced different layouts depending on state.
- AI status pill crammed three different reasons into one string: `Invalid API key or unreachable`, `Paste your API key to get started`, `Server unreachable`. Pill width changed with state.
- Yellow "AI Prompts" warning box used custom colors that read more like a tinted note than a warning.
- Placeholder chip legend required hovering individual chips to discover what they did; no caption explained the affordance.
- Setup-instructions box only appeared when `aiMode === 'server' && !aiServerConnected` — easily missed when toggling modes.
- Cost line: `Managed by proxy` for LiteLLM was vague.

### `ConversationsTab.svelte`

- Filter pills wrapped on narrow widths; active state (`#e8eaff` bg) was too close to the inactive look.
- Search input sat *below* the filter row, even though search is the more frequent action when scanning >10 conversations.
- Per-conversation unread indication was fine in `ConversationCard` itself but not summarized at the tab level beyond the `replies` tab badge.

### Components

- **`ConversationCard.svelte`** — snapshot button row crammed 5–6 buttons (View / HTML / PDF / ZIP / Delete) into a single `flex-wrap` row. Mixed emoji buttons (📦, 🗑) with text buttons.
- **`ActivityLogEntry.svelte`** — error-detail toggle was an icon-only button (ⓘ ↔ ▾); duplicate-decision buttons (`Send Anyway` / `Skip`) used teal vs. gray with no clear primary.
- **`AnalyzeSection.svelte`** — buried at the bottom of `ActivityTab`; test result box appears inline.
- **`DraftReplySection.svelte`** — large nested composer with multiple action buttons; not touched in this pass.
- **`ManualReviewPanel.svelte`** — critical decision UI; not touched.
- **`AppointmentSection.svelte`** — colored status badges with hard-coded color objects: `{pending: '#e8eaff', accepted: '#d4edda', rejected: '#f8d7da', alternative_requested: '#fff3cd'}`.

## What May 2026 fixed

### Tokens (in `App.svelte` `:root`)

```css
--color-brand        --color-brand-hover        --color-brand-strong
--color-text         --color-text-muted         --color-text-subtle
--color-border       --color-bg                 --color-bg-subtle
--color-success-bg/-fg   --color-warning-bg/-fg
--color-danger-bg/-fg    --color-info-bg/-fg
--space-1..--space-6     (4/8/12/16/20/24)
--text-xs..--text-lg     (11/12/13/14/16)
--radius-sm/md/lg        (4/6/8)
--transition-fast        (0.15s ease)
```

Global rules in `App.svelte` were migrated to use these. Per-component scoped styles were left alone unless they were already being touched.

### Targeted UX changes shipped

| Area | Change |
|---|---|
| App header | Stats bar labels `11px` non-uppercase, muted color |
| App header | Toggle disabled-state inline reason line below button |
| Activity / Pending Approval | Restructured rows with full-width primary `Approve` button, secondary `Skip` outline button, breathing room between items |
| Activity / Log | Stick-to-bottom auto-scroll only when user is already at bottom (`scrollTop + clientHeight >= scrollHeight - 10`) |
| Activity / Queue + Log | Real empty-state component (dashed border, headline + sub-line) |
| Activity / Capture | Capture status uses `--color-text-muted`; capture button has `aria-busy` |
| Activity log entries | Error toggle now reads `Show details ›` / `Hide details ›` with rotating chevron |
| Activity log entries | Duplicate-decision buttons: `Send Anyway` is brand-color primary, `Skip` is outline-secondary |
| Settings / AI | Status pill now `Connected` / `Disconnected` only; specific reason on a second line below |
| Settings / Prompts | Yellow warning box uses tokens (`--color-warning-bg`/`-fg`) and a visible left border |
| Settings / Prompts | Persistent `These tokens get replaced at runtime…` caption under the placeholder chips |
| Profile | Section titles show `(X / Y filled)` |
| Profile | Secondary collapsibles default open when <50% filled (snapshotted once after settings load — no mid-edit collapse) |
| Profile | `✓ Saved` flash next to whichever section the user is currently editing (1.2s) |
| Conversations | Search input moved above filter row |
| Conversations | Active filter pill: brand background + leading `✓` checkmark |
| Globals | New `.empty-state`, `.empty-state-headline`, `.empty-state-sub` utility classes for any future empty states |

## Deferred work — roadmap for a full overhaul

### 1. Reusable Svelte primitives

These should be the foundation of any future redesign. Each one absorbs a class
of ad-hoc markup that is currently duplicated.

- **`<Button variant="primary | secondary | danger | ghost" size="sm | md | lg" loading icon>`**
  - Replaces: `.btn`, `.btn-secondary`, `.btn-test`, `.btn-danger`, `.btn-pending-sm`, `.btn-decision`, `.btn-capture`, `.snap-btn`, `.snap-save`, `.toggle-btn`, custom inline-style buttons.
  - Built-in disabled / loading / icon support so we stop having two ways to render every button.
- **`<Badge tone="success | warning | danger | info | neutral | brand" size>`**
  - Replaces: `.tab-badge`, `.snap-badge`, AI status pill, appointment-status badge, all colored "pill" elements.
  - Should consume the existing `--color-*-bg/-fg` token pairs.
- **`<FormField label hint error required>` wrapping `<input>` / `<select>` / `<textarea>`**
  - Replaces: the `<div class="field">` + `<label>` + input + `<div class="hint">` boilerplate that's repeated ~80 times.
  - Add `error` slot for validation feedback (currently absent).
- **`<EmptyState icon title sub action>`**
  - Replaces: ad-hoc empty divs in queue / activity log / conversations / pending approval.
  - The May 2026 pass added the underlying CSS classes; promote to a real component.
- **`<StatusPill state reason>`** (or fold into `Badge`)
  - Replaces: `.ai-status` + `.ai-status-reason` pattern.
  - Encapsulates the "short label + secondary reason" idiom.
- **`<CollapsibleSection title icon>`** already exists — extend to support
  `Snippet`-typed titles (so X/Y counters and saved-flash indicators don't have
  to be embedded as plain text in the title string, as ProfileTab currently
  does).
- **`<Section title actions>`** — wraps the existing `.section-title`
  pattern and supports trailing actions (e.g. a `Clear` button, the `Saved`
  flash) without forcing inline-flex hacks.

### 2. SettingsTab IA rework

Even with tokens, SettingsTab is a wall of ~50 settings. Suggested split:

- **Provider** — mode (direct/server), provider dropdown, OIDC config or API key
- **Credentials** — API keys, password fields (separate panel so credentials aren't mixed with operational config)
- **Prompts** — system prompts, placeholder reference, validation
- **Usage** — token counts, cost, reset
- **Notifications** — already collapsible; promote to its own subsection

Consider a left-rail sub-nav within the Settings tab once it grows past ~5
subsections, instead of vertical scrolling.

### 3. ProfileTab as a wizard or completeness-driven layout

The May 2026 X/Y counter is a Band-Aid. A real fix:

- Mark fields as `required` (for AI personalization) vs. `optional` (cosmetic)
- Progress indicator at the top: `7 / 14 critical fields filled`
- Optional wizard mode for first-run users that walks through critical fields one at a time
- Validation feedback (email format, phone format)

### 4. ConversationCard action density

The snapshot row is the worst offender. Collapse `View / HTML / PDF / ZIP /
Delete` behind a single overflow menu (`⋯` button → popover with all actions).
Same treatment for any other row with >3 actions.

### 5. Migrate scoped per-component styles to tokens

The May 2026 pass migrated `App.svelte` global rules. Scoped styles in
`ActivityTab`, `ConversationCard`, `DraftReplySection`,
`AppointmentSection`, `ManualReviewPanel`, `AnalyzeSection`, etc. still
hardcode colors and spacing. Sweep them in a follow-up PR.

### 6. Dark mode

Tokens are structured to support it (every literal color is behind a CSS variable now). Add:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a1a;
    --color-bg-subtle: #242424;
    --color-text: #f5f5f5;
    /* etc. */
  }
}
```

Validate that the gradient header still reads correctly; consider a darker
brand tint for dark mode.

### 7. Accessibility sweep

- Visible focus rings on all interactive elements (currently `outline: none`
  in many places without replacement)
- ARIA labels on icon-only buttons (📦, 🗑, ⋯, ›, etc.)
- Keyboard nav through `CollapsibleSection` (`Enter` and `Space` already
  work; verify `Tab` / `Shift+Tab` don't skip the chevron-rotating header)
- Contrast audit using a tool like axe-core — several `#888 on white` pairings
  were borderline before tokens; recheck with new values
- `aria-live` on the activity log so screen readers announce new entries
  (currently silent)
- Confirm `aria-busy` and `aria-expanded` patterns used in May 2026 are
  consistent across all similar components

## Risks and constraints any future overhaul must respect

- **Popup width:** ~400px. Multi-column layouts beyond `grid-2` (1fr 1fr) are
  awkward. Test at 320px (the `min-width` from `App.svelte`).
- **Storage layer:** all settings live in `chrome.storage.local`. Refactoring
  the popup must not break the storage keys defined in
  `extension/src/shared/constants.ts` (those are also read by
  `background.ts` and `content.ts`).
- **Content script DOM contracts:** the content script fills DOM forms on
  ImmoScout24 using class names and attribute lookups (see
  `extension/src/content/forms/*`). Don't blanket-rename popup classes
  without checking — accidentally touching a class that the form-fill code
  reads would break message sending.
- **Build pipeline:** popup is built as an ES module; background and content
  scripts as IIFEs. Any new shared component must work in both Svelte's
  runtime (popup) and any future content-script use case.
- **Bundle size:** the popup runs on every action-icon click. New
  dependencies (UI libraries, icon sets) should be vetted for impact on
  cold-start time.
- **Rendering quirks:** `CollapsibleSection`'s `open` prop is only respected
  until the user manually toggles. A future redesign may want a different
  contract (controlled vs. uncontrolled). Document the choice.
- **State-during-load:** several derived values (e.g. profile completeness)
  reference settings that load asynchronously. Use one-shot effects gated on
  `settingsLoaded` rather than reactive `$derived` to avoid mid-edit
  recomputation (see `ProfileTab.svelte`'s `initialOpensSnapshotted`
  pattern).

## Files touched in May 2026 (for diffing)

- `extension/src/popup/App.svelte` — tokens, header polish, stats bar, toggle reason, global rule migration, `.empty-state` utility
- `extension/src/popup/tabs/ActivityTab.svelte` — pending approval, scroll fix, empty states, capture status, aria-busy
- `extension/src/popup/components/ActivityLogEntry.svelte` — error toggle text, duplicate decision buttons
- `extension/src/popup/tabs/SettingsTab.svelte` — status pill split, warning box, placeholder caption
- `extension/src/popup/tabs/ProfileTab.svelte` — completeness counts, default-open logic, save flash
- `extension/src/popup/tabs/ConversationsTab.svelte` — search reorder, active filter pill
