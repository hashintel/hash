import * as S from "@effect/schema/Schema";
import { Temporal } from "@js-temporal/polyfill";
import * as Duration from "effect/Duration";
import { identity } from "effect/Function";

import * as TemporalSchema from "./TemporalSchema";

const DateFormat = S.literal("date", "date-time", "time", "duration");
const EmailFormat = S.literal("email", "idn-email");
const HostnameFormat = S.literal("hostname", "idn-hostname");
const IpFormat = S.literal("ipv4", "ipv6");
const ResourceIdentifierFormat = S.literal(
  "uuid",
  "uri",
  "uri-reference",
  "iri",
  "iri-reference",
);
const UriTemplateFormat = S.literal("uri-template");
const JsonPointerFormat = S.literal("json-pointer", "relative-json-pointer");
const RegularExpressionFormat = S.literal("regex");

const Format = S.union(
  S.union(DateFormat, EmailFormat, HostnameFormat),
  S.union(IpFormat, ResourceIdentifierFormat, UriTemplateFormat),
  S.union(JsonPointerFormat, RegularExpressionFormat),
);

export const StringType = S.struct({
  type: S.literal("string"),
  minLength: S.optional(S.number),
  maxLength: S.optional(S.number),
  pattern: S.optional(
    S.string.pipe(
      S.filter((value) => {
        try {
          // eslint-disable-next-line no-new
          new RegExp(value);
          return true;
        } catch (_) {
          return false;
        }
      }),
    ),
  ),
  format: S.optional(Format),
  const: S.optional(S.string),
});

export type StringType = S.Schema.To<typeof StringType>;

function plainValueSchema(type: StringType) {
  return S.string.pipe(
    type.minLength ? S.minLength(type.minLength) : identity,
    type.maxLength ? S.maxLength(type.maxLength) : identity,
    type.pattern ? S.pattern(new RegExp(type.pattern)) : identity,
    type.const ? S.filter((value) => value === type.const) : identity,
  );
}

function dateValueSchema(type: StringType) {
  return S.compose(plainValueSchema(type), TemporalSchema.PlainDateFromString);
}

function dateTimeValueSchema(type: StringType) {
  return S.compose(
    plainValueSchema(type),
    TemporalSchema.ZonedDateTimeFromString,
  );
}

function timeValueSchema(type: StringType) {
  return S.compose(plainValueSchema(type), TemporalSchema.PlainTimeFromString);
}

function durationValueSchema(type: StringType) {
  return S.transform(
    S.compose(plainValueSchema(type), TemporalSchema.DurationFromString),
    S.DurationFromSelf,
    (value) => Duration.decode(value.total("millisecond")),
    (value) =>
      Temporal.Duration.from({ milliseconds: Duration.toMillis(value) }),
  );
}

export function makeSchema<T extends StringType>(
  type: T,
): T["format"] extends "date"
  ? ReturnType<typeof dateValueSchema>
  : T["format"] extends "date-time"
  ? ReturnType<typeof dateTimeValueSchema>
  : T["format"] extends "time"
  ? ReturnType<typeof timeValueSchema>
  : T["format"] extends "duration"
  ? ReturnType<typeof durationValueSchema>
  : ReturnType<typeof plainValueSchema> {
  switch (type.format) {
    case "date":
      return dateValueSchema(type) as never;
    case "date-time":
      return dateTimeValueSchema(type) as never;
    case "time":
      return timeValueSchema(type) as never;
    case "duration":
      return durationValueSchema(type) as never;
    default:
      return plainValueSchema(type) as never;
  }
}

export type ValueSchema<T extends StringType> = ReturnType<
  typeof makeSchema<T>
>;
