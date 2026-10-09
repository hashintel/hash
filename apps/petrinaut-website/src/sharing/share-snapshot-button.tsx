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

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  fontSize: "sm",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});

const linkStyle = css({
  flex: "1",
  minWidth: "0",
  height: "[32px]",
  borderWidth: "thin",
  borderColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "2.5",
  fontSize: "sm",
  textOverflow: "ellipsis",
  background: "neutral.s05",
});

const alertStyle = css({
  color: "red.s100",
  fontSize: "xs",
});

const ShareSnapshotDialog = ({
  captured,
  onClose,
}: {
  captured: CapturedSnapshot;
  onClose: () => void;
}) => {
  const [includeView, setIncludeView] = useState(true);
  const [prepared, setPrepared] = useState<PreparedLink>({ kind: "loading" });
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");

  // Compression runs in a worker, so it is an external system to subscribe to.
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
    if (url === null || copyState === "copying") return;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const problem =
    prepared.kind === "error"
      ? snapshotErrorMessage(prepared.code)
      : copyState === "failed"
        ? "Couldn't copy the link. Select it and copy it manually."
        : null;

  return (
    <Dialog size="sm" variant="plain" onClose={onClose}>
      <Dialog.Header
        title="Share snapshot"
        description="Anyone with the link can open a read-only copy of this net as it is now."
      />
      <Dialog.Body>
        <div className={bodyStyle}>
          <div className={rowStyle}>
            <input
              aria-label="Snapshot link"
              className={linkStyle}
              placeholder={
                prepared.kind === "loading" ? "Preparing link…" : undefined
              }
              readOnly
              value={url ?? ""}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              disabled={url === null || copyState === "copying"}
              size="sm"
              onClick={() => void copy()}
            >
              {copyState === "copying"
                ? "Copying…"
                : copyState === "copied"
                  ? "Copied"
                  : "Copy link"}
            </Button>
          </div>
          <div className={rowStyle}>
            <Checkbox
              label="Include current view"
              value={includeView}
              disabled={copyState === "copying"}
              onChange={(value) => {
                setIncludeView(value);
                setCopyState("idle");
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadSnapshot(captured.snapshot)}
            >
              Download file
            </Button>
          </div>
          {problem === null ? null : (
            <p className={alertStyle} role="alert">
              {problem}
            </p>
          )}
        </div>
      </Dialog.Body>
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
        size="sm"
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
