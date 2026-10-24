import { dslExamples } from "@hashintel/petrinaut-core";

/** The one DSL file the page keeps in this browser. */
export const dslFileStorageKey = "petrinaut:custom-dsl";

/** The stored text, `null` when there is none or the browser refuses to read. */
export const loadDslFile = (): string | null => {
  try {
    return localStorage.getItem(dslFileStorageKey);
  } catch {
    return null;
  }
};

/** Writes the text; `false` when the browser refuses. */
export const saveDslFile = (text: string): boolean => {
  try {
    localStorage.setItem(dslFileStorageKey, text);
    return true;
  } catch {
    return false;
  }
};

/** What a first visit opens on: the first of the DSL's own examples. */
export const defaultDslText = (): string => dslExamples[0]?.text ?? "";
