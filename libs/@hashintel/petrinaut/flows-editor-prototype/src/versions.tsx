/**
 * Versions and publish (V0–V7, Figma 1185:88322, Isaac's storyboard 12). The draft carries the next number and saves
 * as you edit, with no "Draft saved" text (Aakarsh, 4 Nov); whether it should say so is open, ?draftsaved=dora|dei. Publish makes the
 * draft live and moves this web's triggers to it. Picking a past version opens it read-only (V6).
 */
import { useEffect, useState } from "react";

import {
  Button,
  Checkbox,
  Dialog,
  Icon,
  Menu,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { publishFlow } from "./app-store";
import { setQuery, useLocation } from "./router";
import { Toast } from "./ui";

import type { FlowVersion } from "./seed-flows";

export const versionLabel = (version: FlowVersion) =>
  `v${version.current} · ${version.state === "draft" ? "Draft" : "Live"}`;

const menuRowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0",
  minWidth: "[0]",
});

const menuTitleStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  color: "neutral.fg.heading",
});

const menuMetaStyle = css({
  textStyle: "xs",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

const stateTagStyle = css({
  textStyle: "xs",
  color: "neutral.fg.muted",
  paddingX: "1",
  borderRadius: "sm",
  backgroundColor: "neutral.bg.surface.active",
});

/** V3: the draft (current), then published versions newest first, then All versions. */
export const VersionMenu = ({
  version,
  viewing,
  trigger,
}: {
  version: FlowVersion;
  /** The past version open read-only (V6), if any. */
  viewing: number | null;
  trigger: React.ReactElement;
}) => {
  const draft =
    version.state === "draft"
      ? [
          {
            id: `v${version.current}`,
            text: (
              <span className={menuRowStyle}>
                <span className={menuTitleStyle}>
                  v{version.current}
                  <span className={stateTagStyle}>Draft</span>
                </span>
                <span className={menuMetaStyle}>
                  Edited {version.editedAt ?? "just now"} · not published
                </span>
              </span>
            ),
            selected: viewing === null,
            selectedStyle: "tick" as const,
            onClick: () => setQuery("version", null),
          },
        ]
      : [];
  const published = version.published.slice(0, 4).map((entry, index) => {
    const live = index === 0;
    const current = version.state === "live" && live;
    return {
      id: `v${entry.n}`,
      text: (
        <span className={menuRowStyle}>
          <span className={menuTitleStyle}>
            {entry.name ? `v${entry.n} · ${entry.name}` : `v${entry.n}`}
            {live ? <span className={stateTagStyle}>Live</span> : null}
          </span>
          <span className={menuMetaStyle}>
            Published {entry.at} · {entry.by}
          </span>
        </span>
      ),
      selected: current ? viewing === null : viewing === entry.n,
      selectedStyle: "tick" as const,
      onClick: () => setQuery("version", current ? null : String(entry.n)),
    };
  });
  return (
    <Menu
      position="bottom-start"
      className={css({ width: "[300px]" })}
      items={[
        { id: "versions", label: "", items: [...draft, ...published] },
        {
          id: "all",
          label: "",
          items: [
            {
              id: "all-versions",
              text: "All versions",
              icon: "clockRotateLeft",
              // MOCK: the full version list is not built yet.
              onClick: () => undefined,
            },
          ],
        },
      ]}
      trigger={trigger}
    />
  );
};

const quietButtonStyle = css({
  "&[class]": { color: "neutral.fg.muted", fontWeight: "medium" },
});

/** The version menu's own button: "v6 · Draft ▾", quiet, beside the title. */
export const VersionButton = ({
  version,
  viewing,
}: {
  version: FlowVersion;
  viewing: number | null;
}) => (
  <VersionMenu
    version={version}
    viewing={viewing}
    trigger={
      <Button
        size="sm"
        variant="ghost"
        tone="neutral"
        iconName="chevronDown"
        iconPosition="right"
        className={quietButtonStyle}
        data-version-menu
      >
        {viewing === null ? versionLabel(version) : `v${viewing} · Read-only`}
      </Button>
    }
  />
);

/* ----------------------------------------------------------------------------------------------------------------
 * "Draft saved", open (5 Nov, inbox `picks/draft-saved`): ?draftsaved=dora|dei, from the URL only; no param shows
 * nothing, as before.
 * - Dora: no "Draft saved"; only a failed save shows, and stays until it saves. ?savefail makes every save fail.
 * - Dei: "Draft saved" flashes after each edit, then fades.
 * ------------------------------------------------------------------------------------------------------------- */

const saveNoteStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "sm",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
  transition: "[opacity 600ms ease-out]",
});

const saveErrorStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "sm",
  color: "[var(--flows-failed-text)]",
  whiteSpace: "nowrap",
});

/** How long Dei's "Draft saved" stays before it fades. */
const flashMs = 1400;

export const DraftSaveNote = ({ document }: { document: unknown }) => {
  const { query } = useLocation();
  const take = query.get("draftsaved")?.toLowerCase();
  const failing = query.has("savefail");
  const [seen, setSeen] = useState(document);
  const [editedAt, setEditedAt] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  if (document !== seen) {
    setSeen(document);
    setEditedAt(Date.now());
    setShown(true);
    setFailed(failing);
  }
  useEffect(() => {
    if (editedAt === null) {
      return;
    }
    const timer = setTimeout(() => setShown(false), flashMs);
    return () => clearTimeout(timer);
  }, [editedAt]);
  if (take === "dora") {
    return failed ? (
      <span className={saveErrorStyle} role="alert" data-draft-save="error">
        <Icon name="warning" size="sm" />
        Couldn&apos;t save your changes
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          onClick={() => setFailed(false)}
        >
          Retry
        </Button>
      </span>
    ) : null;
  }
  if (take === "dei") {
    return (
      <span
        className={saveNoteStyle}
        // In at once, out over 600 ms.
        style={{ opacity: shown ? 1 : 0, transition: shown ? "none" : undefined }}
        aria-live="polite"
        data-draft-save={shown ? "saved" : "idle"}
      >
        Draft saved
      </span>
    );
  }
  return null;
};

/* ----------------------------------------------------------------------------------------------------------------
 * Publish: the button, the V4 dialog and the V7 toast
 * ------------------------------------------------------------------------------------------------------------- */

const noteStyle = css({ textStyle: "sm", color: "neutral.fg.muted" });

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const hintStyle = css({
  textStyle: "xs",
  color: "neutral.fg.subtle",
  marginLeft: "6",
});

const PublishDialog = ({
  version,
  liveRun,
  onClose,
  onPublish,
}: {
  version: FlowVersion;
  /** A run in progress, which finishes on the version it started on. */
  liveRun: number | null;
  onClose: () => void;
  onPublish: (name: string) => void;
}) => {
  const next = version.current;
  const live = version.published[0]?.n;
  const [name, setName] = useState(`v${next}`);
  const [notes, setNotes] = useState("");
  const [moveTriggers, setMoveTriggers] = useState(true);
  return (
    <Dialog size="md" onClose={onClose} aria-label={`Publish v${next}`}>
      <Dialog.Header title={`Publish v${next}`} iconName="info" />
      <Dialog.Body>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "4",
          })}
        >
          <span className={noteStyle}>
            Your draft becomes v{next} and goes live. Runs that start after this
            use v{next}.
          </span>
          {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the DS input is inside */}
          <label className={fieldStyle}>
            Name (optional)
            <TextInput
              value={name}
              onChange={setName}
              size="sm"
              placeholder={`v${next}`}
            />
          </label>
          {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the DS input is inside */}
          <label className={fieldStyle}>
            Notes (optional)
            <TextInput
              value={notes}
              onChange={setNotes}
              size="sm"
              placeholder="What changed"
            />
          </label>
          {live === undefined ? null : (
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "1",
              })}
            >
              <Checkbox
                value={moveTriggers}
                onChange={setMoveTriggers}
                label={`Move 2 triggers in this web to v${next}`}
              />
              <span className={hintStyle}>
                Every month on the 1st · When a supplier is updated. Untick to
                keep them on v{live}.
              </span>
            </div>
          )}
          <span className={noteStyle}>
            {liveRun === null
              ? "Runs in progress finish on the version they started on."
              : `Run ${liveRun} is in progress and will finish on v${live ?? next}.`}
          </span>
        </div>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <>
            <Button size="sm" variant="subtle" tone="neutral" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="solid"
              tone="neutral"
              data-publish-confirm
              onClick={() => onPublish(name.trim())}
            >
              Publish v{next}
            </Button>
          </>
        }
      />
    </Dialog>
  );
};

/**
 * Publish, per state: V0 and V2 enabled; V1 and V7 off (nothing new to publish); V5 off with the reason; V6 (a past
 * version open) off.
 */
export const PublishButton = ({
  flowId,
  version,
  problems,
  viewing,
  liveRun,
}: {
  flowId: string | undefined;
  version: FlowVersion;
  /** Steps that keep the draft from running (V5). */
  problems: number;
  viewing: number | null;
  liveRun: number | null;
}) => {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const draft = version.state === "draft";
  const disabled = !draft || problems > 0 || viewing !== null;
  const tooltip =
    viewing !== null
      ? `Viewing v${viewing}. Go back to the draft to publish.`
      : !draft
        ? `v${version.current} is live. Edit the flow to start the next draft.`
        : problems > 0
          ? `Can't publish v${version.current} until the flow can run · ${problems} ${problems === 1 ? "step needs" : "steps need"} inputs`
          : version.published.length === 0
            ? `No trigger can use this flow until v${version.current} is published`
            : `Publish v${version.current} and move this web's triggers to it`;
  return (
    <>
      <Button
        size="sm"
        variant="solid"
        tone="neutral"
        disabled={disabled}
        tooltip={tooltip}
        data-publish
        onClick={() => setOpen(true)}
      >
        Publish
      </Button>
      {open ? (
        <PublishDialog
          version={version}
          liveRun={liveRun}
          onClose={() => setOpen(false)}
          onPublish={(name) => {
            if (flowId) {
              publishFlow(
                flowId,
                name === `v${version.current}` ? undefined : name,
              );
            }
            setOpen(false);
            setToast(`Published v${version.current}`);
          }}
        />
      ) : null}
      {toast ? (
        <Toast text={toast} action="Add notes" onDone={() => setToast(null)} />
      ) : null}
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * V6: a past version, read-only
 * ------------------------------------------------------------------------------------------------------------- */

const bannerStyle = css({
  position: "absolute",
  top: "4",
  left: "4",
  right: "4",
  zIndex: "[5]",
  display: "flex",
  alignItems: "center",
  gap: "3",
  paddingX: "4",
  paddingY: "2.5",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.bgSolid.min",
  textStyle: "sm",
});

export const VersionBanner = ({
  version,
  viewing,
  onRestore,
}: {
  version: FlowVersion;
  viewing: number;
  onRestore: () => void;
}) => {
  const entry = version.published.find((each) => each.n === viewing);
  const draft =
    version.state === "draft" ? version.current : version.current + 1;
  return (
    <div className={bannerStyle} role="status" data-version-banner>
      <Icon name="info" size="sm" />
      <span className={css({ flex: "1", minWidth: "[0]" })}>
        <span
          className={css({ fontWeight: "medium", color: "neutral.fg.heading" })}
        >
          Viewing v{viewing} · read-only
        </span>
        <span className={css({ color: "neutral.fg.subtle" })}>
          {" "}
          · Published {entry?.at ?? ""} by {entry?.by ?? ""}. Your edits stay in
          the v{draft} draft.
        </span>
      </span>
      <Button size="sm" variant="ghost" tone="neutral" onClick={onRestore}>
        Restore this version
      </Button>
      <Button
        size="sm"
        variant="subtle"
        tone="neutral"
        onClick={() => setQuery("version", null)}
      >
        Back to draft
      </Button>
    </div>
  );
};
