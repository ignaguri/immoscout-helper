<script lang="ts">
let { entry }: { entry: any } = $props();

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
</script>

{#if entry.current}
  {@const id = entry.current.id}
  {@const title = entry.current.title || id}
  {@const url = entry.current.url || `https://www.immobilienscout24.de/expose/${id}`}
  <div style={getLogStyle('header')}>
    <span>▸ </span>
    <a href={url} target="_blank" style="color:#888; text-decoration:none;">({id})</a>
    {' '}{title}
  </div>
{/if}

{#if entry.message}
  {@const isAnalysis = entry.type === 'analysis' || entry.message.includes('AI Score:')}
  {@const isWait = entry.type === 'wait' || entry.message.includes('Rate limit') || entry.message.includes('waiting')}
  <div style={getLogStyle(isAnalysis ? 'analysis' : isWait ? 'wait' : 'info')}>
    {entry.message}
  </div>
{/if}

{#if entry.lastResult}
  {@const info = getResultInfo(entry.lastResult)}
  {@const lid = entry.lastId}
  {@const lurl = `https://www.immobilienscout24.de/expose/${lid}`}
  <div style={getLogStyle(info.type)}>
    {info.icon} {info.label}:
    <a href={lurl} target="_blank" style="color:inherit; text-decoration:none;">({lid})</a>
    {' '}{entry.lastTitle || ''}
  </div>
{/if}
