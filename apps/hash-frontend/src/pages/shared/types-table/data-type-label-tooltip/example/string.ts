import { z } from "zod";

import type {
  SingleValueSchema,
  StringConstraints,
  StringFormat,
} from "@blockprotocol/type-system";

const formats = {
  uri: ["https://example.com", z.url()],
  hostname: ["example.com", z.hostname()],
  ipv4: ["192.0.2.1", z.ipv4()],
  ipv6: ["2001:db8::1", z.ipv6()],
  uuid: ["123e4567-e89b-42d3-a456-426614174000", z.uuid()],
  regex: [
    "[A-Z]+",
    z.string().refine((value) => {
      try {
        return !!new RegExp(value, "u");
      } catch {
        return false;
      }
    }),
  ],
  email: ["alex@example.com", z.email()],
  date: ["2026-01-15", z.iso.date()],
  time: [
    "14:30:00Z",
    z
      .string()
      .regex(/^\d{2}:\d{2}:\d{2}Z$/u)
      .refine((value) => z.iso.time().safeParse(value.slice(0, -1)).success),
  ],
  "date-time": ["2026-01-15T14:30:00Z", z.iso.datetime({ offset: true })],
  duration: ["PT1H30M", z.iso.duration()],
} satisfies Record<StringFormat, [string, z.ZodType<string>]>;

const getPatternExample = (pattern: string) => {
  if (pattern.length > 128) {
    return undefined;
  }
  // One repeated character class keeps matching bounded for schema-provided patterns.
  const match =
    /^\^?([\w #:/@-]*)(\[[a-zA-Z0-9\\^-]+\]|\\[dws])([+*?]|\{\d{1,3}(?:,\d{0,3})?\})?([\w #:/@-]*)\$?$/u.exec(
      pattern,
    );
  if (!match) {
    if (/^\^?[\w #:/@-]*\$?$/u.test(pattern)) {
      return {
        value: pattern.replace(/^\^|\$$/gu, ""),
        matches: new RegExp(pattern, "u"),
      };
    }
    return undefined;
  }
  const [, before = "", atom = "", repeat = "", after = ""] = match;
  try {
    const character = new RegExp(`^(?:${atom})$`, "u");
    const alphabet = Array.from("AbcXYZ1234567890def _-").filter((candidate) =>
      character.test(candidate),
    );
    const first = alphabet[0];
    if (first === undefined) {
      return undefined;
    }
    const count = repeat.startsWith("{")
      ? Number(repeat.slice(1).split(/[,}]/u)[0])
      : repeat === "+" || repeat === "*"
        ? 6
        : 1;
    if (count > 64) {
      return undefined;
    }
    return {
      value:
        before +
        Array.from(
          { length: count },
          (_, index) => alphabet[index % alphabet.length] ?? first,
        ).join("") +
        after,
      matches: new RegExp(pattern, "u"),
    };
  } catch {
    return undefined;
  }
};

export const getStringExample = (
  schemas: Extract<SingleValueSchema, { type: "string" }>[],
): string | undefined => {
  const constraints: StringConstraints[] = schemas.flatMap((schema) =>
    "enum" in schema ? [] : [schema],
  );
  const minimum = Math.max(
    0,
    ...constraints.map((schema) => schema.minLength ?? 0),
  );
  const maximum = Math.min(
    64,
    ...constraints.map((schema) => schema.maxLength ?? 64),
  );
  if (minimum > maximum) {
    return undefined;
  }
  const patterns = constraints.flatMap((schema) =>
    schema.pattern === undefined ? [] : [getPatternExample(schema.pattern)],
  );
  if (patterns.some((pattern) => !pattern)) {
    return undefined;
  }
  const enumeration = schemas.find((schema) => "enum" in schema);
  const candidates =
    enumeration && "enum" in enumeration
      ? enumeration.enum.slice(0, 64)
      : [
          ...constraints.flatMap((schema) =>
            schema.format ? [formats[schema.format][0]] : [],
          ),
          ...patterns.flatMap((pattern) => (pattern ? [pattern.value] : [])),
          "Example",
          "Hello",
          "ABC",
          "abc",
          "123",
          "#336699",
          "Example text "
            .repeat(Math.ceil(minimum / 13))
            .padEnd(minimum, "a")
            .slice(0, Math.max(minimum, Math.min(7, maximum))),
          "Example".slice(0, maximum),
        ];
  return candidates.find(
    (value) =>
      value.length <= 128 &&
      Array.from(value).length >= minimum &&
      Array.from(value).length <= maximum &&
      schemas.every(
        (schema) => !("enum" in schema) || schema.enum.includes(value),
      ) &&
      patterns.every((pattern) => pattern?.matches.test(value)) &&
      constraints.every(
        (schema) =>
          !schema.format || formats[schema.format][1].safeParse(value).success,
      ),
  );
};
