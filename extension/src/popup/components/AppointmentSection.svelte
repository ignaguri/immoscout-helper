<script lang="ts">
import type { ConversationEntry } from '../../shared/types';
import { buildGoogleCalendarUrl, downloadICS } from '../lib/calendar';
import { respondToAppointment } from '../lib/messages';
import { APPOINTMENT_STATUS_TONES } from '../lib/tone';
import { Button } from '$lib/components/ui/button';
import { Textarea } from '$lib/components/ui/textarea';
import { Badge } from '$lib/components/ui/badge';
import { cn } from '$lib/utils';

let {
  conversation,
}: {
  conversation: ConversationEntry;
} = $props();

let apptBtnsDisabled = $state(false);
let apptResultText = $state('');
let apptResultIsError = $state(false);
let apptUserContext = $state('');

let apptDate = $derived.by(() => {
  const appt = conversation.appointment;
  if (!appt) return '';
  if (appt.start) {
    const d = new Date(appt.start);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return appt.date || appt.startDate || '';
});
let apptTime = $derived.by(() => {
  const appt = conversation.appointment;
  if (!appt) return '';
  if (appt.start) {
    const d = new Date(appt.start);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return appt.time || appt.startTime || '';
});
let apptDuration = $derived.by(() => {
  const appt = conversation.appointment;
  if (!appt) return '';
  if (typeof appt.duration === 'number') return `${appt.duration} min`;
  return String(appt.duration || '');
});
let apptLocation = $derived(conversation.appointment?.address || conversation.appointment?.location || '');

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  alternative_requested: 'Alternative requested',
  pending: 'Pending',
};

async function handleAppointmentResponse(response: string, _btnLabel: string) {
  const appt = conversation.appointment;
  let apptDateVal = appt?.date || appt?.startDate || '';
  let apptTimeVal = appt?.time || appt?.startTime || '';
  if (appt?.start) {
    const d = new Date(appt.start);
    if (!Number.isNaN(d.getTime())) {
      apptDateVal = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      apptTimeVal = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
  }
  const apptLocationVal = appt?.address || appt?.location || '';

  apptBtnsDisabled = true;
  apptResultText = 'Processing…';
  apptResultIsError = false;
  try {
    const result = await respondToAppointment(conversation.conversationId, response, apptUserContext.trim(), {
      date: apptDateVal,
      time: apptTimeVal,
      location: apptLocationVal,
    });
    if (result.success) {
      apptResultText = 'Tab opened — review & send';
      apptResultIsError = false;
    } else {
      apptResultText = `Failed: ${result.error || 'unknown'}`;
      apptResultIsError = true;
    }
  } catch (e: any) {
    apptResultText = `Error: ${e.message}`;
    apptResultIsError = true;
  }
  setTimeout(() => {
    apptBtnsDisabled = false;
    apptResultText = '';
    apptResultIsError = false;
  }, 5000);
}
</script>

{#if conversation.appointment && conversation.appointmentStatus === 'pending'}
  <div class="mt-2 rounded-lg border border-info/30 bg-info/10 p-2.5">
    <div class="mb-1.5 text-[11px] font-semibold text-foreground">Besichtigungstermin</div>
    <div class="mb-2 text-[11px] leading-relaxed text-foreground/70">
      {#if apptDate}Datum: {apptDate}<br>{/if}
      {#if apptTime}Zeit: {apptTime}{#if apptDuration} ({apptDuration}){/if}<br>{/if}
      {#if apptLocation}Ort: {apptLocation}{/if}
      {#if !apptDate && !apptTime && !apptLocation}Termindetails nicht verfügbar{/if}
    </div>
    <Textarea
      bind:value={apptUserContext}
      placeholder='Optional: Add context for the AI, e.g. "reject because move-in is too soon"'
      rows={2}
      class="mb-2 text-[11px]"
    />
    <div class="flex gap-1.5">
      <Button
        size="sm"
        variant="outline"
        class="flex-1 border-success/40 bg-success/15 text-success hover:bg-success/25"
        disabled={apptBtnsDisabled}
        onclick={() => handleAppointmentResponse('accept', 'Accept')}
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="destructive"
        class="flex-1"
        disabled={apptBtnsDisabled}
        onclick={() => handleAppointmentResponse('reject', 'Reject')}
      >
        Reject
      </Button>
      <Button
        size="sm"
        variant="secondary"
        class="flex-1"
        disabled={apptBtnsDisabled}
        onclick={() => handleAppointmentResponse('alternative', 'Alternative')}
      >
        Alternative
      </Button>
    </div>
    {#if apptResultText}
      <div
        class={cn(
          'mt-1.5 rounded-md px-2 py-1.5 text-[11px]',
          apptResultIsError ? 'bg-destructive/10 text-destructive' : 'bg-success/15 text-success',
        )}
        role="status"
      >
        {apptResultText}
      </div>
    {/if}
  </div>
{:else if conversation.appointment && conversation.appointmentStatus && conversation.appointmentStatus !== 'pending'}
  <div class="mt-2">
    <Badge variant={APPOINTMENT_STATUS_TONES[conversation.appointmentStatus] || 'secondary'}>
      Appointment: {STATUS_LABELS[conversation.appointmentStatus] || conversation.appointmentStatus}
    </Badge>
  </div>
  {#if conversation.appointmentStatus === 'accepted'}
    <div class="mt-1.5 flex gap-1.5">
      <Button
        variant="outline"
        size="sm"
        class="flex-1 text-[10px]"
        onclick={() => window.open(buildGoogleCalendarUrl(conversation), '_blank', 'noopener,noreferrer')}
      >
        📅 Google Calendar
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="flex-1 text-[10px]"
        onclick={() => downloadICS(conversation)}
      >
        ⬇ Download .ics
      </Button>
    </div>
  {/if}
{/if}
