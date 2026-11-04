/**
 * The demo workspace's flows (4 Nov: "the entire encapsulation of what Flows will be in the main app … with
 * pre-populated data"). One per state the list has to show: live on a schedule, live on an event but failing,
 * manual-only, paused, a draft, and one more live.
 *
 * MOCK: everything here. Only the Monthly supplier review has runs to open; the others carry a summary for the list.
 */
import {
  addStep,
  emptyDocument,
  type EditorDocument,
  START_ID,
} from "./document";
import { purityCheckExample } from "./purity-check-example";
import { supplierCertificatesExample } from "./supplier-certificates-example";
import { supplierReviewRunExample } from "./supplier-review-example";

import type { StepState } from "./run-history";

export type FlowStatus = "live" | "draft" | "paused";

/** A published version, newest first in `FlowVersion.published`. */
export type PublishedVersion = {
  n: number;
  at: string;
  by: string;
  name?: string;
};

/**
 * Versions (V0–V7, Figma 1185:88322). The draft carries the next number; publishing makes it live. A flow with no
 * edits since its last publish is `live` on `current`; an edit starts the `current + 1` draft (V1 → V2).
 */
export type FlowVersion = {
  current: number;
  state: "draft" | "live";
  /** When the draft was last edited, for the version menu ("Edited 2 min ago"). */
  editedAt?: string;
  published: PublishedVersion[];
};

export type FlowMeta = {
  status: FlowStatus;
  version: FlowVersion;
  /** What starts it, for the list. */
  trigger: {
    kind: "schedule" | "responsive" | "manual" | "none";
    label: string;
  };
  lastRun?: { state: StepState; label: string; when: string };
  runs: number;
  owner: string;
  updated: string;
};

export type FlowEntry = {
  id: string;
  document: EditorDocument;
  meta: FlowMeta;
};

export const monthlyReviewId = "monthly-supplier-review";

/** A straight flow: Start, then each step after the one before. */
const straight = (
  name: string,
  steps: { kind: string; description: string }[],
): EditorDocument => {
  let document = emptyDocument(name);
  let after = START_ID;
  for (const step of steps) {
    const added = addStep(document, step.kind, {
      after: { stepId: after, port: "next" },
    });
    document = {
      ...added.document,
      steps: added.document.steps.map((candidate) =>
        candidate.stepId === added.stepId
          ? { ...candidate, description: step.description }
          : candidate,
      ),
    };
    after = added.stepId;
  }
  return {
    ...document,
    positions: { ...document.positions, [START_ID]: { x: 40, y: 300 } },
  };
};

export const seedFlows = (): FlowEntry[] => [
  {
    id: monthlyReviewId,
    document: supplierReviewRunExample(),
    // V2: an edit started the v6 draft over live v5.
    meta: {
      status: "live",
      version: {
        current: 6,
        state: "draft",
        editedAt: "2 min ago",
        published: [
          { n: 5, at: "3 Nov", by: "Aakarsh Singh" },
          { n: 4, at: "28 Oct", by: "Dora Ma" },
          { n: 3, at: "21 Oct", by: "Ciarán Morinan" },
          { n: 2, at: "9 Oct", by: "Dora Ma" },
          { n: 1, at: "2 Oct", by: "Dora Ma" },
        ],
      },
      trigger: { kind: "schedule", label: "1st of every month, 09:00" },
      runs: 17,
      owner: "Dora",
      updated: "Today, 08:02",
    },
  },
  {
    id: "purity-check",
    document: purityCheckExample(),
    // V1: live on v3, no edits since.
    meta: {
      status: "live",
      version: {
        current: 3,
        state: "live",
        published: [
          { n: 3, at: "2 Nov", by: "Konstantin" },
          { n: 2, at: "20 Oct", by: "Konstantin" },
          { n: 1, at: "12 Oct", by: "Konstantin" },
        ],
      },
      trigger: { kind: "responsive", label: "When a Shipment changes" },
      lastRun: { state: "failed", label: "Failed", when: "Today, 07:40" },
      runs: 42,
      owner: "Konstantin",
      updated: "2 Nov",
    },
  },
  {
    id: "supplier-certificates",
    document: {
      ...supplierCertificatesExample("fetch-file"),
      name: "Supplier certificates",
    },
    meta: {
      status: "live",
      version: {
        current: 2,
        state: "live",
        published: [
          { n: 2, at: "Yesterday", by: "Dora Ma" },
          { n: 1, at: "29 Oct", by: "Dora Ma" },
        ],
      },
      trigger: { kind: "manual", label: "Manual only" },
      lastRun: { state: "done", label: "Completed", when: "Yesterday, 16:05" },
      runs: 6,
      owner: "Dora",
      updated: "Yesterday",
    },
  },
  {
    id: "quality-incident-follow-up",
    document: straight("Quality incident follow-up", [
      { kind: "readEntity", description: "Read the incident" },
      { kind: "queryEntities", description: "Find related shipments" },
      { kind: "requestReview", description: "Ask the quality lead" },
    ]),
    // V5: the v3 draft can't publish: Find entities has no entity type yet.
    meta: {
      status: "live",
      version: {
        current: 3,
        state: "draft",
        editedAt: "10 min ago",
        published: [
          { n: 2, at: "30 Oct", by: "Dei" },
          { n: 1, at: "22 Oct", by: "Dei" },
        ],
      },
      trigger: { kind: "responsive", label: "When an Incident is created" },
      lastRun: { state: "done", label: "Completed", when: "Today, 09:12" },
      runs: 12,
      owner: "Dei",
      updated: "30 Oct",
    },
  },
  {
    id: "weekly-stock-summary",
    document: straight("Weekly stock summary", [
      { kind: "queryEntities", description: "Find stock below minimum" },
      { kind: "sendEmail", description: "Email the buyers" },
    ]),
    meta: {
      status: "paused",
      version: {
        current: 4,
        state: "live",
        published: [
          { n: 4, at: "26 Oct", by: "Ciarán Morinan" },
          { n: 3, at: "1 Sep", by: "Ciarán Morinan" },
        ],
      },
      trigger: { kind: "schedule", label: "Mondays, 08:00 · paused" },
      lastRun: { state: "done", label: "Completed", when: "26 Oct, 08:00" },
      runs: 31,
      owner: "Ciarán",
      updated: "26 Oct",
    },
  },
  {
    id: "new-shipment-intake",
    document: straight("New shipment intake", [
      { kind: "queryEntities", description: "Find shipments received today" },
    ]),
    // V0: never published.
    meta: {
      status: "draft",
      version: {
        current: 1,
        state: "draft",
        editedAt: "Today, 10:15",
        published: [],
      },
      trigger: { kind: "none", label: "No trigger yet" },
      runs: 0,
      owner: "Aakarsh",
      updated: "Today, 10:15",
    },
  },
];

/** A flow made with New flow: a draft with Start only. */
export const newFlowEntry = (id: string): FlowEntry => ({
  id,
  document: emptyDocument(),
  meta: {
    status: "draft",
    version: {
      current: 1,
      state: "draft",
      editedAt: "Just now",
      published: [],
    },
    trigger: { kind: "none", label: "No trigger yet" },
    runs: 0,
    owner: "Aakarsh",
    updated: "Just now",
  },
});
