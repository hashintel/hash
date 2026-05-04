import { Position } from "vscode-languageserver-types";

/**
 * Convert a character offset to an LSP Position (zero-based line and character).
 */
export function offsetToPosition(text: string, offset: number): Position {
  let line = 0;
  let character = 0;
  const clamped = Math.min(offset, text.length);

  for (let i = 0; i < clamped; i++) {
    if (text[i] === "\n") {
      line++;
      character = 0;
    } else {
      character++;
    }
  }

  return Position.create(line, character);
}

/**
 * Convert an LSP Position (zero-based line and character) to a character offset.
 */
export function positionToOffset(text: string, position: Position): number {
  let line = 0;
  let i = 0;

  while (i < text.length && line < position.line) {
    if (text[i] === "\n") {
      line++;
    }
    i++;
  }

  return Math.min(i + position.character, text.length);
}
