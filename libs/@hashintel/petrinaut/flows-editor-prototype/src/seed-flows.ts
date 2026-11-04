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

export type FlowMeta = {
  status: FlowStatus;
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
    meta: {
      status: "live",
      trigger: { kind: "schedule", label: "1st of every month, 09:00" },
      runs: 17,
      owner: "Dora",
      updated: "Today, 08:02",
    },
  },
  {
    id: "purity-check",
    document: purityCheckExample(),
    meta: {
      status: "live",
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
      { kind: "requestReview", description: "Ask the quality lead" },
    ]),
    meta: {
      status: "live",
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
    meta: {
      status: "draft",
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
    trigger: { kind: "none", label: "No trigger yet" },
    runs: 0,
    owner: "Aakarsh",
    updated: "Just now",
  },
});
