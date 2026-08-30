import fuzzysort from "fuzzysort";
import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { Petrinaut } from "../ui/petrinaut";
import {
  CommandRegistryProvider,
  useCommandRegistry,
  useCommands,
} from "./context";
import { formatShortcutKeys } from "./format-shortcut";
import { useCommand } from "./use-command";

import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Commands / Command palette (host example)",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

// -- An example host palette ----------------------------------------------
//
// Petrinaut ships no palette: the host renders one over `useCommands()` and
// owns its opener binding. This is the reference implementation the demo
// website mirrors.

const overlayStyle = css({
  position: "fixed",
  inset: "0",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "[12vh]",
  // Nearly invisible scrim; `modal` sits above every editor panel (the
  // panels layer around the `sticky` token).
  backgroundColor: "[rgba(15, 18, 24, 0.08)]",
  zIndex: "modal",
});

const paletteStyle = css({
  fontFamily: "['Inter Variable', system-ui, sans-serif]",
  width: "[540px]",
  maxWidth: "[90vw]",
  maxHeight: "[60vh]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.s00",
  borderRadius: "lg",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  boxShadow: "[0 16px 48px rgba(0, 0, 0, 0.25)]",
  overflow: "hidden",
});

const paletteInputStyle = css({
  font: "[inherit]",
  border: "none",
  outline: "none",
  padding: "[14px 16px]",
  fontSize: "[15px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const paletteListStyle = css({
  overflowY: "auto",
  padding: "[6px]",
  display: "flex",
  flexDirection: "column",
});

const paletteRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "[8px 10px]",
  borderRadius: "md",
  fontSize: "sm",
  textAlign: "left",
  backgroundColor: "[transparent]",
  border: "none",
  cursor: "pointer",
  "&[data-active='true']": {
    backgroundColor: "blue.s30",
  },
});

const paletteCategoryStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  minWidth: "[64px]",
});

const paletteLabelStyle = css({ flex: "1" });

const paletteShortcutStyle = css({
  display: "flex",
  gap: "[3px]",
});

const paletteKeyStyle = css({
  // Square keycaps: single-symbol keys are 20x20; longer labels keep the
  // height and grow.
  width: "[20px]",
  height: "[20px]",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "xs",
  fontFamily: "mono",
  color: "neutral.s100",
  backgroundColor: "neutral.s10",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  boxShadow: "[0 1px 0 {colors.neutral.bd.subtle}]",
  "&[data-wide='true']": {
    width: "[auto]",
    paddingInline: "[5px]",
  },
});

const paletteEmptyStyle = css({
  padding: "[16px]",
  fontSize: "sm",
  color: "neutral.s80",
});

const HostCommandPalette: React.FC = () => {
  const registry = useCommandRegistry();
  const commands = useCommands();
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // The opener chord is the host's own binding, not Petrinaut's.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((open) => !open);
        setQuery("");
        setActiveIndex(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!isOpen) {
    return null;
  }

  const trimmed = query.trim();
  const results = trimmed
    ? fuzzysort
        .go(trimmed, commands, {
          keys: ["label", "category"],
          threshold: -1000,
        })
        .map((result) => result.obj)
    : commands;
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const runCommand = (id: string) => {
    setOpen(false);
    registry?.execute(id);
  };

  return (
    <div
      className={overlayStyle}
      role="presentation"
      onPointerDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className={paletteStyle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          ref={(element) => element?.focus()}
          className={paletteInputStyle}
          placeholder="Type a command…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex(Math.min(active + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(Math.max(active - 1, 0));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              runCommand(results[active].id);
            }
          }}
        />
        <div className={paletteListStyle}>
          {results.length === 0 ? (
            <div className={paletteEmptyStyle}>No matching commands</div>
          ) : (
            results.map((command, index) => (
              <button
                key={command.id}
                type="button"
                data-active={index === active}
                className={paletteRowStyle}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => runCommand(command.id)}
              >
                <span className={paletteCategoryStyle}>
                  {command.category ?? ""}
                </span>
                <span className={paletteLabelStyle}>{command.label}</span>
                {command.shortcut ? (
                  <span className={paletteShortcutStyle} aria-hidden>
                    {formatShortcutKeys(command.shortcut).map((key) => (
                      <kbd
                        key={key}
                        data-wide={key.length > 1}
                        className={paletteKeyStyle}
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// -- Demo host components registering commands -----------------------------

const hintStyle = css({
  fontFamily: "['Inter Variable', system-ui, sans-serif]",
  padding: "[16px]",
  fontSize: "sm",
  color: "neutral.s100",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const HostCounter: React.FC = () => {
  const [count, setCount] = useState(0);

  useCommand({
    id: "host.counter.increment",
    label: "Increment the counter",
    category: "Host app",
    run: () => setCount((value) => value + 1),
  });
  // `when` keeps a command registered only while its condition holds: this
  // one disappears from the palette until the counter is above zero.
  useCommand(
    {
      id: "host.counter.reset",
      label: "Reset the counter",
      category: "Host app",
      run: () => setCount(0),
    },
    { when: count > 0 },
  );

  return (
    <div className={hintStyle}>
      <strong>Press ⌘K / Ctrl+K to open the host palette.</strong>
      <span>Counter: {count}</span>
      <span>
        “Reset the counter” only appears in the palette while the counter is
        above zero.
      </span>
    </div>
  );
};

export const HostPalette: Story = {
  name: "Host palette over host commands",
  render: () => (
    <CommandRegistryProvider>
      <HostCounter />
      <HostCommandPalette />
    </CommandRegistryProvider>
  ),
};

// -- The same palette over the full editor ---------------------------------

const EMPTY_NET: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const EditorWithPalette: React.FC = () => {
  const [handle] = useState(() =>
    createJsonDocHandle({ id: "palette-demo", initial: EMPTY_NET }),
  );

  return (
    <CommandRegistryProvider>
      <div style={{ height: "100vh", width: "100vw" }}>
        <Petrinaut handle={handle} title="Palette demo" />
      </div>
      <HostCommandPalette />
    </CommandRegistryProvider>
  );
};

export const WithTheEditor: Story = {
  name: "Host palette over the editor",
  render: () => <EditorWithPalette />,
};
