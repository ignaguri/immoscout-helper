<script lang="ts">
import type { PopupSettings } from '../lib/storage';
import { saveAllSettings } from '../lib/storage';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import * as Select from '$lib/components/ui/select';
import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
import Section from '$lib/components/Section.svelte';

let {
  settings = $bindable(),
  settingsLoaded = false,
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
} = $props();

const SAVED_FLASH_MS = 1200;

type SectionKey = 'about' | 'doc' | 'form';

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

let docOpen = $state(true);
let formOpen = $state(true);
let initialOpensSnapshotted = $state(false);
$effect(() => {
  if (settingsLoaded && !initialOpensSnapshotted) {
    docOpen = docFilled < DOC_FIELDS.length / 2;
    formOpen = formFilled < FORM_FIELDS.length / 2;
    initialOpensSnapshotted = true;
  }
});

let currentSection: SectionKey = $state('about');
let savedFlashSection: SectionKey | null = $state(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;
$effect(() => () => clearTimeout(flashTimer));

async function autoSave() {
  if (!settingsLoaded) return;
  const sec = currentSection;
  await saveAllSettings(settings);
  savedFlashSection = sec;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (savedFlashSection === sec) savedFlashSection = null;
  }, SAVED_FLASH_MS);
}

const maritalOptions = [
  { value: '', label: '-- Select --' },
  { value: 'Ledig', label: 'Ledig (Single)' },
  { value: 'Verheiratet', label: 'Verheiratet (Married)' },
  { value: 'Geschieden', label: 'Geschieden (Divorced)' },
  { value: 'Verwitwet', label: 'Verwitwet (Widowed)' },
  { value: 'Eingetragene Lebenspartnerschaft', label: 'Lebenspartnerschaft (Civil Union)' },
];
const salutationOptions = [
  { value: 'Frau', label: 'Frau' },
  { value: 'Herr', label: 'Herr' },
];
const yesNoOptions = [
  { value: 'Nein', label: 'Nein' },
  { value: 'Ja', label: 'Ja' },
];
const employmentOptions = [
  { value: 'Angestellte:r', label: 'Angestellte:r' },
  { value: 'Selbstständig', label: 'Selbstständig' },
  { value: 'Beamte:r', label: 'Beamte:r' },
  { value: 'Student:in', label: 'Student:in' },
  { value: 'Rentner:in', label: 'Rentner:in' },
  { value: 'Arbeitssuchend', label: 'Arbeitssuchend' },
];
const incomeRangeOptions = [
  { value: 'unter 500', label: 'unter 500' },
  { value: '500 - 1.000', label: '500 - 1.000' },
  { value: '1.000 - 1.500', label: '1.000 - 1.500' },
  { value: '1.500 - 2.000', label: '1.500 - 2.000' },
  { value: '2.000 - 3.000', label: '2.000 - 3.000' },
  { value: '3.000 - 4.000', label: '3.000 - 4.000' },
  { value: '4.000 - 5.000', label: '4.000 - 5.000' },
  { value: 'über 5.000', label: 'über 5.000' },
];
const householdOptions = [
  { value: 'Einpersonenhaushalt', label: 'Einpersonenhaushalt' },
  { value: 'Zweipersonenhaushalt', label: 'Zweipersonenhaushalt' },
  { value: 'Dreipersonenhaushalt', label: 'Dreipersonenhaushalt' },
  { value: 'Vierpersonenhaushalt', label: 'Vierpersonenhaushalt' },
  { value: 'Fünf und mehr Personen', label: '5+ Personen' },
];
const documentsOptions = [
  { value: 'Vorhanden', label: 'Vorhanden' },
  { value: 'Nicht vorhanden', label: 'Nicht vorhanden' },
];

function selectLabel(opts: { value: string; label: string }[], v: string): string {
  return opts.find((o) => o.value === v)?.label ?? v ?? '';
}
</script>

<div onfocusin={() => currentSection = 'about'}>
  <Section title={`About You (${aboutFilled}/${ABOUT_FIELDS.length} filled)`}>
    {#snippet actions()}
      {#if savedFlashSection === 'about'}
        <span class="text-[10px] text-success">✓ Saved</span>
      {/if}
    {/snippet}

    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-1.5">
        <Label for="profileName">Name</Label>
        <Input id="profileName" type="text" bind:value={settings.profileName} oninput={autoSave} onblur={autoSave} placeholder="Max Mustermann" />
      </div>
      <div class="space-y-1.5">
        <Label for="profileAge">Age</Label>
        <Input id="profileAge" type="number" bind:value={settings.profileAge} oninput={autoSave} onblur={autoSave} placeholder="30" />
      </div>
    </div>

    <div class="mt-3 space-y-1.5">
      <Label for="profileOccupation">Occupation</Label>
      <Input id="profileOccupation" type="text" bind:value={settings.profileOccupation} oninput={autoSave} onblur={autoSave} placeholder="Software Engineer" />
    </div>

    <div class="mt-3 space-y-1.5">
      <Label for="profileLanguages">Languages (comma-separated)</Label>
      <Input id="profileLanguages" type="text" bind:value={settings.profileLanguages} oninput={autoSave} onblur={autoSave} placeholder="Deutsch, English" />
    </div>

    <div class="mt-3 space-y-1.5">
      <Label for="profileMovingReason">Reason for Moving</Label>
      <Input id="profileMovingReason" type="text" bind:value={settings.profileMovingReason} oninput={autoSave} onblur={autoSave} placeholder="Relocating for work" />
    </div>

    <div class="mt-3 space-y-1.5">
      <Label for="profileCurrentNeighborhood">Current Neighborhood</Label>
      <Input id="profileCurrentNeighborhood" type="text" bind:value={settings.profileCurrentNeighborhood} oninput={autoSave} onblur={autoSave} placeholder="Kreuzberg" />
    </div>

    <div class="mt-3 space-y-1.5">
      <Label for="profileIdealApartment">Ideal Apartment</Label>
      <Input id="profileIdealApartment" type="text" bind:value={settings.profileIdealApartment} oninput={autoSave} onblur={autoSave} placeholder="2-room, balcony, quiet street" />
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="space-y-1.5">
        <Label for="profileMaxWarmmiete">Max Warmmiete</Label>
        <Input id="profileMaxWarmmiete" type="number" bind:value={settings.profileMaxWarmmiete} oninput={autoSave} onblur={autoSave} placeholder="1200" />
      </div>
      <div class="space-y-1.5">
        <Label for="profileDealbreakers">Dealbreakers</Label>
        <Input id="profileDealbreakers" type="text" bind:value={settings.profileDealbreakers} oninput={autoSave} onblur={autoSave} placeholder="no balcony, WBS" />
      </div>
    </div>

    <div class="mt-3 space-y-1.5">
      <Label for="profileStrengths">Strengths as Tenant</Label>
      <Input id="profileStrengths" type="text" bind:value={settings.profileStrengths} oninput={autoSave} onblur={autoSave} placeholder="stable income, non-smoker" />
    </div>
  </Section>
</div>

<CollapsibleSection title="Document Profile ({docFilled}/{DOC_FIELDS.length})" bind:open={docOpen}>
  {#snippet actions()}
    {#if savedFlashSection === 'doc'}<span class="text-[10px] text-success">✓ Saved</span>{/if}
  {/snippet}
    <div onfocusin={() => currentSection = 'doc'}>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="profileBirthDate">Birth Date</Label>
          <Input id="profileBirthDate" type="date" bind:value={settings.profileBirthDate} onchange={autoSave} />
        </div>
        <div class="space-y-1.5">
          <Label for="profileMaritalStatus">Marital Status</Label>
          <Select.Root type="single" bind:value={settings.profileMaritalStatus} onValueChange={autoSave}>
            <Select.Trigger id="profileMaritalStatus" class="w-full">
              {selectLabel(maritalOptions, settings.profileMaritalStatus)}
            </Select.Trigger>
            <Select.Content>
              {#each maritalOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="mt-3 space-y-1.5">
        <Label for="profileCurrentAddress">Current Address</Label>
        <Input id="profileCurrentAddress" type="text" bind:value={settings.profileCurrentAddress} oninput={autoSave} onblur={autoSave} placeholder="Musterstr. 1, 80331 München" />
      </div>

      <div class="mt-3 space-y-1.5">
        <Label for="profileEmail">Email</Label>
        <Input id="profileEmail" type="email" bind:value={settings.profileEmail} oninput={autoSave} onblur={autoSave} placeholder="name@example.com" />
      </div>

      <div class="mt-3 space-y-1.5">
        <Label for="profileNetIncome">Monthly Net Income (€)</Label>
        <Input id="profileNetIncome" type="number" bind:value={settings.profileNetIncome} oninput={autoSave} onblur={autoSave} min={0} max={99999} step="0.01" placeholder="5203.97" />
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="profileEmployer">Employer</Label>
          <Input id="profileEmployer" type="text" bind:value={settings.profileEmployer} oninput={autoSave} onblur={autoSave} placeholder="Acme GmbH, Musterstr. 1, 80331 München" />
        </div>
        <div class="space-y-1.5">
          <Label for="profileEmployedSince">Employed Since</Label>
          <Input id="profileEmployedSince" type="date" bind:value={settings.profileEmployedSince} onchange={autoSave} />
        </div>
      </div>

      <div class="mt-3 space-y-1.5">
        <Label for="profileCurrentLandlord">Current Landlord</Label>
        <Input id="profileCurrentLandlord" type="text" bind:value={settings.profileCurrentLandlord} oninput={autoSave} onblur={autoSave} placeholder="Name of current landlord" />
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="profileLandlordPhone">Landlord Phone</Label>
          <Input id="profileLandlordPhone" type="tel" bind:value={settings.profileLandlordPhone} oninput={autoSave} onblur={autoSave} placeholder="+49 179 …" />
        </div>
        <div class="space-y-1.5">
          <Label for="profileLandlordEmail">Landlord Email</Label>
          <Input id="profileLandlordEmail" type="email" bind:value={settings.profileLandlordEmail} oninput={autoSave} onblur={autoSave} placeholder="landlord@example.com" />
        </div>
      </div>
    </div>
</CollapsibleSection>

<CollapsibleSection title="Form Auto-Fill ({formFilled}/{FORM_FIELDS.length})" bind:open={formOpen}>
  {#snippet actions()}
    {#if savedFlashSection === 'form'}<span class="text-[10px] text-success">✓ Saved</span>{/if}
  {/snippet}
    <div onfocusin={() => currentSection = 'form'}>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="formSalutation">Salutation</Label>
          <Select.Root type="single" bind:value={settings.formSalutation} onValueChange={autoSave}>
            <Select.Trigger id="formSalutation" class="w-full">{selectLabel(salutationOptions, settings.formSalutation)}</Select.Trigger>
            <Select.Content>
              {#each salutationOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1.5">
          <Label for="formPhone">Phone</Label>
          <Input id="formPhone" type="tel" bind:value={settings.formPhone} oninput={autoSave} onblur={autoSave} placeholder="+49 170 1234567" />
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="formAdults">Adults</Label>
          <Input id="formAdults" type="number" bind:value={settings.formAdults} oninput={autoSave} onblur={autoSave} min={1} max={10} />
        </div>
        <div class="space-y-1.5">
          <Label for="formChildren">Children</Label>
          <Input id="formChildren" type="number" bind:value={settings.formChildren} oninput={autoSave} onblur={autoSave} min={0} max={10} />
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="formPets">Pets</Label>
          <Select.Root type="single" bind:value={settings.formPets} onValueChange={autoSave}>
            <Select.Trigger id="formPets" class="w-full">{selectLabel(yesNoOptions, settings.formPets)}</Select.Trigger>
            <Select.Content>
              {#each yesNoOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1.5">
          <Label for="formSmoker">Smoker</Label>
          <Select.Root type="single" bind:value={settings.formSmoker} onValueChange={autoSave}>
            <Select.Trigger id="formSmoker" class="w-full">{selectLabel(yesNoOptions, settings.formSmoker)}</Select.Trigger>
            <Select.Content>
              {#each yesNoOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="formEmployment">Employment</Label>
          <Select.Root type="single" bind:value={settings.formEmployment} onValueChange={autoSave}>
            <Select.Trigger id="formEmployment" class="w-full">{selectLabel(employmentOptions, settings.formEmployment)}</Select.Trigger>
            <Select.Content>
              {#each employmentOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1.5">
          <Label for="formIncomeRange">Income Range</Label>
          <Select.Root type="single" bind:value={settings.formIncomeRange} onValueChange={autoSave}>
            <Select.Trigger id="formIncomeRange" class="w-full">{selectLabel(incomeRangeOptions, settings.formIncomeRange)}</Select.Trigger>
            <Select.Content>
              {#each incomeRangeOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label for="formIncome">Income (net)</Label>
          <Input id="formIncome" type="number" bind:value={settings.formIncome} oninput={autoSave} onblur={autoSave} min={0} max={50000} />
        </div>
        <div class="space-y-1.5">
          <Label for="formHouseholdSize">Household Size</Label>
          <Select.Root type="single" bind:value={settings.formHouseholdSize} onValueChange={autoSave}>
            <Select.Trigger id="formHouseholdSize" class="w-full">{selectLabel(householdOptions, settings.formHouseholdSize)}</Select.Trigger>
            <Select.Content>
              {#each householdOptions as opt}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="mt-3 space-y-1.5">
        <Label for="formDocuments">Documents</Label>
        <Select.Root type="single" bind:value={settings.formDocuments} onValueChange={autoSave}>
          <Select.Trigger id="formDocuments" class="w-full">{selectLabel(documentsOptions, settings.formDocuments)}</Select.Trigger>
          <Select.Content>
            {#each documentsOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
</CollapsibleSection>
