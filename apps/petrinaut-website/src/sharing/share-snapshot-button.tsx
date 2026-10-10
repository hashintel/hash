import { useEffect, useRef, useState } from "react";

import { Button, Checkbox, Icon, Popover } from "@hashintel/ds-components";
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

const panelStyle = css({
  width: "[340px]",
});

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
  paddingBottom: "1",
  fontSize: "sm",
});

const hintStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "[16px]",
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
  height: "[28px]",
  borderWidth: "thin",
  borderColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "2",
  fontSize: "xs",
  color: "neutral.s100",
  textOverflow: "ellipsis",
  background: "neutral.s00",
  transition: "[border-color 150ms ease]",
  _focusVisible: { borderColor: "blue.s60", outline: "none" },
});

const alertStyle = css({
  color: "red.s100",
  fontSize: "xs",
});

/** The share glyph: a tray with an arrow leaving it. */
const ShareIcon = () => (
  <svg
    aria-hidden
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.5"
    viewBox="0 0 16 16"
    width="16"
  >
    <path d="M8 10.25V2.5M5.25 5.25 8 2.5l2.75 2.75" />
    <path d="M3.5 8.5v3.75c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V8.5" />
  </svg>
);

const SharePanel = ({ captured }: { captured: CapturedSnapshot }) => {
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
    <Popover.Container className={panelStyle}>
      <Popover.Header title="Share snapshot" hideCloseButton />
      <Popover.Body>
        <div className={bodyStyle}>
          <p className={hintStyle}>
            Anyone with the link gets a read-only copy of this net as it is now.
          </p>
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
              aria-label={
                copyState === "copying"
                  ? "Copying…"
                  : copyState === "copied"
                    ? "Copied"
                    : "Copy link"
              }
              disabled={url === null || copyState === "copying"}
              prefix={
                <Icon
                  name={copyState === "copied" ? "check" : "copy"}
                  size="xs"
                />
              }
              size="xs"
              onClick={() => void copy()}
            >
              {copyState === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className={rowStyle}>
            <Checkbox
              label="Include current view"
              size="sm"
              value={includeView}
              disabled={copyState === "copying"}
              onChange={(value) => {
                setIncludeView(value);
                setCopyState("idle");
              }}
            />
            <Button
              aria-label="Download file"
              prefix={<Icon name="download" size="xs" />}
              size="xs"
              variant="ghost"
              onClick={() => downloadSnapshot(captured.snapshot)}
            >
              Download
            </Button>
          </div>
          {problem === null ? null : (
            <p className={alertStyle} role="alert">
              {problem}
            </p>
          )}
        </div>
      </Popover.Body>
    </Popover.Container>
  );
};

/**
 * A ghost icon button that opens the share dropdown. The snapshot is captured
 * when the dropdown opens, so later edits do not change the link it shows.
 */
export const ShareSnapshotButton = ({
  getSnapshot,
  search,
}: {
  getSnapshot: () => Snapshot;
  search: SharedExampleSearch;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [captured, setCaptured] = useState<CapturedSnapshot | null>(null);
  return (
    <>
      <Button
        ref={triggerRef}
        aria-expanded={captured !== null}
        aria-label="Share"
        prefix={<ShareIcon />}
        size="sm"
        tooltip="Share"
        variant="ghost"
        onClick={() =>
          setCaptured(
            captured === null
              ? {
                  snapshot: structuredClone(getSnapshot()),
                  search: { ...search },
                }
              : null,
          )
        }
      />
      {captured !== null && (
        <Popover
          position="bottom-end"
          triggerRef={triggerRef}
          onClose={() => setCaptured(null)}
        >
          <SharePanel captured={captured} />
        </Popover>
      )}
    </>
  );
};
