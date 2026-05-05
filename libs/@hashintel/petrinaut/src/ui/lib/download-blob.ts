/**
 * Trigger a browser download of arbitrary content. Wraps the
 * blob → object-URL → anchor → click → revoke dance so format-specific
 * exporters (`exportSDCPN`, `exportTikZ`, …) only need to produce the
 * payload + filename + MIME type.
 *
 * Side-effecting; safe only in a browser context (uses `document` and
 * `URL.createObjectURL`). Lives in `/ui/lib` because it's purely DOM-bound.
 */
export function downloadBlob({
  content,
  mimeType,
  filename,
}: {
  /** File contents — string, ArrayBuffer, Blob, etc. */
  content: BlobPart;
  /** MIME type e.g. `"application/json"`, `"application/x-tex"`. */
  mimeType: string;
  /** Filename suggested to the user, including extension. */
  filename: string;
}): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Build a sanitized, timestamped filename from a human-readable title and an
 * extension. Mirrors the convention used across petrinaut's existing
 * exporters: `<sanitized-title>_<iso-timestamp>.<ext>`.
 *
 * Example: `timestampedFilename("My Process", "tex")` → `"my_process_2026-05-05T12-34-56.789Z.tex"`.
 */
export function timestampedFilename(title: string, extension: string): string {
  const sanitized = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  return `${sanitized}_${timestamp}.${extension}`;
}
