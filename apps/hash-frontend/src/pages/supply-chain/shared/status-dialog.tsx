import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  Button,
  Select,
  usePortalContainerRef,
  type SelectItem,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useUsers } from "../../../components/hooks/use-users";
import { useAuthInfo } from "../../shared/auth-info-context";
import { useScope } from "./scope-context";
import {
  STATUS_OPTIONS,
  statusCommentRequired,
  statusTokensToPlainText,
  type StatusEntry,
  type StatusOption,
} from "./status";
import { StatusBody } from "./status-body";
import {
  StatusEditor,
  type StatusEditorHandle,
} from "./status-dialog/status-editor";
import { trackSupplyChainInteraction } from "./telemetry";

import type { TextToken } from "@local/hash-isomorphic-utils/types";
// `popover` sits above the slide-over (`modal`), so the dialog appears over an
// open step detail panel rather than behind it.
const backdrop = css({
  position: "fixed",
  inset: "0",
  zIndex: "popover",
  bg: "neutral.a80",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  p: "4",
});
const panel = css({
  display: "flex",
  flexDirection: "column",
  w: "full",
  maxW: "lg",
  maxH: "[calc(100dvh-2rem)]",
  overflowY: "auto",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  bg: "bgSolid.min",
  boxShadow: "2xl",
});
const headerRow = css({
  px: "5",
  py: "4",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
});
const titleStyle = css({
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
});
const body = css({
  display: "flex",
  flexDirection: "column",
});
const historySection = css({
  px: "5",
  py: "4",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
});
const statusFields = css({
  px: "5",
  py: "4",
  display: "flex",
  flexDirection: "column",
  gap: "4",
});
const history = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  minH: "0",
  maxH: "[min(240px,35dvh)]",
  flexShrink: "1",
  overflowY: "auto",
});
const historyEntry = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  px: "3",
  py: "2",
});
const historyMeta = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  textStyle: "xs",
  color: "fg.subtle",
});
const historyCategory = css({
  fontWeight: "medium",
  color: "fg.heading",
});
const historyComment = css({
  mt: "1",
  textStyle: "sm",
  color: "fg.muted",
  whiteSpace: "pre-wrap",
});
const fieldLabel = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textStyle: "xs",
  color: "fg.subtle",
});
const errorText = css({ textStyle: "xs", color: "status.error.fg.body" });
const footer = css({
  px: "5",
  py: "4",
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  justifyContent: "flex-end",
  gap: "2",
});

// Save is first in DOM (so it's the first tab stop after the textarea) but
// rendered on the right via flex order; Cancel keeps the left slot.
const saveOrder = css({ order: "1" });
const cancelOrder = css({ order: "0" });

const DEFAULT_STATUS: StatusOption = "Investigation started";
const latestStatusCategory = (
  entries: readonly StatusEntry[],
): StatusOption => {
  const latestCategory = entries.reduce<StatusEntry | undefined>(
    (latestEntry, entry) =>
      !latestEntry || entry.at > latestEntry.at ? entry : latestEntry,
    undefined,
  )?.category;

  return latestCategory === "Investigation started"
    ? "Investigation update"
    : (latestCategory ?? DEFAULT_STATUS);
};
const statusItems: SelectItem<StatusOption>[] = STATUS_OPTIONS.map(
  (option) => ({
    value: option,
    text: option,
  }),
);

export interface StatusDialogProps {
  /** Subtitle shown under the heading (e.g. the step / opportunity title). */
  title: string;
  entries?: readonly StatusEntry[];
  onClose: () => void;
  onSave: (status: {
    category: StatusOption;
    text: string;
    tokens: TextToken[];
  }) => void;
  /**
   * Render in-place instead of portaling to the layout root. Use when the dialog
   * is opened from inside another modal, such as the step detail slide-over.
   */
  inline?: boolean;
}

/**
 * Centered modal for leaving a status update against a step/opportunity.
 * The form resets on each target change so status edits never inherit a prior
 * category or comment.
 */
export const StatusDialog = ({
  title,
  entries = [],
  onClose,
  onSave,
  inline = false,
}: StatusDialogProps) => {
  const [category, setCategory] = useState<StatusOption>(() =>
    latestStatusCategory(entries),
  );
  const [tokens, setTokens] = useState<TextToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const statusSelectId = useId();
  const editorRef = useRef<StatusEditorHandle>(null);
  const portalRef = usePortalContainerRef();
  const scope = useScope();
  const { users } = useUsers();
  const statusUsersByEntityId = useMemo(
    () =>
      new Map(
        (users ?? []).map((user) => [
          user.entity.metadata.recordId.entityId,
          user,
        ]),
      ),
    [users],
  );
  const { authenticatedUser } = useAuthInfo();
  const members = useMemo(() => {
    if (!authenticatedUser) {
      return [];
    }

    const activeOrg = authenticatedUser.memberOf.find(
      ({ org }) => org.webId === scope,
    )?.org;
    const scopeUsers =
      activeOrg?.memberships.map(({ user }) => user) ??
      (authenticatedUser.accountId === scope ? [authenticatedUser] : []);

    return scopeUsers.flatMap((user) =>
      user.accountId !== authenticatedUser.accountId &&
      user.displayName &&
      user.shortname
        ? [
            {
              displayName: user.displayName,
              entityId: user.entity.metadata.recordId.entityId,
              shortname: user.shortname,
            },
          ]
        : [],
    );
  }, [authenticatedUser, scope]);
  const memberShortnamesByEntityId = useMemo(
    () => new Map(members.map((member) => [member.entityId, member.shortname])),
    [members],
  );

  useEffect(() => {
    setTokens([]);
    setError(null);
    const id = requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const selectCategory = (next: StatusOption) => {
    setCategory(next);
    if (!statusCommentRequired(next)) {
      setError(null);
    }
    editorRef.current?.focus();
  };
  const handleCancel = () => {
    trackSupplyChainInteraction({
      interaction: "status_dialog_cancelled",
      source: "status_dialog",
    });
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = statusTokensToPlainText(
      tokens,
      (entityId) => `@${memberShortnamesByEntityId.get(entityId) ?? "user"}`,
    );
    const trimmedText = text.trim();
    if (statusCommentRequired(category) && trimmedText.length === 0) {
      trackSupplyChainInteraction({
        interaction: "status_dialog_validation_failed",
        source: "status_dialog",
      });
      setError("Add a comment for this status.");
      editorRef.current?.focus();
      return;
    }
    onSave({ category, text: trimmedText, tokens });
  };

  const dialog = (
    <div
      className={backdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleCancel();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          handleCancel();
        }
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a native <dialog> UA positioning fights the flex-centered backdrop, so we use a div */}
      <form
        className={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-dialog-title"
        onSubmit={handleSubmit}
      >
        <div className={headerRow}>
          <h2 id="status-dialog-title" className={titleStyle}>
            {title}
          </h2>
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconName="close"
            aria-label="Close"
            onClick={handleCancel}
          />
        </div>
        <div className={body}>
          {entries.length > 0 && (
            <section className={historySection}>
              <div
                className={history}
                role="region"
                aria-label="Previous status updates"
                // A bounded overflow region must be keyboard-focusable to scroll.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
              >
                {[...entries]
                  .sort((left, right) => left.at.localeCompare(right.at))
                  .map((entry) => (
                    <article key={entry.entityId} className={historyEntry}>
                      <div className={historyMeta}>
                        <span>
                          <span className={historyCategory}>
                            {entry.category}
                          </span>
                          {entry.user ? <> · {entry.user}</> : null}
                        </span>
                        <time dateTime={entry.at}>
                          {new Date(entry.at).toLocaleString()}
                        </time>
                      </div>
                      <p className={historyComment}>
                        {entry.tokens.length ? (
                          <StatusBody
                            mentionedUsersByEntityId={statusUsersByEntityId}
                            tokens={entry.tokens}
                          />
                        ) : (
                          entry.text.trim() || "(no comment)"
                        )}
                      </p>
                    </article>
                  ))}
              </div>
            </section>
          )}
          <div className={statusFields}>
            <div className={fieldLabel}>
              <label htmlFor={statusSelectId}>Status</label>
              <Select
                items={statusItems}
                value={category}
                onChange={selectCategory}
                required
                size="sm"
                htmlForId={statusSelectId}
              />
            </div>
            <StatusEditor
              ref={editorRef}
              value={tokens}
              members={members}
              onChange={(nextTokens) => {
                setTokens(nextTokens);
                if (
                  error &&
                  statusTokensToPlainText(nextTokens).trim().length > 0
                ) {
                  setError(null);
                }
              }}
              placeholder="Add context, next actions, or why this is not feasible..."
              aria-required={statusCommentRequired(category)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "status-dialog-error" : undefined}
            />
            {error && (
              <p id="status-dialog-error" className={errorText}>
                {error}
              </p>
            )}
          </div>
        </div>
        <div className={footer}>
          <Button type="submit" variant="solid" size="sm" className={saveOrder}>
            Post
          </Button>
          <Button
            type="button"
            className={cancelOrder}
            onClick={handleCancel}
            size="sm"
            variant="subtle"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );

  const container = portalRef?.current;
  return inline || !container ? dialog : createPortal(dialog, container);
};

/** Speech-bubble glyph used by Status action buttons. */
export const StatusIcon = () => {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2.5h8v5H6.2L3.5 9.5v-2H2v-5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
};
