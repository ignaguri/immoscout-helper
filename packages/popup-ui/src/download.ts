// Shared blob-download helper for the popup. Wraps chrome.downloads.download so
// all callers get one object-URL lifecycle. Pass saveAs to show the "Save As"
// dialog (default: silent download to the browser's default folder).

export async function downloadBlob(blob: Blob, filename: string, opts?: { saveAs?: boolean }): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: opts?.saveAs ?? false });
  } finally {
    // Revoke after a tick so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
