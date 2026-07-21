export type Tone = 'default' | 'success' | 'destructive' | 'warning' | 'info' | 'secondary' | 'outline';

export const APPOINTMENT_STATUS_TONES: Record<string, Tone> = {
  accepted: 'success',
  rejected: 'destructive',
  alternative_requested: 'warning',
  pending: 'info',
};

export function scoreTone(score: number): Tone {
  if (score >= 6) return 'success';
  if (score >= 4) return 'warning';
  return 'destructive';
}
