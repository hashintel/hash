/**
 * Opens a file picker for the kinds of file `accept` names, and resolves the
 * file chosen, or `null` when the picker is cancelled.
 */
export const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });

/** The text of a file, or `null` when it cannot be read. */
export const readFileText = (
  file: Pick<File, "text">,
): Promise<string | null> => file.text().catch(() => null);
