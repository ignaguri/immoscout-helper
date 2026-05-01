<script lang="ts">
import type { PopupSettings } from '../lib/storage';
import { saveAllSettings } from '../lib/storage';
import { Input } from '$lib/components/ui/input';
import * as Select from '$lib/components/ui/select';
import { Progress } from '$lib/components/ui/progress';
import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
import Section from '$lib/components/Section.svelte';
import FormField from '$lib/components/FormField.svelte';
import {
  REQUIRED_FIELDS,
  errorAria,
  isFilled,
  validateField as validateFieldSchema,
  type ValidatedField,
} from '../lib/profile-schema';

let {
  settings = $bindable(),
  settingsLoaded = false,
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
} = $props();

const SAVED_FLASH_MS = 1200;
const SAVE_DEBOUNCE_MS = 400;
const REQUIRED_SET = new Set<keyof PopupSettings>(REQUIRED_FIELDS);

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

function filledCount(keys: (keyof PopupSettings)[]): number {
  return keys.filter((k) => isFilled(settings[k])).length;
}

let aboutFilled = $derived(filledCount(ABOUT_FIELDS));
let docFilled = $derived(filledCount(DOC_FIELDS));
let formFilled = $derived(filledCount(FORM_FIELDS));

let requiredFilled = $derived(REQUIRED_FIELDS.filter((k) => isFilled(settings[k])).length);

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
let saveTimer: ReturnType<typeof setTimeout> | undefined;
$effect(() => () => {
  clearTimeout(flashTimer);
  clearTimeout(saveTimer);
});

let errors = $state<Partial<Record<ValidatedField, string>>>({});

function validateOnBlur(field: ValidatedField) {
  const msg = validateFieldSchema(field, settings[field as keyof PopupSettings]);
  if (msg) {
    errors[field] = msg;
  } else {
    delete errors[field];
  }
}

function blurFor(field: ValidatedField) {
  return () => {
    autoSave();
    validateOnBlur(field);
  };
}

async function flushSave() {
  if (!settingsLoaded) return;
  const sec = currentSection;
  await saveAllSettings(settings);
  savedFlashSection = sec;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (savedFlashSection === sec) savedFlashSection = null;
  }, SAVED_FLASH_MS);
}

function autoSave() {
  if (!settingsLoaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
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

const isReq = (k: keyof PopupSettings) => REQUIRED_SET.has(k);
</script>

<div class="mb-3 rounded-md border border-border bg-muted/40 p-2.5">
  <div class="mb-1.5 flex items-center justify-between text-[11px]">
    <span class="font-semibold text-foreground">Profile completeness</span>
    <span class="text-muted-foreground">{requiredFilled} / {REQUIRED_FIELDS.length} critical fields</span>
  </div>
  <Progress value={requiredFilled} max={REQUIRED_FIELDS.length} />
</div>

<div onfocusin={() => currentSection = 'about'}>
  <Section title={`About You (${aboutFilled}/${ABOUT_FIELDS.length} filled)`}>
    {#snippet actions()}
      {#if savedFlashSection === 'about'}
        <span class="text-[10px] text-success">✓ Saved</span>
      {/if}
    {/snippet}

    <div class="grid grid-cols-2 gap-3">
      <FormField id="profileName" label="Name" required={isReq('profileName')}>
        <Input id="profileName" type="text" bind:value={settings.profileName} oninput={autoSave} onblur={autoSave} placeholder="Max Mustermann" />
      </FormField>
      <FormField id="profileAge" label="Age">
        <Input id="profileAge" type="number" bind:value={settings.profileAge} oninput={autoSave} onblur={autoSave} placeholder="30" />
      </FormField>
    </div>

    <FormField id="profileOccupation" label="Occupation" required={isReq('profileOccupation')} class="mt-3">
      <Input id="profileOccupation" type="text" bind:value={settings.profileOccupation} oninput={autoSave} onblur={autoSave} placeholder="Software Engineer" />
    </FormField>

    <FormField id="profileLanguages" label="Languages (comma-separated)" class="mt-3">
      <Input id="profileLanguages" type="text" bind:value={settings.profileLanguages} oninput={autoSave} onblur={autoSave} placeholder="Deutsch, English" />
    </FormField>

    <FormField id="profileMovingReason" label="Reason for Moving" required={isReq('profileMovingReason')} class="mt-3">
      <Input id="profileMovingReason" type="text" bind:value={settings.profileMovingReason} oninput={autoSave} onblur={autoSave} placeholder="Relocating for work" />
    </FormField>

    <FormField id="profileCurrentNeighborhood" label="Current Neighborhood" class="mt-3">
      <Input id="profileCurrentNeighborhood" type="text" bind:value={settings.profileCurrentNeighborhood} oninput={autoSave} onblur={autoSave} placeholder="Kreuzberg" />
    </FormField>

    <FormField id="profileIdealApartment" label="Ideal Apartment" class="mt-3">
      <Input id="profileIdealApartment" type="text" bind:value={settings.profileIdealApartment} oninput={autoSave} onblur={autoSave} placeholder="2-room, balcony, quiet street" />
    </FormField>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="profileMaxWarmmiete" label="Max Warmmiete" error={errors.profileMaxWarmmiete}>
        <Input
          id="profileMaxWarmmiete"
          type="number"
          bind:value={settings.profileMaxWarmmiete}
          {...errorAria('profileMaxWarmmiete', errors)}
          oninput={autoSave}
          onblur={blurFor('profileMaxWarmmiete')}
          placeholder="1200"
        />
      </FormField>
      <FormField id="profileDealbreakers" label="Dealbreakers">
        <Input id="profileDealbreakers" type="text" bind:value={settings.profileDealbreakers} oninput={autoSave} onblur={autoSave} placeholder="no balcony, WBS" />
      </FormField>
    </div>

    <FormField id="profileStrengths" label="Strengths as Tenant" class="mt-3">
      <Input id="profileStrengths" type="text" bind:value={settings.profileStrengths} oninput={autoSave} onblur={autoSave} placeholder="stable income, non-smoker" />
    </FormField>
  </Section>
</div>

<CollapsibleSection title="Document Profile ({docFilled}/{DOC_FIELDS.length})" bind:open={docOpen}>
  {#snippet actions()}
    {#if savedFlashSection === 'doc'}<span class="text-[10px] text-success">✓ Saved</span>{/if}
  {/snippet}
  <div onfocusin={() => currentSection = 'doc'}>
    <div class="grid grid-cols-2 gap-3">
      <FormField id="profileBirthDate" label="Birth Date" required={isReq('profileBirthDate')}>
        <Input id="profileBirthDate" type="date" bind:value={settings.profileBirthDate} onchange={autoSave} />
      </FormField>
      <FormField id="profileMaritalStatus" label="Marital Status">
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
      </FormField>
    </div>

    <FormField id="profileCurrentAddress" label="Current Address" required={isReq('profileCurrentAddress')} class="mt-3">
      <Input id="profileCurrentAddress" type="text" bind:value={settings.profileCurrentAddress} oninput={autoSave} onblur={autoSave} placeholder="Musterstr. 1, 80331 München" />
    </FormField>

    <FormField id="profileEmail" label="Email" required={isReq('profileEmail')} error={errors.profileEmail} class="mt-3">
      <Input
        id="profileEmail"
        type="email"
        bind:value={settings.profileEmail}
        {...errorAria('profileEmail', errors)}
        oninput={autoSave}
        onblur={blurFor('profileEmail')}
        placeholder="name@example.com"
      />
    </FormField>

    <FormField id="profileNetIncome" label="Monthly Net Income (€)" required={isReq('profileNetIncome')} error={errors.profileNetIncome} class="mt-3">
      <Input
        id="profileNetIncome"
        type="number"
        bind:value={settings.profileNetIncome}
        {...errorAria('profileNetIncome', errors)}
        oninput={autoSave}
        onblur={blurFor('profileNetIncome')}
        min={0}
        max={99999}
        step="0.01"
        placeholder="5203.97"
      />
    </FormField>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="profileEmployer" label="Employer" required={isReq('profileEmployer')}>
        <Input id="profileEmployer" type="text" bind:value={settings.profileEmployer} oninput={autoSave} onblur={autoSave} placeholder="Acme GmbH, Musterstr. 1, 80331 München" />
      </FormField>
      <FormField id="profileEmployedSince" label="Employed Since">
        <Input id="profileEmployedSince" type="date" bind:value={settings.profileEmployedSince} onchange={autoSave} />
      </FormField>
    </div>

    <FormField id="profileCurrentLandlord" label="Current Landlord" class="mt-3">
      <Input id="profileCurrentLandlord" type="text" bind:value={settings.profileCurrentLandlord} oninput={autoSave} onblur={autoSave} placeholder="Name of current landlord" />
    </FormField>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="profileLandlordPhone" label="Landlord Phone" error={errors.profileLandlordPhone}>
        <Input
          id="profileLandlordPhone"
          type="tel"
          bind:value={settings.profileLandlordPhone}
          {...errorAria('profileLandlordPhone', errors)}
          oninput={autoSave}
          onblur={blurFor('profileLandlordPhone')}
          placeholder="+49 179 …"
        />
      </FormField>
      <FormField id="profileLandlordEmail" label="Landlord Email" error={errors.profileLandlordEmail}>
        <Input
          id="profileLandlordEmail"
          type="email"
          bind:value={settings.profileLandlordEmail}
          {...errorAria('profileLandlordEmail', errors)}
          oninput={autoSave}
          onblur={blurFor('profileLandlordEmail')}
          placeholder="landlord@example.com"
        />
      </FormField>
    </div>
  </div>
</CollapsibleSection>

<CollapsibleSection title="Form Auto-Fill ({formFilled}/{FORM_FIELDS.length})" bind:open={formOpen}>
  {#snippet actions()}
    {#if savedFlashSection === 'form'}<span class="text-[10px] text-success">✓ Saved</span>{/if}
  {/snippet}
  <div onfocusin={() => currentSection = 'form'}>
    <div class="grid grid-cols-2 gap-3">
      <FormField id="formSalutation" label="Salutation" required={isReq('formSalutation')}>
        <Select.Root type="single" bind:value={settings.formSalutation} onValueChange={autoSave}>
          <Select.Trigger id="formSalutation" class="w-full">{selectLabel(salutationOptions, settings.formSalutation)}</Select.Trigger>
          <Select.Content>
            {#each salutationOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </FormField>
      <FormField id="formPhone" label="Phone" required={isReq('formPhone')} error={errors.formPhone}>
        <Input
          id="formPhone"
          type="tel"
          bind:value={settings.formPhone}
          {...errorAria('formPhone', errors)}
          oninput={autoSave}
          onblur={blurFor('formPhone')}
          placeholder="+49 170 1234567"
        />
      </FormField>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="formAdults" label="Adults" required={isReq('formAdults')}>
        <Input id="formAdults" type="number" bind:value={settings.formAdults} oninput={autoSave} onblur={autoSave} min={1} max={10} />
      </FormField>
      <FormField id="formChildren" label="Children">
        <Input id="formChildren" type="number" bind:value={settings.formChildren} oninput={autoSave} onblur={autoSave} min={0} max={10} />
      </FormField>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="formPets" label="Pets">
        <Select.Root type="single" bind:value={settings.formPets} onValueChange={autoSave}>
          <Select.Trigger id="formPets" class="w-full">{selectLabel(yesNoOptions, settings.formPets)}</Select.Trigger>
          <Select.Content>
            {#each yesNoOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </FormField>
      <FormField id="formSmoker" label="Smoker">
        <Select.Root type="single" bind:value={settings.formSmoker} onValueChange={autoSave}>
          <Select.Trigger id="formSmoker" class="w-full">{selectLabel(yesNoOptions, settings.formSmoker)}</Select.Trigger>
          <Select.Content>
            {#each yesNoOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </FormField>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="formEmployment" label="Employment" required={isReq('formEmployment')}>
        <Select.Root type="single" bind:value={settings.formEmployment} onValueChange={autoSave}>
          <Select.Trigger id="formEmployment" class="w-full">{selectLabel(employmentOptions, settings.formEmployment)}</Select.Trigger>
          <Select.Content>
            {#each employmentOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </FormField>
      <FormField id="formIncomeRange" label="Income Range" required={isReq('formIncomeRange')}>
        <Select.Root type="single" bind:value={settings.formIncomeRange} onValueChange={autoSave}>
          <Select.Trigger id="formIncomeRange" class="w-full">{selectLabel(incomeRangeOptions, settings.formIncomeRange)}</Select.Trigger>
          <Select.Content>
            {#each incomeRangeOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </FormField>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField id="formIncome" label="Income (net)" error={errors.formIncome}>
        <Input
          id="formIncome"
          type="number"
          bind:value={settings.formIncome}
          {...errorAria('formIncome', errors)}
          oninput={autoSave}
          onblur={blurFor('formIncome')}
          min={0}
          max={50000}
        />
      </FormField>
      <FormField id="formHouseholdSize" label="Household Size" required={isReq('formHouseholdSize')}>
        <Select.Root type="single" bind:value={settings.formHouseholdSize} onValueChange={autoSave}>
          <Select.Trigger id="formHouseholdSize" class="w-full">{selectLabel(householdOptions, settings.formHouseholdSize)}</Select.Trigger>
          <Select.Content>
            {#each householdOptions as opt}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </FormField>
    </div>

    <FormField id="formDocuments" label="Documents" class="mt-3">
      <Select.Root type="single" bind:value={settings.formDocuments} onValueChange={autoSave}>
        <Select.Trigger id="formDocuments" class="w-full">{selectLabel(documentsOptions, settings.formDocuments)}</Select.Trigger>
        <Select.Content>
          {#each documentsOptions as opt}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </FormField>
  </div>
</CollapsibleSection>
