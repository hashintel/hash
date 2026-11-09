/**
 * Exports the deck as one HTML file, in development: the dev server builds
 * it, with the slide shape the viewer has chosen, and the browser saves
 * what comes back. A build takes some seconds, so the button says so, and
 * a failed build shows its error in the panel.
 */

import { useState } from "react";

import { DownloadIcon } from "@hashintel/ds-icons";

import { deckExportRoute } from "../../export/route";

import type { SlideShape } from "../slide-shape";

type ExportState =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "failed"; message: string };

const save = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // The download reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** The deck's single file as the dev server builds it, or the build's error. */
const fetchExport = async (
  deckId: string,
  shape: SlideShape,
): Promise<Blob> => {
  const query = new URLSearchParams({ deck: deckId, shape });
  const response = await fetch(`${deckExportRoute}?${query}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.blob();
};

export const ExportButton = ({
  deckId,
  shape,
}: {
  deckId: string;
  shape: SlideShape;
}) => {
  const [state, setState] = useState<ExportState>({ kind: "idle" });
  const exportDeck = (): void => {
    setState({ kind: "building" });
    fetchExport(deckId, shape).then(
      (blob) => {
        save(blob, `${deckId}.html`);
        setState({ kind: "idle" });
      },
      (error: unknown) =>
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  };
  return (
    <>
      <button
        type="button"
        disabled={state.kind === "building"}
        onClick={exportDeck}
      >
        <DownloadIcon size={14} />
        {state.kind === "building" ? "Exporting…" : "Export as one HTML file"}
      </button>
      {state.kind === "failed" ? <p role="alert">{state.message}</p> : null}
    </>
  );
};
