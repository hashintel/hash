import { useEffect, useState } from "react";
import { MdKeyboardCommandKey } from "react-icons/md";

import {
  useCommand,
  useCommandRegistry,
  useCommands,
} from "@hashintel/petrinaut/react";
import {
  definePetrinautPlugin,
  KeyboardShortcut,
} from "@hashintel/petrinaut/ui";

import type { CSSProperties } from "react";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "12vh",
  backgroundColor: "rgba(15, 18, 24, 0.08)",
  zIndex: "var(--z-index-modal, 1400)",
};

const paletteStyle: CSSProperties = {
  width: 540,
  maxWidth: "90vw",
  maxHeight: "60vh",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#fff",
  color: "#1d2129",
  borderRadius: 10,
  border: "1px solid #d8dade",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.25)",
  overflow: "hidden",
  fontSize: 14,
  fontFamily: "'Inter Variable', system-ui, sans-serif",
};

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: 15,
  border: "none",
  outline: "none",
  padding: "14px 16px",
  borderBottom: "1px solid #e4e6ea",
};

const listStyle: CSSProperties = {
  overflowY: "auto",
  padding: 6,
  display: "flex",
  flexDirection: "column",
};

const rowStyle = (isActive: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 6,
  textAlign: "left",
  backgroundColor: isActive ? "#dbe4ff" : "transparent",
  border: "none",
  cursor: "pointer",
  font: "inherit",
});

const categoryStyle: CSSProperties = {
  color: "#5a6270",
  fontSize: 12,
  minWidth: 64,
};

const matchesQuery = (haystack: string, query: string): boolean =>
  haystack.toLowerCase().includes(query.toLowerCase());

const toggleCommandId = "website.command-palette.toggle";

/**
 * The demo site's command palette: host code rendered over the ambient
 * registry (Petrinaut's commands plus the demo's). Owns the ⌘K / Ctrl+K
 * opener, and registers the same toggle as a command so the plugin's top-bar
 * button can run it.
 */
export const CommandPalette = () => {
  const registry = useCommandRegistry();
  const commands = useCommands();
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const toggle = () => {
    setOpen((open) => !open);
    setQuery("");
    setActiveIndex(0);
  };

  useCommand({
    id: toggleCommandId,
    label: "Toggle the command palette",
    category: "Editor",
    keywords: ["palette", "commands", "search"],
    shortcut: "mod+k",
    run: toggle,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.shiftKey &&
        !event.altKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
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
  // The palette's own toggle is the one entry that makes no sense in its list.
  const listed = commands.filter((command) => command.id !== toggleCommandId);
  const results = trimmed
    ? listed.filter((command) =>
        matchesQuery(
          `${command.label} ${command.category ?? ""} ${(command.keywords ?? []).join(" ")}`,
          trimmed,
        ),
      )
    : listed;
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const runCommand = (id: string) => {
    setOpen(false);
    registry?.execute(id);
  };

  return (
    <div
      className="petrinaut-root"
      style={overlayStyle}
      role="presentation"
      onPointerDown={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        style={paletteStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onBlur={(event) => {
          if (
            event.relatedTarget &&
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setOpen(false);
          }
        }}
      >
        <input
          ref={(element) => element?.focus()}
          style={inputStyle}
          placeholder="Type a command…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
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
        <div style={listStyle}>
          {results.length === 0 ? (
            <div style={{ padding: 16, color: "#5a6270" }}>
              No matching commands
            </div>
          ) : (
            results.map((command, index) => (
              <button
                key={command.id}
                type="button"
                style={rowStyle(index === active)}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => runCommand(command.id)}
              >
                <span style={categoryStyle}>{command.category ?? ""}</span>
                <span style={{ flex: 1 }}>{command.label}</span>
                {command.shortcut ? (
                  <KeyboardShortcut shortcut={command.shortcut} />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * The palette as a Petrinaut plugin: the overlay and its ⌘K binding mount
 * inside the editor, and a top-bar button runs the same toggle command.
 */
export const commandPalettePlugin = definePetrinautPlugin({
  id: "website.command-palette",
  name: "Command palette",
  buttons: [
    {
      id: "website.command-palette.toggle-button",
      placement: "top-bar-end",
      label: "Command palette",
      tooltip: "Command palette (⌘K / Ctrl+K)",
      icon: <MdKeyboardCommandKey size={16} />,
      command: toggleCommandId,
    },
  ],
  component: CommandPalette,
});
