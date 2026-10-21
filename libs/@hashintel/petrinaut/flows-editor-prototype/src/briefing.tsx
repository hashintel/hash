import { useState } from "react";

import { Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { mockEntityTypes } from "./mock-graph";
import {
  clearSessions,
  findTask,
  readSessions,
  type TaskSession,
} from "./tasks";

/**
 * The world in plain words: who, what the data is, what a good month looks like. Domain nouns only, no UI words, so
 * the briefing doesn't hint at how to build anything (task-testing research, section 4).
 */
export const Briefing = ({ onClose }: { onClose: () => void }) => (
  <Dialog size="md" onClose={onClose} aria-label="About this prototype">
    <Dialog.Header title="Acme's monthly supplier review" />
    <Dialog.Body>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "3",
          textStyle: "sm",
          color: "neutral.fg.heading",
        })}
      >
        <p className={css({ margin: "[0]" })}>
          Acme buys raw materials from suppliers. Every shipment that arrives
          gets a purity check in the lab.
        </p>
        <p className={css({ margin: "[0]" })}>
          Each month the quality team checks how every supplier did, and emails
          the suppliers whose shipments failed.
        </p>
        <p className={css({ margin: "[0]" })}>
          Your job is to automate that work, so the right people hear about
          failures and passes make no noise.
        </p>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
            paddingTop: "1",
          })}
        >
          {mockEntityTypes
            .filter((type) => type.title !== "Person")
            .map((type) => (
              <div
                key={type.baseUrl}
                className={css({
                  display: "grid",
                  gridTemplateColumns: "[112px 1fr]",
                  columnGap: "3",
                  paddingY: "2",
                  borderTopWidth: "thin",
                  borderTopStyle: "solid",
                  borderTopColor: "neutral.bd.subtle",
                })}
              >
                <span className={css({ fontWeight: "semibold" })}>
                  {type.title}
                </span>
                <span
                  className={css({
                    display: "flex",
                    flexDirection: "column",
                    gap: "1",
                  })}
                >
                  <span>{type.description}</span>
                  <span
                    className={css({
                      textStyle: "xs",
                      color: "neutral.fg.subtle",
                    })}
                  >
                    e.g. {type.example}
                  </span>
                </span>
              </div>
            ))}
        </div>
      </div>
    </Dialog.Body>
    <Dialog.Footer
      actions={
        <div
          className={css({ display: "flex", alignItems: "center", gap: "3" })}
        >
          {/* The tester guide (ops/projects/flows-editor/prototype-guide.md), opened in a new tab. */}
          <a
            href="?guide"
            target="_blank"
            rel="noreferrer"
            className={css({
              textStyle: "sm",
              color: "neutral.fg.muted",
              textDecoration: "underline",
              _hover: { color: "neutral.fg.body" },
            })}
          >
            How to use this prototype
          </a>
          <Button variant="solid" onClick={onClose}>
            Got it
          </Button>
        </div>
      }
    />
  </Dialog>
);

const briefingKey = "flows-editor-prototype:briefing-seen";

/** Whether to open the briefing on load: on the plain page, until it's been closed once in this browser. */
export const shouldShowBriefing = () => {
  try {
    return globalThis.localStorage.getItem(briefingKey) === null;
  } catch {
    return true;
  }
};

export const markBriefingSeen = () => {
  try {
    globalThis.localStorage.setItem(briefingKey, "1");
  } catch {
    // Shown again next time; harmless.
  }
};

/** One scenario at a time: the goal, "I'm done", and a way back to the briefing. Nothing says whether it worked. */
export const TaskCard = ({
  session,
  onDone,
  onReopenBriefing,
  onClose,
}: {
  session: TaskSession;
  onDone: () => void;
  onReopenBriefing: () => void;
  onClose: () => void;
}) => {
  const task = findTask(session.taskId);
  if (!task) {
    return null;
  }
  return (
    <section
      aria-label={`Task ${task.id}`}
      className={css({
        position: "absolute",
        top: "[12px]",
        left: "[12px]",
        width: "[320px]",
        padding: "4",
        display: "flex",
        flexDirection: "column",
        gap: "3",
        backgroundColor: "neutral.bgSolid.min",
        borderWidth: "thin",
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
        borderRadius: "lg",
        boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.08)]",
        zIndex: "[5]",
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <span
          className={css({
            textStyle: "xs",
            fontWeight: "semibold",
            color: "neutral.fg.subtle",
            textTransform: "uppercase",
            letterSpacing: "[0.04em]",
          })}
        >
          Task {task.id}
        </span>
        <Button
          size="xs"
          variant="ghost"
          iconName="close"
          aria-label="Close task"
          tooltip="Close"
          onClick={onClose}
        />
      </div>
      <p
        className={css({
          margin: "[0]",
          textStyle: "sm",
          color: "neutral.fg.heading",
        })}
      >
        {task.scenario}
      </p>
      {session.doneAt ? (
        <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
          Thanks. That's recorded.
        </span>
      ) : (
        <div
          className={css({ display: "flex", alignItems: "center", gap: "2" })}
        >
          <Button size="sm" variant="solid" onClick={onDone}>
            I'm done
          </Button>
          <Button size="sm" variant="link" onClick={onReopenBriefing}>
            Reopen briefing
          </Button>
        </div>
      )}
    </section>
  );
};

const seconds = (from: string, to?: string) =>
  to ? `${Math.round((Date.parse(to) - Date.parse(from)) / 1000)} s` : "–";

/** `?results`: every logged session, for the person running the test. */
export const Results = () => {
  const [sessions, setSessions] = useState(readSessions);
  const [copied, setCopied] = useState(false);
  const cell = css({
    padding: "2",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
    textAlign: "left",
    textStyle: "sm",
  });
  return (
    <div
      className={`${css({ minHeight: "[100vh]", padding: "8", backgroundColor: "neutral.bgSolid.surface", fontFamily: "body", color: "neutral.fg.heading" })} petrinaut-root`}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          marginBottom: "4",
        })}
      >
        <h1
          className={css({
            textStyle: "xl",
            fontWeight: "semibold",
            flex: "1",
            margin: "[0]",
          })}
        >
          Task sessions
        </h1>
        <Button
          size="sm"
          variant="subtle"
          iconName="copy"
          onClick={() => {
            navigator.clipboard
              .writeText(JSON.stringify(sessions, null, 2))
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy as JSON"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          tone="error"
          onClick={() => {
            clearSessions();
            setSessions([]);
          }}
        >
          Clear
        </Button>
      </div>
      {sessions.length === 0 ? (
        <p className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
          No sessions in this browser yet.
        </p>
      ) : (
        <table
          className={css({
            width: "[100%]",
            borderCollapse: "collapse",
            backgroundColor: "neutral.bgSolid.min",
          })}
        >
          <thead>
            <tr>
              {[
                "Task",
                "Started",
                "Goal state reached after",
                "Said done after",
                "Grade",
              ].map((heading) => (
                <th key={heading} className={cell}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td className={cell}>{session.taskId}</td>
                <td className={cell}>
                  {new Date(session.startedAt).toLocaleString()}
                </td>
                <td className={cell}>
                  {seconds(session.startedAt, session.goalReachedAt)}
                </td>
                <td className={cell}>
                  {seconds(session.startedAt, session.doneAt)}
                </td>
                <td className={cell}>{session.grade ?? "not done"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
