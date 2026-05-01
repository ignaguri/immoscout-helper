import type { PopupSettings } from './storage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s+()/-]{6,}$/;

type Validator = (v: unknown) => string | null;

function optional(check: Validator): Validator {
  return (v) => {
    if (v === '' || v === null || v === undefined) return null;
    return check(v);
  };
}

const emailV: Validator = optional((v) => (EMAIL_RE.test(String(v)) ? null : 'Invalid email'));
const phoneV: Validator = optional((v) => (PHONE_RE.test(String(v)) ? null : 'Invalid phone number'));

function numberRange(min: number, max: number): Validator {
  return optional((v) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 'Must be a number';
    if (n < min) return `Must be ≥ ${min}`;
    if (n > max) return 'Too high';
    return null;
  });
}

const validators = {
  profileEmail: emailV,
  profileLandlordEmail: emailV,
  formPhone: phoneV,
  profileLandlordPhone: phoneV,
  profileNetIncome: numberRange(0, 99999),
  profileMaxWarmmiete: numberRange(0, 99999),
  formIncome: numberRange(0, 50000),
} as const;

export type ValidatedField = keyof typeof validators;

export const REQUIRED_FIELDS: readonly (keyof PopupSettings)[] = [
  'profileName',
  'profileOccupation',
  'profileMovingReason',
  'profileBirthDate',
  'profileCurrentAddress',
  'profileEmail',
  'profileNetIncome',
  'profileEmployer',
  'formSalutation',
  'formPhone',
  'formAdults',
  'formEmployment',
  'formIncomeRange',
  'formHouseholdSize',
];

export function validateField(name: ValidatedField, value: unknown): string | null {
  return validators[name](value);
}

export function isFilled(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'number') return true;
  return String(v).trim() !== '';
}
