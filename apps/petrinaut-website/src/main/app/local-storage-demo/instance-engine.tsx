import { createContext, use } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { definePetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";

import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

export type InstanceEngine = "rust" | "typescript";
export const instanceEngineStorageKey = "petrinaut-website:instance-engine";

const readEngine = (): InstanceEngine =>
  readBrowserStorage(localStorage, instanceEngineStorageKey) === "typescript"
    ? "typescript"
    : "rust";
const writeEngine = (engine: InstanceEngine) =>
  writeBrowserStorage(localStorage, instanceEngineStorageKey, engine);

export const useInstanceEngine = () => {
  const [engine, setEngine, ready] = usePersistedState<InstanceEngine>({
    fallback: "rust",
    read: readEngine,
    write: writeEngine,
  });
  return { engine, setEngine, ready };
};

export const InstanceEngineContext = createContext<{
  engine: InstanceEngine;
  select: (engine: InstanceEngine) => void;
} | null>(null);

export const InstanceEngineSelector = () => {
  const control = use(InstanceEngineContext);
  if (!control) return null;
  return (
    <label
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        fontSize: "sm",
      })}
      title="Switching keeps your saved nets and resets undo history and simulation."
    >
      Engine
      <select
        aria-label="Document engine"
        className={css({
          border: "1px solid",
          borderColor: "neutral.s20",
          borderRadius: "md",
          background: "neutral.s00",
          padding: "1",
        })}
        value={control.engine}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "rust" || value === "typescript") control.select(value);
        }}
      >
        <option value="rust">Rust (experimental)</option>
        <option value="typescript">TypeScript</option>
      </select>
    </label>
  );
};

export const instanceEnginePlugin = definePetrinautPlugin(
  {
    id: "website.instance-engine",
    name: "Document engine",
    description:
      "Switch between Rust and TypeScript while keeping the same saved nets. Switching resets undo history and simulation.",
    required: true,
    topBarItems: { engine: { place: "top-bar-end" } },
  },
  {
    topBarItems: { engine: <InstanceEngineSelector /> },
  },
);
