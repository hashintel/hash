import { runbookIrFence } from "./constants";

const openingRunbookIrFence = `\`\`\`${runbookIrFence}`;
const closingFence = "```";

/** The content of the last complete fenced runbook-ir block in text, trimmed. */
export const latestRunbookIrBlock = (text: string): string | undefined => {
  let last: string | undefined;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const openAt = text.indexOf(openingRunbookIrFence, searchFrom);
    if (openAt === -1) {
      break;
    }
    let cursor = openAt + openingRunbookIrFence.length;
    let lastNewline: number | undefined;
    while (cursor < text.length) {
      const character = text[cursor];
      if (character === undefined || character.trim() !== "") {
        break;
      }
      if (character === "\n") {
        lastNewline = cursor;
      }
      cursor += 1;
    }
    if (lastNewline === undefined) {
      searchFrom = openAt + 1;
      continue;
    }
    const contentStart = lastNewline + 1;
    const closeAt = text.indexOf(closingFence, contentStart);
    if (closeAt === -1) {
      break;
    }
    last = text.slice(contentStart, closeAt).trim();
    searchFrom = closeAt + closingFence.length;
  }
  return last;
};
