import { useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { liveScreenIds } from "./screen-builds";
import {
  type FigmaScreen,
  type FigmaTag,
  figmaLink,
  figmaScreens,
  screenImage,
} from "./screens";

/** `?clean` hides the jumper, for side-by-side comparisons with Figma. */
const hidden = new URLSearchParams(globalThis.location.search).has("clean");

export const screenHref = (id: string) => `?screen=${id}`;

/**
 * Each screen's Figma tag is Claude's note on it, not a status Aakarsh approved (2 Nov: every Tag frame reads
 * "Claude: … · not approved by Aakarsh"), so it shows as a plain, quiet note.
 */
const tagStyle = css({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  height: "[18px]",
  paddingX: "1.5",
  borderRadius: "sm",
  textStyle: "xs",
  whiteSpace: "nowrap",
  backgroundColor: "neutral.bg.surface",
  color: "neutral.fg.subtle",
});

export const TagPill = ({ tag }: { tag: FigmaTag }) => (
  <span
    className={tagStyle}
    title="Claude's note on the Figma frame, not approved by Aakarsh"
  >
    {tag === "None" ? "No note" : `Claude's note: ${tag}`}
  </span>
);

const sectionKey = (screen: FigmaScreen) => screen.section;

/**
 * A dev-only way to every Figma screen: a small pill in the bottom-left corner, or ⌘K / Ctrl+K. Each row shows the
 * screen's id, name, Figma tag, and whether it is built (live) or still the Figma export.
 */
export const ScreenJumper = ({ current }: { current?: FigmaScreen }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (hidden) {
    return null;
  }

  const query = search.trim().toLowerCase();
  const visible = figmaScreens.filter(
    (screen) =>
      !query ||
      `${screen.id} ${screen.aliases?.join(" ") ?? ""} ${screen.name} ${screen.tag}`
        .toLowerCase()
        .includes(query),
  );
  const sections = [...new Set(visible.map(sectionKey))];
  const liveCount = figmaScreens.filter((screen) =>
    liveScreenIds.has(screen.id),
  ).length;

  return (
    <div
      className={`${css({
        position: "fixed",
        left: "[8px]",
        bottom: "[8px]",
        zIndex: "[10000]",
        fontFamily: "body",
      })} petrinaut-root`}
    >
      {open ? (
        <div
          className={css({
            position: "absolute",
            left: "[0]",
            bottom: "[32px]",
            width: "[460px]",
            maxHeight: "[min(640px, calc(100vh - 56px))]",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "neutral.bgSolid.min",
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "neutral.bd.subtle",
            borderRadius: "lg",
            boxShadow: "[0 8px 30px rgba(0, 0, 0, 0.16)]",
            overflow: "hidden",
          })}
        >
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
              padding: "2",
              borderBottomWidth: "thin",
              borderBottomStyle: "solid",
              borderBottomColor: "neutral.bd.subtle",
            })}
          >
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Jump to a screen: J2.54, chip, Ready…"
              className={css({
                height: "[30px]",
                paddingX: "2",
                textStyle: "sm",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "neutral.bd.solid",
                borderRadius: "md",
                outline: "none",
                _focus: { borderColor: "blue.bd.strong" },
              })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && visible[0]) {
                  globalThis.location.search = screenHref(visible[0].id);
                }
              }}
            />
            <span
              className={css({ textStyle: "xs", color: "neutral.fg.subtle" })}
            >
              {figmaScreens.length} Figma screens · {liveCount} live ·{" "}
              {figmaScreens.length - liveCount} Figma exports · ⌘K toggles ·{" "}
              <a href="?" className={css({ textDecoration: "underline" })}>
                start from J0.1
              </a>
            </span>
          </div>
          <div className={css({ overflowY: "auto", paddingY: "1" })}>
            {sections.map((section) => (
              <div key={section}>
                <div
                  className={css({
                    paddingX: "3",
                    paddingTop: "2",
                    paddingBottom: "1",
                    textStyle: "xs",
                    fontWeight: "semibold",
                    color: "neutral.fg.subtle",
                    textTransform: "uppercase",
                    letterSpacing: "[0.04em]",
                  })}
                >
                  {section}
                </div>
                {visible
                  .filter((screen) => sectionKey(screen) === section)
                  .map((screen) => {
                    const live = liveScreenIds.has(screen.id);
                    const isCurrent = current?.id === screen.id;
                    return (
                      <a
                        key={screen.id}
                        href={screenHref(screen.id)}
                        title={`Claude's note: ${screen.tag}${screen.why ? ` · ${screen.why}` : ""} (not approved by Aakarsh)`}
                        className={css({
                          display: "flex",
                          alignItems: "center",
                          gap: "2",
                          paddingX: "3",
                          paddingY: "1",
                          textStyle: "sm",
                          color: "neutral.fg.body",
                          textDecoration: "none",
                          _hover: {
                            backgroundColor: "neutral.bg.surface.hover",
                          },
                          "&[data-current]": {
                            backgroundColor: "neutral.bg.subtle",
                          },
                        })}
                        data-current={isCurrent || undefined}
                      >
                        <span
                          className={css({
                            width: "[52px]",
                            flexShrink: 0,
                            fontWeight: "medium",
                            fontVariantNumeric: "tabular-nums",
                            color: "neutral.fg.heading",
                          })}
                        >
                          {screen.id}
                        </span>
                        <span
                          className={css({
                            flex: "1",
                            minWidth: "[0]",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          })}
                        >
                          {screen.name}
                        </span>
                        <TagPill tag={screen.tag} />
                        <span
                          className={css({
                            width: "[44px]",
                            flexShrink: 0,
                            textAlign: "right",
                            textStyle: "xs",
                            color: live ? "green.fg.body" : "neutral.fg.subtle",
                          })}
                        >
                          {live ? "live" : "Figma"}
                        </span>
                      </a>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={css({
          display: "inline-flex",
          alignItems: "center",
          gap: "1.5",
          height: "[24px]",
          paddingX: "2",
          textStyle: "xs",
          color: "neutral.fg.muted",
          backgroundColor: "neutral.bgSolid.min",
          borderWidth: "thin",
          borderStyle: "solid",
          borderColor: "neutral.bd.subtle",
          borderRadius: "md",
          cursor: "pointer",
          opacity: "[0.85]",
          _hover: { opacity: "[1]", color: "neutral.fg.heading" },
        })}
      >
        {current ? <strong>{current.id}</strong> : null}
        Screens ⌘K
      </button>
    </div>
  );
};

/** A screen with no live build yet: its Figma export, labelled so it can't be mistaken for the prototype. */
export const ScreenPlaceholder = ({ screen }: { screen: FigmaScreen }) => (
  <div
    className={`${css({
      minHeight: "[100vh]",
      backgroundColor: "neutral.bgSolid.subtle",
      fontFamily: "body",
      display: "flex",
      flexDirection: "column",
    })} petrinaut-root`}
  >
    <div
      className={css({
        position: "sticky",
        top: "[0]",
        zIndex: "[1]",
        display: "flex",
        alignItems: "center",
        gap: "3",
        height: "[40px]",
        paddingX: "4",
        backgroundColor: "orange.bgSolid.surface.active",
        borderBottomWidth: "thin",
        borderBottomStyle: "solid",
        borderBottomColor: "orange.bd.subtle",
        textStyle: "sm",
        color: "neutral.fg.heading",
      })}
    >
      <strong>Not built yet · from Figma</strong>
      <span className={css({ color: "neutral.fg.body" })}>
        {screen.id} · {screen.name}
      </span>
      <TagPill tag={screen.tag} />
      {screen.why ? (
        <span className={css({ color: "neutral.fg.muted", textStyle: "xs" })}>
          {screen.why}
        </span>
      ) : null}
      <a
        href={figmaLink(screen)}
        target="_blank"
        rel="noreferrer"
        className={css({
          marginLeft: "auto",
          color: "neutral.fg.link",
          textDecoration: "underline",
        })}
      >
        Open in Figma
      </a>
    </div>
    <img
      src={screenImage(screen)}
      alt={`Figma: ${screen.id} · ${screen.name}`}
      className={css({
        display: "block",
        width: "[100%]",
        maxWidth: "[1440px]",
        height: "auto",
        marginX: "auto",
        backgroundColor: "neutral.bgSolid.min",
        boxShadow: "[0 0 0 1px var(--colors-neutral-bd-subtle)]",
      })}
    />
  </div>
);
