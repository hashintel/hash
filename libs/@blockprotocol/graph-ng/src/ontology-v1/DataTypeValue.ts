import { Temporal } from "@js-temporal/polyfill";
import { Duration } from "effect";

import * as Json from "../Json.js";

// The same as a JSON Value, except with some additional values
export type DataTypeValue =
  | Json.Value
  | Duration.Duration
  | Temporal.ZonedDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime;

// TODO: schema?!
