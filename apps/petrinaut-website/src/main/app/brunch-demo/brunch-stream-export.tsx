import { createContext, use } from "react";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import type { BrunchReceivedEvent } from "./brunch-protocol";

/** What the Brunch provider received from one stream, for the raw export. */
export type BrunchStream = {
  endpoint: string;
  runId?: string;
  title: string | null;
  receivedEvents: readonly BrunchReceivedEvent[];
};

export const BrunchStreamContext = createContext<BrunchStream | null>(null);

/**
 * The raw stream export: every SSE frame as received. `scripts/brunch-sse-fixture.ts`
 * replays it with `--recording`.
 */
export type BrunchStreamRecording = {
  version: 1;
  exportedAt: string;
  title: string | null;
  source: { kind: "brunch"; endpoint: string; runId?: string };
  events: BrunchReceivedEvent[];
};

export const createBrunchStreamRecording = (
  { endpoint, runId, title, receivedEvents }: BrunchStream,
  exportedAt = new Date().toISOString(),
): BrunchStreamRecording => ({
  version: 1,
  exportedAt,
  title,
  source: { kind: "brunch", endpoint, ...(runId ? { runId } : {}) },
  events: receivedEvents.map(({ event, data }) => ({ event, data })),
});

const downloadBrunchStreamRecording = (stream: BrunchStream) => {
  const recording = createBrunchStreamRecording(stream);
  const name = (stream.title ?? "actual-mode-recording")
    .replace(/[^a-z0-9]/giu, "_")
    .toLowerCase();
  const timestamp = recording.exportedAt.replace(/:/gu, "-");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(recording, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}_${timestamp}.petrinaut-actual.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const BrunchStreamExportPlugin = definePetrinautPlugin({
  id: "website.brunch-stream-export",
  name: "Brunch stream export",
  description:
    "Export Stream in the Actual mode Events tab: downloads the Brunch stream's frames exactly as received.",
  author: "HASH",
  required: true,
  actualExports: { stream: { label: "Export Stream" } },
});

const useBrunchStreamExportPlugin: PluginHook<
  typeof BrunchStreamExportPlugin
> = () => {
  const stream = use(BrunchStreamContext);

  return {
    actualExports: {
      stream: {
        run: () => {
          if (stream) {
            downloadBrunchStreamRecording(stream);
          }
        },
        disabled: !stream || stream.receivedEvents.length === 0,
      },
    },
  };
};

export const brunchStreamExportPlugin = BrunchStreamExportPlugin(
  useBrunchStreamExportPlugin,
);
