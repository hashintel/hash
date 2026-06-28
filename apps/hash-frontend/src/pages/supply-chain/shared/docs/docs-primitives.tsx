import { createContext, useContext, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import type { DocTarget } from "./docs-types";

/**
 * In-modal navigation. The modal provides a `navigate` callback so content can
 * render cross-reference links that jump to another section/entry (e.g. an
 * overview pointing at "Settings & controls").
 */
const DocsNavContext = createContext<(target: DocTarget) => void>(() => {});

export const DocsNavProvider = ({
  navigate,
  children,
}: {
  navigate: (target: DocTarget) => void;
  children: ReactNode;
}) => {
  return (
    <DocsNavContext.Provider value={navigate}>
      {children}
    </DocsNavContext.Provider>
  );
};

const entryBlock = css({
  scrollMarginTop: "4",
  "&:not(:first-child)": {
    mt: "8",
    pt: "8",
    borderTopWidth: "1px",
    borderColor: "bd.subtle",
  },
});
const entryTitle = css({
  fontFamily: "display",
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.heading",
  mb: "3",
});
// Anchors wrap block-level setting rows; space consecutive ones apart (the
// inner SettingRow's own `:not(:first-child)` margin can't fire when it's the
// sole child of each Anchor).
const anchor = css({
  scrollMarginTop: "4",
  "&:not(:first-child)": { mt: "3" },
});

/** A navigable docs entry: an anchored heading plus its body. */
export const DocEntryBlock = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) => {
  return (
    <section id={id} className={entryBlock}>
      <h3 className={entryTitle}>{title}</h3>
      {children}
    </section>
  );
};

/** An in-content anchor target (e.g. a dwell span) that the modal can scroll to. */
export const Anchor = ({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) => {
  return (
    <div id={id} className={anchor}>
      {children}
    </div>
  );
};

const lead = css({
  textStyle: "sm",
  color: "fg.subtle",
  lineHeight: "relaxed",
  mb: "3",
});
export const Lead = ({ children }: { children: ReactNode }) => {
  return <p className={lead}>{children}</p>;
};

const para = css({
  textStyle: "sm",
  color: "fg.subtle",
  lineHeight: "relaxed",
  "&:not(:first-child)": { mt: "2.5" },
});
const Paragraph = ({ children }: { children: ReactNode }) => {
  return <p className={para}>{children}</p>;
};
export { Paragraph as P };

const h4 = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.heading",
  mt: "5",
  mb: "2",
});
export const H4 = ({ children }: { children: ReactNode }) => {
  return <h4 className={h4}>{children}</h4>;
};

const ul = css({
  mt: "2.5",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  pl: "1",
});
export const UL = ({ children }: { children: ReactNode }) => {
  return <ul className={ul}>{children}</ul>;
};

const li = css({
  textStyle: "sm",
  color: "fg.subtle",
  lineHeight: "relaxed",
  pl: "4",
  position: "relative",
  _before: {
    content: '"\\2022"',
    position: "absolute",
    left: "0",
    color: "fg.muted",
    fontWeight: "semibold",
  },
});
export const LI = ({ children }: { children: ReactNode }) => {
  return <li className={li}>{children}</li>;
};

const term = css({ fontWeight: "medium", color: "fg.heading" });
export const Term = ({ children }: { children: ReactNode }) => {
  return <strong className={term}>{children}</strong>;
};

const note = css({
  mt: "3",
  borderLeftWidth: "2px",
  borderColor: "bd.subtle",
  pl: "3",
  py: "0.5",
  textStyle: "sm",
  color: "fg.subtle",
  lineHeight: "relaxed",
});
export const Note = ({ children }: { children: ReactNode }) => {
  return <div className={note}>{children}</div>;
};

/** A span definition row: "Start -> End" with an explanation. Used for dwell variants. */
const spanList = css({
  mt: "3",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
export const SpanList = ({ children }: { children: ReactNode }) => {
  return <div className={spanList}>{children}</div>;
};

const spanItem = css({
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  p: "3",
  scrollMarginTop: "4",
});
const spanHead = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flexWrap: "wrap",
  mb: "1.5",
});
const spanName = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
});
const spanArrow = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  bg: "bg.subtle",
  borderRadius: "sm",
  px: "1.5",
  py: "0.5",
});
const spanBody = css({
  textStyle: "sm",
  color: "fg.subtle",
  lineHeight: "relaxed",
});
export const SpanItem = ({
  id,
  name,
  from,
  to,
  children,
}: {
  id?: string;
  name: string;
  from: string;
  to: string;
  children: ReactNode;
}) => {
  return (
    <div id={id} className={spanItem}>
      <div className={spanHead}>
        <span className={spanName}>{name}</span>
        <span className={spanArrow}>
          {from} <span aria-hidden>{"\u2192"}</span> {to}
        </span>
      </div>
      <p className={spanBody}>{children}</p>
    </div>
  );
};

/** A labelled control/setting definition row. */
const settingRow = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  "&:not(:first-child)": { mt: "3" },
});
const settingName = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
});
const settingBody = css({
  textStyle: "sm",
  color: "fg.subtle",
  lineHeight: "relaxed",
});
export const SettingRow = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => {
  return (
    <div className={settingRow}>
      <span className={settingName}>{name}</span>
      <span className={settingBody}>{children}</span>
    </div>
  );
};

const crossRef = css({
  color: "fg.heading",
  fontWeight: "medium",
  textDecoration: "underline",
  textUnderlineOffset: "[2px]",
  cursor: "pointer",
  bg: "[transparent]",
  border: "none",
  p: "0",
  font: "inherit",
  _hover: { color: "fg.muted" },
});
/** A link inside docs copy that jumps to another section/entry of the modal. */
export const CrossRef = ({
  to,
  children,
}: {
  to: DocTarget;
  children: ReactNode;
}) => {
  const navigate = useContext(DocsNavContext);
  return (
    <button type="button" className={crossRef} onClick={() => navigate(to)}>
      {children}
    </button>
  );
};
