import { z } from "zod";

import { displayNameSchema } from "../validation/display-name";
import { idSchema } from "./entity-schemas";

import type { StatusLabel, StatusView } from "../types/sdcpn";

export const statusLabelSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description:
        "Human-readable label name shown on badges and as a Kanban column title (e.g. `In Progress`, `Blocked`).",
    }),
    displayColor: z.string().min(1).meta({
      description:
        'CSS colour string for the label\'s badge, tint, and Kanban column, e.g. `"#1E90FF"`.',
    }),
    places: z.array(idSchema).meta({
      description:
        "IDs of the places whose tokens carry this label. Several places may map to one label. A componentInstance's copy of a subnet place is addressed by its scoped id `instanceId::placeId` (nested instances give `outer::inner::placeId`). MUST be empty when `isExit` is true.",
    }),
    tokenCondition: z.string().optional().meta({
      description:
        "Optional boolean expression over the token's attributes (e.g. `attempts > 0`). The label applies only while the token is in the label's places AND this expression holds. Omit to match every token in the places.",
    }),
    isExit: z.boolean().optional().meta({
      description:
        "Marks the view's exit label: it is assigned to a tracked instance whose token has left every place of the view's labels (e.g. consumed by a final transition with no sink place). At most one label per view may set this, and an exit label has no `places`. Prefer explicit sink places for distinct terminal states such as Done vs Failed.",
    }),
  })
  .meta({
    description: "One named status within a status view.",
  }) satisfies z.ZodType<StatusLabel>;

/**
 * The `statusViewSchema` shape without the whole-view label invariants, for
 * deriving partial-update schemas. Parse full views with `statusViewSchema`.
 */
export const statusViewObjectSchema = z.strictObject({
  id: idSchema,
  name: displayNameSchema.meta({
    description: "Human-readable status view name (e.g. `Ticket status`).",
  }),
  description: z.string().optional().meta({
    description: "Optional status view summary shown to users.",
  }),
  identityRef: idSchema.meta({
    description:
      "ID of the Identity this view tracks. Tokens participate when their colour has an element referencing the same identity, and instances are keyed by that element's value.",
  }),
  labels: z.array(statusLabelSchema).meta({
    description:
      "The view's labels. Position in this array is the label's order: the Kanban column position and the legend position. Reorder with `moveStatusViewLabel`.",
  }),
});

type StatusLabelInvariantShape = Pick<
  StatusLabel,
  "id" | "name" | "places" | "isExit"
>;

/**
 * Whole-view label invariants: unique label ids and names, at most one exit
 * label, and no places on the exit label. Applied by `statusViewSchema` and
 * by the file-format document schema, so hand-edited documents fail the
 * import parse instead of feeding downstream code that assumes them.
 */
export const assertStatusViewLabelInvariants = (ctx: {
  value: { labels: StatusLabelInvariantShape[] };
  issues: {
    push(issue: {
      code: "custom";
      path: (string | number)[];
      message: string;
      input: unknown;
    }): void;
  };
}) => {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  let exitLabelSeen = false;

  for (const [index, label] of ctx.value.labels.entries()) {
    if (seenIds.has(label.id)) {
      ctx.issues.push({
        code: "custom",
        path: ["labels", index, "id"],
        message: `Duplicate label id \`${label.id}\`. Label ids must be unique within a status view.`,
        input: label.id,
      });
    }
    seenIds.add(label.id);

    if (seenNames.has(label.name)) {
      ctx.issues.push({
        code: "custom",
        path: ["labels", index, "name"],
        message: `Duplicate label name \`${label.name}\`. Label names must be unique within a status view.`,
        input: label.name,
      });
    }
    seenNames.add(label.name);

    if (label.isExit) {
      if (exitLabelSeen) {
        ctx.issues.push({
          code: "custom",
          path: ["labels", index, "isExit"],
          message: "A status view may declare at most one exit label.",
          input: label.isExit,
        });
      }
      exitLabelSeen = true;

      if (label.places.length > 0) {
        ctx.issues.push({
          code: "custom",
          path: ["labels", index, "places"],
          message:
            "An exit label has no places — it applies to instances whose token has left the view's places.",
          input: label.places,
        });
      }
    }
  }
};

export const statusViewSchema = statusViewObjectSchema
  .check(assertStatusViewLabelInvariants)
  .meta({
    description:
      "A user-defined mapping from net state to named statuses for the instances of one identity. Which label a tracked instance carries is derived from where its token sits (and the labels' token conditions) — status is never stored.",
  }) satisfies z.ZodType<StatusView>;

export type StatusViewSchema = typeof statusViewSchema;
