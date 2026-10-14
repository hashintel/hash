import { validateTakeCount } from "@local/hash-isomorphic-utils/flows/take-count";

import type { FilterListPayload } from "./filter-values.js";
import type {
  PayloadKind,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";

export type TakeFirstResult<Kind extends PayloadKind> =
  | {
      status: "success";
      items: { kind: Kind; value: PayloadKindValues[Kind][] };
    }
  | { status: "error"; code: "invalidCount"; message: string };

/** The first `count` items, in order: none for 0, and all of them for a count past the end of the list. */
export const takeFirst = <Kind extends PayloadKind>(
  input: FilterListPayload<Kind>,
  count: number,
): TakeFirstResult<Kind> => {
  const message = validateTakeCount(count);

  return message
    ? { status: "error", code: "invalidCount", message }
    : {
        status: "success",
        items: { kind: input.kind, value: input.value.slice(0, count) },
      };
};
