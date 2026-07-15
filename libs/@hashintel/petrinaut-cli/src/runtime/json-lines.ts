export type BufferedJsonLines = {
  lines: string[];
  remainder: string;
  requestTooLarge: boolean;
};

export function consumeBufferedJsonLines(
  buffer: string,
  maxLineBytes: number,
): BufferedJsonLines {
  const lines: string[] = [];
  let lineStart = 0;
  let newlineIndex = buffer.indexOf("\n", lineStart);

  while (newlineIndex !== -1) {
    const line = buffer.slice(lineStart, newlineIndex);
    if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
      return { lines, remainder: "", requestTooLarge: true };
    }
    lines.push(line);
    lineStart = newlineIndex + 1;
    newlineIndex = buffer.indexOf("\n", lineStart);
  }

  const remainder = buffer.slice(lineStart);
  return {
    lines,
    remainder,
    requestTooLarge: Buffer.byteLength(remainder, "utf8") > maxLineBytes,
  };
}
