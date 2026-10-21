import { ReactFlowProvider } from "@xyflow/react";

import { Button, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { FlowThumbnail } from "./canvas";
import { EditorContext, initialUi } from "./editor-context";
import { validateDocument } from "./shapes";

import type { EditorDocument } from "./document";

export type FlowListEntry = { id: string; document: EditorDocument };

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
  cursor: "pointer",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "lg",
  overflow: "hidden",
  transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
  _hover: {
    borderColor: "neutral.s60",
    boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.08)]",
  },
  _focusVisible: { outline: "[2px solid var(--colors-blue-s90)]" },
});

/** A read-only editor context, so the thumbnail can reuse the canvas's own node views. */
const ThumbnailContext = ({ document }: { document: EditorDocument }) => (
  <EditorContext
    value={{
      document,
      setDocument: () => undefined,
      ui: initialUi,
      setUi: () => undefined,
      validation: validateDocument(document),
    }}
  >
    <ReactFlowProvider>
      <FlowThumbnail />
    </ReactFlowProvider>
  </EditorContext>
);

/** The flows list: a static preview per flow. Its search stays as it was when you come back. */
export const Home = ({
  flows,
  search,
  onSearch,
  onOpen,
  onNew,
}: {
  flows: FlowListEntry[];
  search: string;
  onSearch: (search: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) => {
  const visible = flows.filter((flow) =>
    flow.document.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div
      className={`${css({
        minHeight: "[100vh]",
        backgroundColor: "neutral.s10",
        fontFamily: "body",
        color: "neutral.s120",
        padding: "8",
      })} petrinaut-root`}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "3",
          marginBottom: "6",
        })}
      >
        <h1
          className={css({
            fontSize: "xl",
            fontWeight: "semibold",
            margin: "[0]",
            flex: "1",
          })}
        >
          Flows
        </h1>
        <div className={css({ width: "[240px]" })}>
          <TextInput
            size="sm"
            value={search}
            placeholder="Search flows"
            aria-label="Search flows"
            onChange={onSearch}
          />
        </div>
        <Button size="sm" variant="solid" iconName="plus" onClick={onNew}>
          New flow
        </Button>
      </div>
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "[repeat(auto-fill, minmax(280px, 1fr))]",
          gap: "4",
        })}
      >
        {visible.map((flow) => (
          // A div, not a button: the preview inside holds the canvas's own (inert) buttons.
          <div
            key={flow.id}
            role="button"
            tabIndex={0}
            className={cardStyle}
            onClick={() => onOpen(flow.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(flow.id);
              }
            }}
            aria-label={`Open ${flow.document.name}`}
            data-flow-card={flow.id}
          >
            <div
              inert
              className={css({
                height: "[160px]",
                backgroundColor: "neutral.s10",
              })}
            >
              <ThumbnailContext document={flow.document} />
            </div>
            <div
              className={css({
                padding: "3",
                fontSize: "sm",
                fontWeight: "medium",
                borderTopWidth: "thin",
                borderTopStyle: "solid",
                borderTopColor: "neutral.s30",
              })}
            >
              {flow.document.name}
            </div>
          </div>
        ))}
        {visible.length === 0 ? (
          <span className={css({ fontSize: "sm", color: "neutral.s90" })}>
            No flow matches “{search}”.
          </span>
        ) : null}
      </div>
    </div>
  );
};
