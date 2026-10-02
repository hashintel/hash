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
  return words.map((word, index) => ({ ...word, id: entries[index]!.id }));
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
  const [state, setState] = useState<{
    key: string | null;
    entries: readonly ConversationWord[];
    notice: string | null;
  }>();
  useEffect(() => {
    const refresh = () => {
      let raw: string | null;
      try {
        raw = key === null ? null : localStorage.getItem(key);
      } catch {
        setState({ key, entries: [], notice: unavailable });
        return;
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
        setState({
          key,
          entries: validateEntries(parsed.entries),
          notice: null,
        });
      } catch {
        setState({
          key,
          entries: [],
          notice:
            "Saved words could not be loaded. No hints will be used until you save a valid list.",
        });
      }
    };
    refresh();
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        if (event.storageArea === localStorage) refresh();
      } catch {
        /* Keep tab-local edits. */
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  const ready = key !== null && state?.key === key;
  const save = (input: readonly ConversationWord[]) => {
    if (!ready)
      throw new Error("Words are still loading for this conversation.");
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
    ready,
    entries: ready ? state.entries : [],
    notice: ready ? state.notice : null,
    save,
    clear,
  };
};
