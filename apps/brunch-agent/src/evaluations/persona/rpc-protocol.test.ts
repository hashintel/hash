import { expect, test } from "vitest";

import {
  createJsonlLineReader,
  encodePersonaRecord,
  parsePersonaCommand,
} from "./rpc-protocol.ts";

test("frames records on LF only, strips one CR, and keeps U+2028 inside strings", () => {
  const lines: string[] = [];
  const reader = createJsonlLineReader((line) => lines.push(line));
  const record = encodePersonaRecord({
    type: "prompt",
    message: "first\u2028second",
  });
  const bytes = Buffer.from(
    `${record}{"type":"get_state"}\r\n\n{"type":"end"}`,
  );
  // Split mid-character to prove multi-byte decoding across chunks.
  const cut = bytes.indexOf(Buffer.from("\u2028")) + 1;
  reader.write(bytes.subarray(0, cut));
  reader.write(bytes.subarray(cut));
  reader.end();
  expect(lines).toEqual([
    '{"type":"prompt","message":"first\u2028second"}',
    '{"type":"get_state"}',
    '{"type":"end"}',
  ]);
});

test("accepts known commands and answers invalid input the way Pi does", () => {
  expect(
    parsePersonaCommand('{"id":"1","type":"prompt","message":"Hello"}'),
  ).toEqual({
    ok: true,
    command: { id: "1", type: "prompt", message: "Hello" },
  });
  expect(parsePersonaCommand("not json")).toMatchObject({
    ok: false,
    response: { type: "response", command: "parse", success: false },
  });
  expect(
    parsePersonaCommand('{"id":"2","type":"prompt","message":"  "}'),
  ).toMatchObject({
    ok: false,
    response: {
      id: "2",
      command: "prompt",
      success: false,
      error: "Expected nonblank text",
    },
  });
  expect(parsePersonaCommand('{"id":"3","type":"steer"}')).toMatchObject({
    ok: false,
    response: { id: "3", command: "steer", success: false },
  });
});
