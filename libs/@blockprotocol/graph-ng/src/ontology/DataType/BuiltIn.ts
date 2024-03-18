import * as S from "@effect/schema/Schema";

import * as Json from "../../internal/Json.js";
import { parseOrThrow } from "../DataType.js";

export const Boolean = {
  v1: parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
    S.boolean.pipe(S.title("Boolean"), S.description("A True or False value")),
  ),
};

export const EmptyList = {
  v1: parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1",
    S.tuple().pipe(S.title("Empty List"), S.description("An Empty List")),
  ),
};

export const Null = {
  v1: parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
    S.null.pipe(
      S.title("Null"),
      S.description("A placeholder value representing 'nothing'"),
    ),
  ),
};

export const Number = {
  v1: parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    S.number.pipe(
      S.title("Number"),
      S.description("An arithmetical value (in the Real number system)"),
    ),
  ),
};

export const Opaque = {
  v1: parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
    S.record(S.string, Json.Value).pipe(
      S.title("Object"),
      S.description("An opaque, untyped JSON object"),
    ),
  ),
};

export const Text = {
  v1: parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    S.string.pipe(
      S.title("Text"),
      S.description("An ordered sequence of characters"),
    ),
  ),
};
