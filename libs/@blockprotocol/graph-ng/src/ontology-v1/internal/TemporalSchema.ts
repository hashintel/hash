import * as Pretty from "@effect/schema/Pretty";
import * as S from "@effect/schema/Schema";
import { Temporal } from "@js-temporal/polyfill";
import * as Equivalence from "effect/Equivalence";

const isPlainDate = (value: unknown): value is Temporal.PlainDate =>
  value instanceof Temporal.PlainDate;

const PlainDateEquivalence: Equivalence.Equivalence<Temporal.PlainDate> = (
  a,
  b,
) => a.equals(b);

export const PlainDateFromSelf: S.Schema<Temporal.PlainDate> = S.declare(
  isPlainDate,
  {
    identifier: "PlainDateFromSelf",
    description: "A Temporal PlainDate instance",
    pretty: (): Pretty.Pretty<Temporal.PlainDate> => (date) =>
      `Temporal.PlainDate.from({ year: ${date.year}, month: ${date.month}, day: ${date.day} })`,
    equivalence: (): Equivalence.Equivalence<Temporal.PlainDate> =>
      PlainDateEquivalence,
  },
);

export const PlainDateFromString = S.transform(
  S.string,
  PlainDateFromSelf,
  (value) => Temporal.PlainDate.from(value),
  (value) => value.toString(),
);

const isPlainTime = (value: unknown): value is Temporal.PlainTime =>
  value instanceof Temporal.PlainTime;

const PlainTimeEquivalence: Equivalence.Equivalence<Temporal.PlainTime> = (
  a,
  b,
) => a.equals(b);

export const PlainTimeFromSelf = S.declare(isPlainTime, {
  identifier: "PlainTimeFromSelf",
  description: "A Temporal PlainTime instance",
  pretty: (): Pretty.Pretty<Temporal.PlainTime> => (time) =>
    `Temporal.PlainTime.from({ hour: ${time.hour}, minute: ${time.minute}, second: ${time.second}, millisecond: ${time.millisecond}, microsecond: ${time.microsecond}, nanosecond: ${time.nanosecond} })`,
  equivalence: (): Equivalence.Equivalence<Temporal.PlainTime> =>
    PlainTimeEquivalence,
});

export const PlainTimeFromString = S.transform(
  S.string,
  PlainTimeFromSelf,
  (value) => Temporal.PlainTime.from(value),
  (value) => value.toString(),
);

const isPlainDateTime = (value: unknown): value is Temporal.PlainDateTime =>
  value instanceof Temporal.PlainDateTime;

const PlainDateTimeEquivalence: Equivalence.Equivalence<
  Temporal.PlainDateTime
> = (a, b) => a.equals(b);

export const PlainDateTimeFromSelf = S.declare(isPlainDateTime, {
  identifier: "PlainDateTime",
  description: "A Temporal PlainDateTime instance",
  pretty: (): Pretty.Pretty<Temporal.PlainDateTime> => (dateTime) =>
    `Temporal.PlainDateTime.from({ year: ${dateTime.year}, month: ${dateTime.month}, day: ${dateTime.day}, hour: ${dateTime.hour}, minute: ${dateTime.minute}, second: ${dateTime.second}, millisecond: ${dateTime.millisecond}, microsecond: ${dateTime.microsecond}, nanosecond: ${dateTime.nanosecond} })`,
  equivalence: (): Equivalence.Equivalence<Temporal.PlainDateTime> =>
    PlainDateTimeEquivalence,
});

export const PlainDateTimeFromString = S.transform(
  S.string,
  PlainDateTimeFromSelf,
  (value) => Temporal.PlainDateTime.from(value),
  (value) => value.toString(),
);

const isZonedDateTime = (value: unknown): value is Temporal.ZonedDateTime =>
  value instanceof Temporal.ZonedDateTime;

const ZonedDateTimeEquivalence: Equivalence.Equivalence<
  Temporal.ZonedDateTime
> = (a, b) => a.equals(b);

export const ZonedDateTimeFromSelf = S.declare(isZonedDateTime, {
  identifier: "ZonedDateTime",
  description: "A Temporal ZonedDateTime instance",
  pretty: (): Pretty.Pretty<Temporal.ZonedDateTime> => (zonedDateTime) =>
    `Temporal.ZonedDateTime.from({ year: ${zonedDateTime.year}, month: ${zonedDateTime.month}, day: ${zonedDateTime.day}, hour: ${zonedDateTime.hour}, minute: ${zonedDateTime.minute}, second: ${zonedDateTime.second}, millisecond: ${zonedDateTime.millisecond}, microsecond: ${zonedDateTime.microsecond}, nanosecond: ${zonedDateTime.nanosecond}, timeZoneId: ${zonedDateTime.timeZoneId} })`,
  equivalence: (): Equivalence.Equivalence<Temporal.ZonedDateTime> =>
    ZonedDateTimeEquivalence,
});

export const ZonedDateTimeFromString = S.transform(
  S.string,
  ZonedDateTimeFromSelf,
  (value) => Temporal.ZonedDateTime.from(value),
  (value) => value.toString(),
);

const isDuration = (value: unknown): value is Temporal.Duration =>
  value instanceof Temporal.Duration;

const DurationEquivalence: Equivalence.Equivalence<Temporal.Duration> = (
  a,
  b,
) => Temporal.Duration.compare(a, b) === 0;

export const DurationFromSelf = S.declare(isDuration, {
  identifier: "Duration",
  description: "A Temporal Duration instance",
  pretty: (): Pretty.Pretty<Temporal.Duration> => (duration) =>
    `Temporal.Duration.from({ years: ${duration.years}, months: ${duration.months}, days: ${duration.days}, hours: ${duration.hours}, minutes: ${duration.minutes}, seconds: ${duration.seconds}, milliseconds: ${duration.milliseconds}, microseconds: ${duration.microseconds}, nanoseconds: ${duration.nanoseconds} })`,
  equivalence: (): Equivalence.Equivalence<Temporal.Duration> =>
    DurationEquivalence,
});

export const DurationFromString = S.transform(
  S.string,
  DurationFromSelf,
  (value) => Temporal.Duration.from(value),
  (value) => value.toString(),
);
