import { useEffect, useState } from "react";

import {
  formatShortcutKeys,
  useCommandRegistry,
  useCommands,
} from "@hashintel/petrinaut";

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

const shortcutStyle: CSSProperties = {
  display: "flex",
  gap: 3,
};

const keyStyle = (isWide: boolean): CSSProperties => ({
  width: isWide ? undefined : 20,
  minWidth: 20,
  height: 20,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  paddingInline: isWide ? 5 : 0,
  fontSize: 12,
  fontFamily: "monospace",
  color: "#3d4250",
  backgroundColor: "#f2f3f0",
  border: "1px solid #d8dade",
  borderRadius: 4,
  boxShadow: "0 1px 0 #d8dade",
});

const matchesQuery = (haystack: string, query: string): boolean =>
  haystack.toLowerCase().includes(query.toLowerCase());

/**
 * The demo site's own command palette — host code, not part of Petrinaut.
 * Renders whatever the ambient command registry holds (Petrinaut's commands
 * plus the demo's) and owns its ⌘K / Ctrl+K opener.
 */
export const CommandPalette = () => {
  const registry = useCommandRegistry();
  const commands = useCommands();
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

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
    ? commands.filter((command) =>
        matchesQuery(
          `${command.label} ${command.category ?? ""} ${(command.keywords ?? []).join(" ")}`,
          trimmed,
        ),
      )
    : commands;
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const runCommand = (id: string) => {
    setOpen(false);
    registry?.execute(id);
  };

  return (
    <div
      style={overlayStyle}
      role="presentation"
      onPointerDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        style={paletteStyle}
        onPointerDown={(event) => event.stopPropagation()}
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
                  <span style={shortcutStyle} aria-hidden>
                    {formatShortcutKeys(command.shortcut).map((key) => (
                      <kbd key={key} style={keyStyle(key.length > 1)}>
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
