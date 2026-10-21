import { ReactFlowProvider } from "@xyflow/react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import hashLockup from "./assets/hash-lockup.svg";
// The ds-icons infinity used on J1 · 1 (Figma 378:3535), exported as drawn.
import infinityBlue from "./assets/infinity-blue.svg";
import infinityGrey from "./assets/infinity-grey.svg";
import { FlowThumbnail } from "./canvas";
import { EditorContext, initialUi } from "./editor-context";
import { validateDocument } from "./shapes";

import type { EditorDocument } from "./document";

export type FlowListEntry = { id: string; document: EditorDocument };

/** The HASH app header on J1 · 1: 56 px, the lockup, and the search box (here it searches flows). */
const headerStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  height: "[56px]",
  paddingLeft: "5",
  backgroundColor: "neutral.bgSolid.min",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const searchBoxStyle = css({
  position: "absolute",
  left: "[180px]",
  top: "[10px]",
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[380px]",
  height: "[36px]",
  paddingX: "3",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "lg",
  color: "neutral.fg.muted.disabled",
  "&:focus-within": { borderColor: "blue.bd.strong" },
  "& input": {
    flex: "1",
    minWidth: "[0]",
    textStyle: "sm",
    color: "neutral.fg.heading",
    backgroundColor: "[transparent]",
    outline: "none",
    _placeholder: { color: "neutral.fg.muted.disabled" },
  },
});

/** The DS Button at the empty state's size: 32 px, 10 px in, regular 14 px text. */
const newFlowStyle = css({
  "&[class]": { height: "[32px]", paddingX: "2.5", fontWeight: "normal" },
});

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
  cursor: "pointer",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "xl",
  overflow: "hidden",
  transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
  _hover: {
    borderColor: "neutral.bd.solid.hover",
    boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.08)]",
  },
  _focusVisible: { outline: "[2px solid var(--colors-blue-bd-strong)]" },
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
        backgroundColor: "neutral.bgSolid.min",
        fontFamily: "body",
        color: "neutral.fg.heading",
      })} petrinaut-root`}
    >
      <header className={headerStyle}>
        <img src={hashLockup} alt="HASH" width={100} height={18} />
        <label className={searchBoxStyle}>
          <Icon name="search" size="xs" />
          <input
            value={search}
            placeholder="Search for anything"
            aria-label="Search flows"
            onChange={(event) => onSearch(event.target.value)}
          />
          <span className={css({ textStyle: "xs" })}>⌘ K</span>
        </label>
      </header>
      <main
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "8",
          paddingTop: "12",
          paddingX: "[120px]",
          paddingBottom: "12",
        })}
      >
        <div
          className={css({ display: "flex", alignItems: "center", gap: "3" })}
        >
          <img src={infinityGrey} alt="" width={28} height={28} />
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
              flex: "1",
            })}
          >
            <h1
              className={css({
                textStyle: "lg",
                fontWeight: "semibold",
                color: "neutral.fg.heading",
                margin: "[0]",
              })}
            >
              Flows
            </h1>
            <span
              className={css({
                textStyle: "sm",
                color: "neutral.fg.muted.disabled",
              })}
            >
              Processes that workers can monitor and manage
            </span>
          </div>
          {flows.length > 0 ? (
            <Button
              size="sm"
              variant="solid"
              tone="brand"
              iconName="plus"
              className={newFlowStyle}
              onClick={onNew}
            >
              New flow
            </Button>
          ) : null}
        </div>
        {visible.length === 0 ? (
          // J1 · 1: the empty state, in a bordered box.
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4",
              paddingY: "[96px]",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "neutral.bd.subtle.hover",
              borderRadius: "xl",
            })}
          >
            <span
              className={css({
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "[48px]",
                height: "[48px]",
                borderRadius: "xl",
                backgroundColor: "blue.bgSolid.surface.active",
                color: "blue.fg.muted",
              })}
            >
              <img src={infinityBlue} alt="" width={24} height={24} />
            </span>
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1",
              })}
            >
              <span
                className={css({
                  textStyle: "base",
                  fontWeight: "semibold",
                  color: "neutral.fg.heading",
                })}
              >
                {flows.length === 0 ? "No flows yet" : "No flow matches"}
              </span>
              <span
                className={css({
                  textStyle: "sm",
                  color: "neutral.fg.muted.disabled",
                })}
              >
                {flows.length === 0
                  ? "A flow runs the same steps each time: by hand, on a schedule, or when data changes."
                  : `Nothing is called “${search}”.`}
              </span>
            </div>
            <Button
              size="sm"
              variant="solid"
              tone="brand"
              iconName="plus"
              className={newFlowStyle}
              onClick={onNew}
            >
              New flow
            </Button>
          </div>
        ) : (
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
                    backgroundColor: "neutral.bgSolid.surface",
                  })}
                >
                  <ThumbnailContext document={flow.document} />
                </div>
                <div
                  className={css({
                    paddingX: "4",
                    paddingY: "3",
                    textStyle: "sm",
                    fontWeight: "medium",
                    color: "neutral.fg.heading",
                    borderTopWidth: "thin",
                    borderTopStyle: "solid",
                    borderTopColor: "neutral.bd.subtle",
                  })}
                >
                  {flow.document.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
