<script lang="ts">
import type { ConversationEntry } from '../../shared/types';
import { respondToAppointment } from '../lib/messages';

let {
  conversation,
}: {
  conversation: ConversationEntry;
} = $props();

let apptBtnsDisabled = $state(false);
let apptResultText = $state('');
let apptResultStyle = $state('');
let apptUserContext = $state('');

let apptDate = $derived(conversation.appointment?.date || conversation.appointment?.startDate || '');
let apptTime = $derived(conversation.appointment?.time || conversation.appointment?.startTime || '');
let apptDuration = $derived(conversation.appointment?.duration || '');
let apptLocation = $derived(conversation.appointment?.location || conversation.appointment?.address || '');

async function handleAppointmentResponse(response: string, _btnLabel: string) {
  const appt = conversation.appointment;
  const apptDateVal = appt?.date || appt?.startDate || '';
  const apptTimeVal = appt?.time || appt?.startTime || '';
  const apptLocationVal = appt?.location || appt?.address || '';

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
</style>
