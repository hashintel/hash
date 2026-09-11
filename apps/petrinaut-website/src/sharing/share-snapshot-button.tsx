import { useEffect, useState } from "react";

import { Button, Checkbox, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { serializeSDCPN } from "@hashintel/petrinaut-core";

import {
  SnapshotError,
  snapshotErrorMessage,
  type Snapshot,
  type SnapshotErrorCode,
} from "./snapshot";
import { prepareSnapshot, snapshotUrl } from "./snapshot-client";

import type { SharedExampleSearch } from "../examples/example-search";

type CapturedSnapshot = { snapshot: Snapshot; search: SharedExampleSearch };
type PreparedLink =
  | { kind: "loading" }
  | { kind: "ready"; hash: string }
  | { kind: "error"; code: SnapshotErrorCode };

const downloadSnapshot = ({ definition, title }: Snapshot) => {
  const content = serializeSDCPN({ petriNetDefinition: definition, title });
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/yaml" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(title.trim() === "" ? "snapshot" : title).replace(/[^a-z0-9_-]/giu, "_")}.yaml`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const ShareSnapshotDialog = ({
  captured,
  onClose,
}: {
  captured: CapturedSnapshot;
  onClose: () => void;
}) => {
  const [includeView, setIncludeView] = useState(true);
  const [prepared, setPrepared] = useState<PreparedLink>({ kind: "loading" });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  useEffect(() => {
    const controller = new AbortController();
    void prepareSnapshot(captured.snapshot, controller.signal).then(
      (hash) => {
        if (!controller.signal.aborted) setPrepared({ kind: "ready", hash });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setPrepared({
            kind: "error",
            code: error instanceof SnapshotError ? error.code : "unavailable",
          });
        }
      },
    );
    return () => controller.abort();
  }, [captured.snapshot]);

  const url =
    prepared.kind === "ready"
      ? snapshotUrl(
          window.location.origin,
          prepared.hash,
          includeView ? captured.search : {},
        )
      : null;
  const copy = async () => {
    if (url === null) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <Dialog size="sm" onClose={onClose}>
      <Dialog.Header
        title="Share a snapshot"
        description="Anyone with the link can open this copy. Your later edits won't change it."
      />
      <Dialog.Body>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "4",
            fontSize: "sm",
          })}
        >
          <Checkbox
            label="Include current view"
            value={includeView}
            onChange={(value) => {
              setIncludeView(value);
              setCopyState("idle");
            }}
          />
          {url !== null && (
            <input
              aria-label="Snapshot link"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className={css({
                width: "full",
                minWidth: "0",
                borderWidth: "thin",
                borderColor: "neutral.s20",
                borderRadius: "md",
                padding: "3",
                fontSize: "sm",
                background: "neutral.s05",
              })}
            />
          )}
          <p
            role={
              prepared.kind === "error" || copyState === "failed"
                ? "alert"
                : "status"
            }
          >
            {prepared.kind === "loading"
              ? "Preparing your link…"
              : prepared.kind === "error"
                ? snapshotErrorMessage(prepared.code)
                : copyState === "copied"
                  ? "Link copied."
                  : copyState === "failed"
                    ? "Couldn't copy the link. Select it above and copy it manually."
                    : "The document is included in the link. No upload is needed."}
          </p>
        </div>
      </Dialog.Body>
      <Dialog.Footer
        secondaryActions={
          <Button
            variant="subtle"
            onClick={() => downloadSnapshot(captured.snapshot)}
          >
            Download file
          </Button>
        }
        actions={
          <Button disabled={url === null} onClick={() => void copy()}>
            {copyState === "copied" ? "Copied" : "Copy snapshot link"}
          </Button>
        }
      />
    </Dialog>
  );
};

export const ShareSnapshotButton = ({
  getSnapshot,
  search,
}: {
  getSnapshot: () => Snapshot;
  search: SharedExampleSearch;
}) => {
  const [captured, setCaptured] = useState<CapturedSnapshot | null>(null);
  return (
    <>
      <Button
        size="xs"
        variant="subtle"
        onClick={() => {
          setCaptured({
            snapshot: structuredClone(getSnapshot()),
            search: { ...search },
          });
        }}
      >
        Share
      </Button>
      {captured !== null && (
        <ShareSnapshotDialog
          captured={captured}
          onClose={() => setCaptured(null)}
        />
      )}
    </>
  );
};
