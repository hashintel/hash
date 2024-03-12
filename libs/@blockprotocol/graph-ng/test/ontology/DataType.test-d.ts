import * as S from "@effect/schema/Schema";
import { Temporal } from "@js-temporal/polyfill";
import { Duration } from "effect";
import { expectTypeOf, test } from "vitest";

import * as Boolean from "../../src/ontology-v1/builtin/Boolean";
import * as EmptyList from "../../src/ontology-v1/builtin/EmptyList";
import * as Null from "../../src/ontology-v1/builtin/Null";
import * as Number from "../../src/ontology-v1/builtin/Number";
import * as Object from "../../src/ontology-v1/builtin/Object";
import * as Text from "../../src/ontology-v1/builtin/Text";
import * as DataType from "../../src/ontology-v1/DataType";
import * as DataTypeUrl from "../../src/ontology-v1/DataTypeUrl";
import { DataTypeValue } from "../../src/ontology-v1/DataTypeValue";
import * as Json from "../../src/internal/Json";

test("makeValueSchema(Boolean)", () => {
  const Schema = DataType.makeValueSchema(Boolean.V1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<boolean>>();
});

test("makeValueSchema(EmptyList)", () => {
  const Schema = DataType.makeValueSchema(EmptyList.V1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<ReadonlyArray<Json.Value>>>();
});

test("makeValueSchema(Null)", () => {
  const Schema = DataType.makeValueSchema(Null.V1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<null>>();
});

test("makeValueSchema(Number)", () => {
  const Schema = DataType.makeValueSchema(Number.V1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<number, number>>();
});

test("makeValueSchema(Object)", () => {
  const Schema = DataType.makeValueSchema(Object.V1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<Record<string, Json.Value>>>();
});

test("makeValueSchema(Text)", () => {
  const Schema = DataType.makeValueSchema(Text.V1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<string>>();
});

export const DateV1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/date/v/1",
  ),
  title: "Date",
  description: "Date in ISO 8601 format",

  type: "string",
  format: "date",
} satisfies DataType.DataType;

test("makeValueSchema(Date)", () => {
  const Schema = DataType.makeValueSchema(DateV1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<Temporal.PlainDate, string>>();
});

export const TimeV1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/time/v/1",
  ),
  title: "Time",
  description: "Time in ISO 8601 format",

  type: "string",
  format: "time",
} satisfies DataType.DataType;

test("makeValueSchema(Time)", () => {
  const Schema = DataType.makeValueSchema(TimeV1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<Temporal.PlainTime, string>>();
});

export const DateTimeV1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/date-time/v/1",
  ),
  title: "DateTime",
  description: "Date and time in ISO 8601 format",

  type: "string",
  format: "date-time",
} satisfies DataType.DataType;

test("makeValueSchema(DateTime)", () => {
  const Schema = DataType.makeValueSchema(DateTimeV1);

  expectTypeOf(Schema).toMatchTypeOf<
    S.Schema<Temporal.ZonedDateTime, string>
  >();
});

export const DurationV1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/duration/v/1",
  ),
  title: "Duration",
  description: "ISO 8601 duration",

  type: "string",
  format: "duration",
} satisfies DataType.DataType;

test("makeValueSchema(Duration)", () => {
  const Schema = DataType.makeValueSchema(DurationV1);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<Duration.Duration, string>>();
});

test("makeValueSchema([opaque])", () => {
  const Schema = DataType.makeValueSchema(DurationV1 as DataType.DataType);

  expectTypeOf(Schema).toMatchTypeOf<S.Schema<DataTypeValue, Json.Value>>();
});
