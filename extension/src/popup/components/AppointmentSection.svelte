<script lang="ts">
import type { ConversationEntry } from '../../shared/types';
import { respondToAppointment } from '../lib/messages';
import { buildGoogleCalendarUrl, downloadICS } from '../lib/calendar';

let {
  conversation,
}: {
  conversation: ConversationEntry;
} = $props();

let apptBtnsDisabled = $state(false);
let apptResultText = $state('');
let apptResultStyle = $state('');
let apptUserContext = $state('');

let apptDate = $derived.by(() => {
  const appt = conversation.appointment;
  if (!appt) return '';
  if (appt.start) {
    const d = new Date(appt.start);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return appt.date || appt.startDate || '';
});
let apptTime = $derived.by(() => {
  const appt = conversation.appointment;
  if (!appt) return '';
  if (appt.start) {
    const d = new Date(appt.start);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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

async function handleAppointmentResponse(response: string, _btnLabel: string) {
  const appt = conversation.appointment;
  let apptDateVal = appt?.date || appt?.startDate || '';
  let apptTimeVal = appt?.time || appt?.startTime || '';
  if (appt?.start) {
    const d = new Date(appt.start);
    if (!isNaN(d.getTime())) {
      apptDateVal = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      apptTimeVal = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
  }
  const apptLocationVal = appt?.address || appt?.location || '';

  apptBtnsDisabled = true;
  apptResultText = 'Processing...';
  apptResultStyle = '';
  try {
    const result = await respondToAppointment(conversation.conversationId, response, apptUserContext.trim(), {
      date: apptDateVal,
      time: apptTimeVal,
      location: apptLocationVal,
    });
    if (result.success) {
      apptResultText = 'Tab opened - review & send';
      apptResultStyle = 'background: #e6fff5; color: #1a1a1a;';
    } else {
      apptResultText = `Failed: ${result.error || 'unknown'}`;
      apptResultStyle = 'background: #fff5f5; color: #c00;';
    }
  } catch (e: any) {
    apptResultText = `Error: ${e.message}`;
    apptResultStyle = 'background: #fff5f5; color: #c00;';
  }
  setTimeout(() => {
    apptBtnsDisabled = false;
    apptResultText = '';
    apptResultStyle = '';
  }, 5000);
}
</script>

{#if conversation.appointment && conversation.appointmentStatus === 'pending'}
  <div class="appt-section">
    <div class="appt-header">Besichtigungstermin</div>
    <div class="appt-details">
      {#if apptDate}Datum: {apptDate}<br>{/if}
      {#if apptTime}Zeit: {apptTime}{#if apptDuration} ({apptDuration}){/if}<br>{/if}
      {#if apptLocation}Ort: {apptLocation}{/if}
      {#if !apptDate && !apptTime && !apptLocation}Termindetails nicht verfügbar{/if}
    </div>
    <textarea
      class="appt-context"
      placeholder='Optional: Add context for the AI, e.g. "reject because move-in is too soon"'
      bind:value={apptUserContext}
    ></textarea>
    <div class="appt-buttons">
      <button
        class="appt-btn accept"
        disabled={apptBtnsDisabled}
        onclick={() => handleAppointmentResponse('accept', 'Accept')}
      >Accept</button>
      <button
        class="appt-btn reject"
        disabled={apptBtnsDisabled}
        onclick={() => handleAppointmentResponse('reject', 'Reject')}
      >Reject</button>
      <button
        class="appt-btn alternative"
        disabled={apptBtnsDisabled}
        onclick={() => handleAppointmentResponse('alternative', 'Alternative')}
      >Alternative</button>
    </div>
    {#if apptResultText}
      <div class="appt-result" style={apptResultStyle}>{apptResultText}</div>
    {/if}
  </div>
{:else if conversation.appointment && conversation.appointmentStatus && conversation.appointmentStatus !== 'pending'}
  {@const statusLabels: Record<string, string> = { accepted: 'Accepted', rejected: 'Rejected', alternative_requested: 'Alternative requested' }}
  {@const statusColors: Record<string, string> = { accepted: '#d4edda', rejected: '#f8d7da', alternative_requested: '#fff3cd' }}
  <div class="appt-status" style="background: {statusColors[conversation.appointmentStatus] || '#f0f0f0'};">
    Appointment: {statusLabels[conversation.appointmentStatus] || conversation.appointmentStatus}
  </div>
  {#if conversation.appointmentStatus === 'accepted'}
    <div class="cal-buttons">
      <button class="cal-btn" onclick={() => window.open(buildGoogleCalendarUrl(conversation), '_blank', 'noopener,noreferrer')}>
        📅 Google Calendar
      </button>
      <button class="cal-btn" onclick={() => downloadICS(conversation)}>
        ⬇ Download .ics
      </button>
    </div>
  {/if}
{/if}

<style>
  .appt-section {
    margin-top: 8px;
    padding: 10px;
    background: #f8f9ff;
    border: 1px solid #d0d5ff;
    border-radius: 8px;
  }

  .appt-header {
    font-size: 11px;
    font-weight: 600;
    color: #333;
    margin-bottom: 6px;
  }

  .appt-details {
    font-size: 11px;
    color: #555;
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .appt-context {
    width: 100%;
    min-height: 40px;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 8px;
  }

  .appt-buttons {
    display: flex;
    gap: 6px;
  }

  .appt-btn {
    flex: 1;
    padding: 8px 6px;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .appt-btn.accept { background: #d4edda; color: #1a5c2a; }
  .appt-btn.reject { background: #f8d7da; color: #721c24; }
  .appt-btn.alternative { background: #f0f0f0; color: #333; }
  .appt-btn:disabled { opacity: 0.6; }

  .appt-result {
    margin-top: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 11px;
  }

  .appt-status {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11px;
    color: #555;
  }

  .cal-buttons {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .cal-btn {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 10px;
    background: #fff;
    cursor: pointer;
    color: #333;
  }

  .cal-btn:hover {
    background: #f5f5f5;
  }
</style>
