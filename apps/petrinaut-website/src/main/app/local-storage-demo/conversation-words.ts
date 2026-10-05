import { useEffect, useState } from "react";

import {
  encodeVoiceWords,
  validateWords,
  type VoiceWord,
} from "../../../shared/voice-words";

export type ConversationWord = VoiceWord & { readonly id: string };
export const conversationWordsKey = (
  principal: string,
  conversation: string,
): string =>
  `petrinaut-website:words:v1:${encodeURIComponent(principal)}:${encodeURIComponent(conversation)}`;

const unavailable = "Available in this tab; browser storage is unavailable.";

const validateEntries = (input: unknown): readonly ConversationWord[] => {
  if (!Array.isArray(input)) throw new Error("Invalid saved words.");
  const ids = new Set<string>();
  const entries = input.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("id" in entry) ||
      typeof entry.id !== "string" ||
      !entry.id ||
      entry.id.length > 100 ||
      ids.has(entry.id)
    )
      throw new Error("Invalid saved word identity.");
    ids.add(entry.id);
    const { id, ...word } = entry;
    return { id, word };
  });
  const words = validateWords(entries.map((entry) => entry.word));
  encodeVoiceWords(words);
  return words.map((word, index) => {
    const id = entries[index]?.id;
    if (id === undefined) throw new Error("Invalid saved word identity.");
    return { ...word, id };
  });
};

type ConversationWordsState = {
  readonly key: string | null;
  readonly entries: readonly ConversationWord[];
  readonly notice: string | null;
};

const loadConversationWords = (key: string | null): ConversationWordsState => {
  let raw: string | null;
  try {
    raw = key === null ? null : localStorage.getItem(key);
  } catch {
    return { key, entries: [], notice: unavailable };
  }
  try {
    const parsed: unknown =
      raw === null ? { version: 1, entries: [] } : JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("entries" in parsed) ||
      Object.keys(parsed).length !== 2
    )
      throw new Error("Invalid saved words.");
    return { key, entries: validateEntries(parsed.entries), notice: null };
  } catch {
    return {
      key,
      entries: [],
      notice:
        "Saved words could not be loaded. No hints will be used until you save a valid list.",
    };
  }
};

/** Unlike general preferences, this store reports failed persistence and never exposes the previous binding. */
export const useConversationWords = (
  principal: string,
  conversation: string | null,
) => {
  const key =
    conversation === null
      ? null
      : conversationWordsKey(principal, conversation);
  const [stored, setState] = useState(() => loadConversationWords(key));
  // Loaded during render: Voice can start from a child layout effect, which
  // runs before this component's effects.
  let state = stored;
  if (state.key !== key) {
    state = loadConversationWords(key);
    setState(state);
  }
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        if (event.storageArea === localStorage) {
          setState(loadConversationWords(key));
        }
      } catch {
        /* Keep tab-local edits. */
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  const save = (input: readonly ConversationWord[]) => {
    if (key === null) throw new Error("This conversation has no words list.");
    const entries = validateEntries(input);
    let notice: string | null = null;
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, entries }));
    } catch {
      notice = unavailable;
    }
    setState({ key, entries, notice });
  };
  const clear = () => {
    if (key === null) return;
    let notice: string | null = null;
    try {
      localStorage.removeItem(key);
    } catch {
      notice = unavailable;
    }
    setState({ key, entries: [], notice });
  };
  return {
    key,
    entries: key === null ? [] : state.entries,
    notice: key === null ? null : state.notice,
    save,
    clear,
  };
};
