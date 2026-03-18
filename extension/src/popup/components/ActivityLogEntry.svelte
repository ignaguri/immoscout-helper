<script lang="ts">
let { entry }: { entry: any } = $props();
let showErrorDetail = $state(false);

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getLogStyle(type: string): string {
  switch (type) {
    case 'header':
      return 'border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; font-weight: 600; color: #333;';
    case 'analysis':
      return 'margin: 4px 0 2px 8px; padding: 4px 8px; background: #eef6ff; border-left: 3px solid #4a9eff; border-radius: 3px; color: #444; white-space: pre-wrap;';
    case 'result-success':
      return 'margin: 4px 0 2px 8px; color: #2d8a56; font-weight: 600;';
    case 'result-failed':
      return 'margin: 4px 0 2px 8px; color: #c0392b; font-weight: 600;';
    case 'wait':
      return 'margin: 2px 0 2px 8px; color: #888; font-style: italic;';
    default:
      return 'margin: 2px 0 2px 8px; color: #555;';
  }
}

function getResultInfo(result: string): { icon: string; type: string; label: string } {
  if (result === 'success') return { icon: '✓', type: 'result-success', label: 'Sent' };
  if (result === 'skipped') return { icon: '→', type: 'wait', label: 'Skipped' };
  return { icon: '✗', type: 'result-failed', label: 'Failed' };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const tsStyle = 'color:#aaa; font-weight:400; font-size:11px; margin-right:4px;';
</script>

{#snippet timestamp()}{#if entry.timestamp}<span style={tsStyle}>{formatTime(entry.timestamp)}</span>{/if}{/snippet}

{#if entry.current}
  {@const id = entry.current.id}
  {@const title = entry.current.title || id}
  {@const url = entry.current.url || `https://www.immobilienscout24.de/expose/${id}`}
  <div style={getLogStyle('header')}>
    {@render timestamp()}
    <span>▸ </span>
    <a href={url} target="_blank" rel="noopener noreferrer" style="color:#888; text-decoration:none;">({id})</a>
    {' '}{title}
  </div>
{/if}

{#if entry.message}
  {@const isAnalysis = entry.type === 'analysis' || entry.message.includes('AI Score:')}
  {@const isWait = entry.type === 'wait' || entry.message.includes('Rate limit') || entry.message.includes('waiting')}
  <div style={getLogStyle(isAnalysis ? 'analysis' : isWait ? 'wait' : 'info')}>
    {#if !entry.current}{@render timestamp()}{/if}
    {entry.message}
  </div>
{/if}

{#if entry.lastResult}
  {@const info = getResultInfo(entry.lastResult)}
  {@const lid = entry.lastId}
  {@const lurl = `https://www.immobilienscout24.de/expose/${lid}`}
  {@const hasError = entry.lastResult === 'failed' && (entry.error || entry.errorDetail)}
  <div style={getLogStyle(info.type)}>
    {#if !entry.current && !entry.message}{@render timestamp()}{/if}
    {info.icon} {info.label}:
    <a href={lurl} target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;">({lid})</a>
    {' '}{entry.lastTitle || ''}
    {#if hasError}
      <button class="error-info-btn" onclick={() => showErrorDetail = !showErrorDetail} title={showErrorDetail ? 'Hide details' : 'Show error details'}>
        {showErrorDetail ? '▾' : 'ⓘ'}
      </button>
    {/if}
  </div>
  {#if hasError && showErrorDetail}
    <div class="error-detail">
      {#if entry.error}<div class="error-reason">{entry.error}</div>{/if}
      {#if entry.errorDetail}<div class="error-raw">{entry.errorDetail}</div>{/if}
    </div>
  {/if}
{/if}

<style>
  .error-info-btn {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 4px;
    font-size: 12px;
    color: #c0392b;
    border-radius: 50%;
    vertical-align: middle;
  }

  .error-info-btn:hover {
    background: rgba(192, 57, 43, 0.1);
  }

  .error-detail {
    margin: 2px 0 4px 12px;
    padding: 6px 8px;
    background: #fef2f2;
    border-left: 3px solid #c0392b;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 400;
    color: #7f1d1d;
    word-break: break-word;
  }

  .error-reason {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .error-raw {
    color: #991b1b;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 10px;
    white-space: pre-wrap;
    margin-top: 4px;
  }
</style>
