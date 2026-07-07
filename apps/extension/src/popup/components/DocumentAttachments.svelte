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
