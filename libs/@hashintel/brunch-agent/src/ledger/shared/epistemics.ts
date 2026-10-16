import * as v from "valibot";

export const vOrigin = v.pipe(
  v.union([
    v.pipe(
      v.literal("assumed"),
      v.description(
        "The agent supplied a stand-in that nothing said supports.",
      ),
    ),
    v.pipe(
      v.literal("inferred"),
      v.description("The agent derived it from what was said."),
    ),
    v.pipe(
      v.literal("evidenced"),
      v.description(
        "It is in material the USER shared, such as a log or a document. A run, an optimization or anything else a tool produced is not evidence for the account: record what it showed in a reflection.",
      ),
    ),
    v.pipe(v.literal("stated"), v.description("The USER said it.")),
  ]),
  v.description(
    "Where the entry's content came from, independently of whether the USER has agreed to it. Omit for stated.",
  ),
);

export const vStatus = v.pipe(
  v.union([
    v.pipe(
      v.literal("open"),
      v.description("It matters and nobody knows yet."),
    ),
    v.pipe(
      v.literal("tentative"),
      v.description(
        "The USER hedged, or the agent proposed it and the USER has not agreed yet.",
      ),
    ),
    v.pipe(
      v.literal("confirmed"),
      v.description(
        "The USER said it without hedging, or agreed when asked. Only the USER's words establish confirmation.",
      ),
    ),
    v.pipe(
      v.literal("conflicted"),
      v.description("Accounts disagree and the USER has not said which holds."),
    ),
    v.pipe(
      v.literal("out-of-scope"),
      v.description("The USER agreed it stays outside the model."),
    ),
  ]),
  v.description(
    "Whether the USER has agreed to this entry. Each entry's status is independent. Omit for confirmed only when the origin is stated; give it for every other origin.",
  ),
);

export type Origin = v.InferOutput<typeof vOrigin>;
export type Status = v.InferOutput<typeof vStatus>;

/** Statuses the map lists as questions, which need no entity to be shown. */
export const questionStatuses: ReadonlySet<Status> = new Set([
  "open",
  "conflicted",
] satisfies Status[]);

/**
 * Origin and status fields with the common case left implicit: origin
 * defaults to `stated`, and only a stated entry may leave its status to
 * default to `confirmed`. Pair with {@link resolveStatus} on the object.
 */
export const epistemicFields = {
  origin: v.optional(vOrigin, "stated"),
  status: v.optional(vStatus),
};

/** Fills a stated entry's missing status with `confirmed`; refuses any other entry without one. */
export const resolveStatus = <
  Entry extends { readonly origin: Origin; readonly status?: Status },
>() =>
  v.rawTransform<Entry, Omit<Entry, "status"> & { readonly status: Status }>(
    ({ dataset, addIssue, NEVER }) => {
      const { status, ...entry } = dataset.value;
      if (status !== undefined) return { ...entry, status };
      if (entry.origin === "stated") return { ...entry, status: "confirmed" };
      addIssue({
        message: `Give a status for an entry whose origin is ${entry.origin}; only a stated entry defaults to confirmed.`,
      });
      return NEVER;
    },
  );
