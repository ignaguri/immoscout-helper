<script lang="ts">
import CollapsibleSection from '../components/CollapsibleSection.svelte';
import type { PopupSettings } from '../lib/storage';
import { saveAllSettings } from '../lib/storage';

let {
  settings = $bindable(),
  settingsLoaded = false,
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
} = $props();

const SAVED_FLASH_MS = 1200;

type Section = 'about' | 'doc' | 'form';

const ABOUT_FIELDS: (keyof PopupSettings)[] = [
  'profileName', 'profileAge', 'profileOccupation', 'profileLanguages',
  'profileMovingReason', 'profileCurrentNeighborhood', 'profileIdealApartment',
  'profileMaxWarmmiete', 'profileDealbreakers', 'profileStrengths',
];
const DOC_FIELDS: (keyof PopupSettings)[] = [
  'profileBirthDate', 'profileMaritalStatus', 'profileCurrentAddress', 'profileEmail',
  'profileNetIncome', 'profileEmployer', 'profileEmployedSince',
  'profileCurrentLandlord', 'profileLandlordPhone', 'profileLandlordEmail',
];
const FORM_FIELDS: (keyof PopupSettings)[] = [
  'formSalutation', 'formPhone', 'formAdults', 'formChildren', 'formPets',
  'formSmoker', 'formEmployment', 'formIncomeRange', 'formIncome',
  'formHouseholdSize', 'formDocuments',
];

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'number') return true;
  return String(v).trim() !== '';
}
function filledCount(keys: (keyof PopupSettings)[]): number {
  return keys.filter((k) => isFilled(settings[k])).length;
}

let aboutFilled = $derived(filledCount(ABOUT_FIELDS));
let docFilled = $derived(filledCount(DOC_FIELDS));
let formFilled = $derived(filledCount(FORM_FIELDS));

// Open the secondary sections by default when the user has barely started filling them in,
// so the missing fields are visible without an extra click. Power users with full profiles
// keep them collapsed. Snapshot once after settings load — don't reactively re-collapse
// while the user is editing.
let docOpenInitial = $state(true);
let formOpenInitial = $state(true);
let initialOpensSnapshotted = $state(false);
$effect(() => {
  if (settingsLoaded && !initialOpensSnapshotted) {
    docOpenInitial = docFilled < DOC_FIELDS.length / 2;
    formOpenInitial = formFilled < FORM_FIELDS.length / 2;
    initialOpensSnapshotted = true;
  }
});

let currentSection: Section = $state('about');
let savedFlashSection: Section | null = $state(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;
$effect(() => () => clearTimeout(flashTimer));

async function autoSave() {
  if (!settingsLoaded) return;
  // Snapshot section before the await so a focus change mid-save doesn't
  // make the "✓ Saved" flash land on the wrong section.
  const sec = currentSection;
  await saveAllSettings(settings);
  savedFlashSection = sec;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (savedFlashSection === sec) savedFlashSection = null;
  }, SAVED_FLASH_MS);
}

let aboutTitle = $derived(`About You (${aboutFilled}/${ABOUT_FIELDS.length} filled)${savedFlashSection === 'about' ? '  ✓ Saved' : ''}`);
let docTitle = $derived(`Document Profile (${docFilled}/${DOC_FIELDS.length})${savedFlashSection === 'doc' ? '  ✓ Saved' : ''}`);
let formTitle = $derived(`Form Auto-Fill (${formFilled}/${FORM_FIELDS.length})${savedFlashSection === 'form' ? '  ✓ Saved' : ''}`);
</script>

<div onfocusin={() => currentSection = 'about'}>
  <div class="section-title" style="margin-top:0; padding-top:0; border-top:none; display:flex; justify-content:space-between; align-items:baseline;">
    <span>{aboutTitle}</span>
  </div>

  <div class="grid-2">
    <div class="field">
      <label for="profileName">Name</label>
      <input type="text" id="profileName" bind:value={settings.profileName} oninput={autoSave} onblur={autoSave} placeholder="Max Mustermann" />
    </div>
    <div class="field">
      <label for="profileAge">Age</label>
      <input type="number" id="profileAge" bind:value={settings.profileAge} oninput={autoSave} onblur={autoSave} placeholder="30" />
    </div>
  </div>

  <div class="field">
    <label for="profileOccupation">Occupation</label>
    <input type="text" id="profileOccupation" bind:value={settings.profileOccupation} oninput={autoSave} onblur={autoSave} placeholder="Software Engineer" />
  </div>

  <div class="field">
    <label for="profileLanguages">Languages (comma-separated)</label>
    <input type="text" id="profileLanguages" bind:value={settings.profileLanguages} oninput={autoSave} onblur={autoSave} placeholder="Deutsch, English" />
  </div>

  <div class="field">
    <label for="profileMovingReason">Reason for Moving</label>
    <input type="text" id="profileMovingReason" bind:value={settings.profileMovingReason} oninput={autoSave} onblur={autoSave} placeholder="Relocating for work" />
  </div>

  <div class="field">
    <label for="profileCurrentNeighborhood">Current Neighborhood</label>
    <input type="text" id="profileCurrentNeighborhood" bind:value={settings.profileCurrentNeighborhood} oninput={autoSave} onblur={autoSave} placeholder="Kreuzberg" />
  </div>

  <div class="field">
    <label for="profileIdealApartment">Ideal Apartment</label>
    <input type="text" id="profileIdealApartment" bind:value={settings.profileIdealApartment} oninput={autoSave} onblur={autoSave} placeholder="2-room, balcony, quiet street" />
  </div>

  <div class="grid-2">
    <div class="field">
      <label for="profileMaxWarmmiete">Max Warmmiete</label>
      <input type="number" id="profileMaxWarmmiete" bind:value={settings.profileMaxWarmmiete} oninput={autoSave} onblur={autoSave} placeholder="1200" />
    </div>
    <div class="field">
      <label for="profileDealbreakers">Dealbreakers</label>
      <input type="text" id="profileDealbreakers" bind:value={settings.profileDealbreakers} oninput={autoSave} onblur={autoSave} placeholder="no balcony, WBS" />
    </div>
  </div>

  <div class="field">
    <label for="profileStrengths">Strengths as Tenant</label>
    <input type="text" id="profileStrengths" bind:value={settings.profileStrengths} oninput={autoSave} onblur={autoSave} placeholder="stable income, non-smoker" />
  </div>
</div>

<CollapsibleSection title={docTitle} open={docOpenInitial}>
  <div onfocusin={() => currentSection = 'doc'}>
    <div class="grid-2">
      <div class="field">
        <label for="profileBirthDate">Birth Date</label>
        <input type="date" id="profileBirthDate" bind:value={settings.profileBirthDate} onchange={autoSave} />
      </div>
      <div class="field">
        <label for="profileMaritalStatus">Marital Status</label>
        <select id="profileMaritalStatus" bind:value={settings.profileMaritalStatus} onchange={autoSave}>
          <option value="">-- Select --</option>
          <option value="Ledig">Ledig (Single)</option>
          <option value="Verheiratet">Verheiratet (Married)</option>
          <option value="Geschieden">Geschieden (Divorced)</option>
          <option value="Verwitwet">Verwitwet (Widowed)</option>
          <option value="Eingetragene Lebenspartnerschaft">Lebenspartnerschaft (Civil Union)</option>
        </select>
      </div>
    </div>

    <div class="field">
      <label for="profileCurrentAddress">Current Address</label>
      <input type="text" id="profileCurrentAddress" bind:value={settings.profileCurrentAddress} oninput={autoSave} onblur={autoSave} placeholder="Musterstr. 1, 80331 München" />
    </div>

    <div class="field">
      <label for="profileEmail">Email</label>
      <input type="email" id="profileEmail" bind:value={settings.profileEmail} oninput={autoSave} onblur={autoSave} placeholder="name@example.com" />
    </div>

    <div class="field">
      <label for="profileNetIncome">Monthly Net Income (€)</label>
      <input type="number" id="profileNetIncome" bind:value={settings.profileNetIncome} oninput={autoSave} onblur={autoSave} min="0" max="99999" step="0.01" placeholder="5203.97" />
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="profileEmployer">Employer</label>
        <input type="text" id="profileEmployer" bind:value={settings.profileEmployer} oninput={autoSave} onblur={autoSave} placeholder="Acme GmbH, Musterstr. 1, 80331 München" />
      </div>
      <div class="field">
        <label for="profileEmployedSince">Employed Since</label>
        <input type="date" id="profileEmployedSince" bind:value={settings.profileEmployedSince} onchange={autoSave} />
      </div>
    </div>

    <div class="field">
      <label for="profileCurrentLandlord">Current Landlord</label>
      <input type="text" id="profileCurrentLandlord" bind:value={settings.profileCurrentLandlord} oninput={autoSave} onblur={autoSave} placeholder="Name of current landlord" />
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="profileLandlordPhone">Landlord Phone</label>
        <input type="tel" id="profileLandlordPhone" bind:value={settings.profileLandlordPhone} oninput={autoSave} onblur={autoSave} placeholder="+49 179 ..." />
      </div>
      <div class="field">
        <label for="profileLandlordEmail">Landlord Email</label>
        <input type="email" id="profileLandlordEmail" bind:value={settings.profileLandlordEmail} oninput={autoSave} onblur={autoSave} placeholder="landlord@example.com" />
      </div>
    </div>
  </div>
</CollapsibleSection>

<CollapsibleSection title={formTitle} open={formOpenInitial}>
  <div onfocusin={() => currentSection = 'form'}>
    <div class="grid-2">
      <div class="field">
        <label for="formSalutation">Salutation</label>
        <select id="formSalutation" bind:value={settings.formSalutation} onchange={autoSave}>
          <option value="Frau">Frau</option>
          <option value="Herr">Herr</option>
        </select>
      </div>
      <div class="field">
        <label for="formPhone">Phone</label>
        <input type="tel" id="formPhone" bind:value={settings.formPhone} oninput={autoSave} onblur={autoSave} placeholder="+49 170 1234567" />
      </div>
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="formAdults">Adults</label>
        <input type="number" id="formAdults" bind:value={settings.formAdults} oninput={autoSave} onblur={autoSave} min="1" max="10" />
      </div>
      <div class="field">
        <label for="formChildren">Children</label>
        <input type="number" id="formChildren" bind:value={settings.formChildren} oninput={autoSave} onblur={autoSave} min="0" max="10" />
      </div>
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="formPets">Pets</label>
        <select id="formPets" bind:value={settings.formPets} onchange={autoSave}>
          <option value="Nein">Nein</option>
          <option value="Ja">Ja</option>
        </select>
      </div>
      <div class="field">
        <label for="formSmoker">Smoker</label>
        <select id="formSmoker" bind:value={settings.formSmoker} onchange={autoSave}>
          <option value="Nein">Nein</option>
          <option value="Ja">Ja</option>
        </select>
      </div>
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="formEmployment">Employment</label>
        <select id="formEmployment" bind:value={settings.formEmployment} onchange={autoSave}>
          <option value="Angestellte:r">Angestellte:r</option>
          <option value="Selbstständig">Selbstständig</option>
          <option value="Beamte:r">Beamte:r</option>
          <option value="Student:in">Student:in</option>
          <option value="Rentner:in">Rentner:in</option>
          <option value="Arbeitssuchend">Arbeitssuchend</option>
        </select>
      </div>
      <div class="field">
        <label for="formIncomeRange">Income Range</label>
        <select id="formIncomeRange" bind:value={settings.formIncomeRange} onchange={autoSave}>
          <option value="unter 500">unter 500</option>
          <option value="500 - 1.000">500 - 1.000</option>
          <option value="1.000 - 1.500">1.000 - 1.500</option>
          <option value="1.500 - 2.000">1.500 - 2.000</option>
          <option value="2.000 - 3.000">2.000 - 3.000</option>
          <option value="3.000 - 4.000">3.000 - 4.000</option>
          <option value="4.000 - 5.000">4.000 - 5.000</option>
          <option value="über 5.000">über 5.000</option>
        </select>
      </div>
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="formIncome">Income (net)</label>
        <input type="number" id="formIncome" bind:value={settings.formIncome} oninput={autoSave} onblur={autoSave} min="0" max="50000" />
      </div>
      <div class="field">
        <label for="formHouseholdSize">Household Size</label>
        <select id="formHouseholdSize" bind:value={settings.formHouseholdSize} onchange={autoSave}>
          <option value="Einpersonenhaushalt">Einpersonenhaushalt</option>
          <option value="Zweipersonenhaushalt">Zweipersonenhaushalt</option>
          <option value="Dreipersonenhaushalt">Dreipersonenhaushalt</option>
          <option value="Vierpersonenhaushalt">Vierpersonenhaushalt</option>
          <option value="Fünf und mehr Personen">5+ Personen</option>
        </select>
      </div>
    </div>

    <div class="field">
      <label for="formDocuments">Documents</label>
      <select id="formDocuments" bind:value={settings.formDocuments} onchange={autoSave}>
        <option value="Vorhanden">Vorhanden</option>
        <option value="Nicht vorhanden">Nicht vorhanden</option>
      </select>
    </div>
  </div>
</CollapsibleSection>
