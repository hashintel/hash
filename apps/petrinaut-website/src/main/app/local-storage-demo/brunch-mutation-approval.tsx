import { useSyncExternalStore } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  mutationActionInputSchemas,
  type PetrinautAiMutationToolName,
} from "@hashintel/petrinaut-core";
import {
  definePetrinautAiInteractiveTool,
  type PetrinautAiInteractiveTool,
  type PetrinautAiInteractiveToolWidgetProps,
} from "@hashintel/petrinaut/ui";

import type { InBandBrowserCallAdmission } from "./in-band-browser-call";

type BrunchMutationApprovalChoice = "allow" | "always-allow" | "deny";

type BrunchMutationApprovalDecision =
  | { readonly decision: "allow" }
  | { readonly decision: "deny"; readonly reason: string };

type PendingApproval = {
  readonly toolName: string;
  readonly resolve: (decision: BrunchMutationApprovalDecision) => void;
  readonly removeAbortListener: () => void;
};

export interface BrunchMutationApprovalCoordinator {
  request(params: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly signal: AbortSignal;
  }): Promise<BrunchMutationApprovalDecision>;
  resolve(toolCallId: string, choice: BrunchMutationApprovalChoice): boolean;
  hasPending(toolCallId: string): boolean;
  /** Stable until the set of waiting tool names changes. */
  pendingToolNames: () => readonly string[];
  subscribe: (listener: () => void) => () => void;
  /** Settles waiting approvals as stopped and refuses new ones until reopened. */
  close(): void;
  /** React Strict Mode closes and reopens the coordinator of a mounted conversation. */
  open(): void;
}

const stoppedReason = "The destructive edit was stopped before approval.";
const deniedReason = "The user denied this destructive edit.";

/** One ephemeral approval authority. Create once per mounted conversation. */
export const createBrunchMutationApprovalCoordinator =
  (): BrunchMutationApprovalCoordinator => {
    const pending = new Map<string, PendingApproval>();
    const listeners = new Set<() => void>();
    let alwaysAllow = false;
    let closed = false;
    let pendingToolNames: readonly string[] = [];
    const notify = () => {
      const next = [
        ...new Set([...pending.values()].map((approval) => approval.toolName)),
      ];
      if (next.join() !== pendingToolNames.join()) pendingToolNames = next;
      listeners.forEach((listener) => listener());
    };
    const settle = (
      toolCallId: string,
      decision: BrunchMutationApprovalDecision,
    ) => {
      const approval = pending.get(toolCallId);
      if (!approval) return false;
      pending.delete(toolCallId);
      approval.removeAbortListener();
      approval.resolve(decision);
      notify();
      return true;
    };

    return {
      request: ({ toolCallId, toolName, signal }) => {
        if (closed || signal.aborted)
          return Promise.resolve({ decision: "deny", reason: stoppedReason });
        if (alwaysAllow) return Promise.resolve({ decision: "allow" });
        return new Promise((resolve) => {
          const onAbort = () => {
            settle(toolCallId, { decision: "deny", reason: stoppedReason });
          };
          signal.addEventListener("abort", onAbort, { once: true });
          pending.set(toolCallId, {
            toolName,
            resolve,
            removeAbortListener: () =>
              signal.removeEventListener("abort", onAbort),
          });
          notify();
        });
      },
      resolve: (toolCallId, choice) => {
        if (!pending.has(toolCallId) || closed) return false;
        if (choice === "always-allow") alwaysAllow = true;
        return settle(
          toolCallId,
          choice === "deny"
            ? { decision: "deny", reason: deniedReason }
            : { decision: "allow" },
        );
      },
      hasPending: (toolCallId) => pending.has(toolCallId),
      pendingToolNames: () => pendingToolNames,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => {
        closed = true;
        alwaysAllow = false;
        for (const toolCallId of pending.keys())
          settle(toolCallId, { decision: "deny", reason: stoppedReason });
      },
      open: () => {
        closed = false;
      },
    };
  };

const destructiveToolNames = [
  "removePlace",
  "removeTransition",
  "removeArc",
  "removeType",
  "removeTypeElement",
  "removeDifferentialEquation",
  "removeParameter",
  "removeScenario",
  "removeMetric",
  "removeSubnet",
  "removeComponentInstance",
  "deleteItemsByIds",
] as const satisfies readonly PetrinautAiMutationToolName[];

type DestructiveToolName = (typeof destructiveToolNames)[number];

const requiresBrunchMutationApproval = (
  toolName: string,
): toolName is DestructiveToolName =>
  (destructiveToolNames as readonly string[]).includes(toolName);

const spacedWords = (camelCase: string) =>
  camelCase.replace(/[A-Z]/gu, (letter) => ` ${letter.toLowerCase()}`);

const removalDescriptions = (
  toolName: DestructiveToolName,
  input: unknown,
): readonly string[] => {
  switch (toolName) {
    case "removePlace":
      return [
        `Remove place — ${mutationActionInputSchemas.removePlace.parse(input).placeId}`,
      ];
    case "removeTransition":
      return [
        `Remove transition — ${mutationActionInputSchemas.removeTransition.parse(input).transitionId}`,
      ];
    case "removeArc": {
      const { arcDirection, endpoint, placeId, transitionId } =
        mutationActionInputSchemas.removeArc.parse(input);
      const target =
        placeId ??
        (endpoint?.kind === "componentPort"
          ? `${endpoint.componentInstanceId} / ${endpoint.portPlaceId}`
          : endpoint?.placeId);
      return [`Remove ${arcDirection} arc — ${transitionId} ↔ ${target}`];
    }
    case "removeType":
      return [
        `Remove type — ${mutationActionInputSchemas.removeType.parse(input).typeId}`,
      ];
    case "removeTypeElement": {
      const { elementId, typeId } =
        mutationActionInputSchemas.removeTypeElement.parse(input);
      return [`Remove type element — ${typeId} / ${elementId}`];
    }
    case "removeDifferentialEquation":
      return [
        `Remove differential equation — ${mutationActionInputSchemas.removeDifferentialEquation.parse(input).equationId}`,
      ];
    case "removeParameter":
      return [
        `Remove parameter — ${mutationActionInputSchemas.removeParameter.parse(input).parameterId}`,
      ];
    case "removeScenario":
      return [
        `Remove scenario — ${mutationActionInputSchemas.removeScenario.parse(input).scenarioId}`,
      ];
    case "removeMetric":
      return [
        `Remove metric — ${mutationActionInputSchemas.removeMetric.parse(input).metricId}`,
      ];
    case "removeSubnet":
      return [
        `Remove subnet — ${mutationActionInputSchemas.removeSubnet.parse(input).subnetId}`,
      ];
    case "removeComponentInstance":
      return [
        `Remove component instance — ${mutationActionInputSchemas.removeComponentInstance.parse(input).instanceId}`,
      ];
    case "deleteItemsByIds":
      return mutationActionInputSchemas.deleteItemsByIds
        .parse(input)
        .items.map(({ id, type }) => `Remove ${spacedWords(type)} — ${id}`);
  }
};

/** Later calls stay queued behind a waiting approval; a denial settles as not applied. */
export const createBrunchMutationAdmission =
  (approval: BrunchMutationApprovalCoordinator): InBandBrowserCallAdmission =>
  async ({ toolCallId, toolName, input, signal }) => {
    if (!requiresBrunchMutationApproval(toolName)) return { admitted: true };
    // An approval row renders only for inputs its schema accepts.
    mutationActionInputSchemas[toolName].parse(input);
    const decision = await approval.request({ toolCallId, toolName, signal });
    return decision.decision === "allow"
      ? { admitted: true }
      : {
          admitted: false,
          output: { applied: false, reason: decision.reason },
        };
  };

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
});
const actionsStyle = css({ display: "flex", gap: "2", flexWrap: "wrap" });

type WidgetProps = PetrinautAiInteractiveToolWidgetProps<unknown, unknown>;

const settledText = (output: unknown): string => {
  if (typeof output !== "object" || output === null)
    return "Model edits completed.";
  if ("reason" in output && typeof output.reason === "string")
    return output.reason;
  if ("title" in output && typeof output.title === "string")
    return output.title;
  return "Model edits completed.";
};

export const createBrunchMutationApprovalWidget = (
  coordinator: BrunchMutationApprovalCoordinator,
  toolName: DestructiveToolName,
) => {
  const Widget = ({
    input,
    toolCallId,
    state,
    submittedOutput,
  }: WidgetProps) => {
    const pending = useSyncExternalStore(
      coordinator.subscribe,
      () => coordinator.hasPending(toolCallId),
      () => false,
    );
    if (state === "submitted") return <p>{settledText(submittedOutput)}</p>;
    if (!pending) return null;
    return (
      <section
        className={containerStyle}
        aria-label="Approve destructive edits"
      >
        <strong>Allow these destructive edits?</strong>
        <ul
          className={css({
            paddingLeft: "4",
            listStyleType: "disc",
            fontSize: "sm",
          })}
        >
          {removalDescriptions(toolName, input).map((description) => (
            <li key={description}>{description}</li>
          ))}
        </ul>
        <p className={css({ fontSize: "xs", color: "neutral.s90" })}>
          Associated arcs or references may also be removed. Always allow
          applies to destructive edits in this conversation only, until you
          leave or reload.
        </p>
        <div className={actionsStyle}>
          <Button
            size="xs"
            tone="brand"
            type="button"
            onClick={() => coordinator.resolve(toolCallId, "allow")}
          >
            Allow
          </Button>
          <Button
            size="xs"
            variant="subtle"
            type="button"
            onClick={() => coordinator.resolve(toolCallId, "always-allow")}
          >
            Always allow
          </Button>
          <Button
            size="xs"
            variant="ghost"
            type="button"
            className={css({ marginLeft: "auto" })}
            onClick={() => coordinator.resolve(toolCallId, "deny")}
          >
            Deny
          </Button>
        </div>
      </section>
    );
  };
  return Widget;
};

const passthrough = { parse: (value: unknown) => value };

export const createBrunchMutationApprovalInteractiveTools = (
  coordinator: BrunchMutationApprovalCoordinator,
): readonly PetrinautAiInteractiveTool[] =>
  destructiveToolNames.map((toolName) =>
    definePetrinautAiInteractiveTool<unknown, unknown>({
      toolName,
      inputSchema: {
        parse: (value) => mutationActionInputSchemas[toolName].parse(value),
      },
      outputSchema: passthrough,
      // Earlier rows of the same tool keep their normal presentation.
      shouldHandle: (_input, { toolCallId }) =>
        coordinator.hasPending(toolCallId),
      component: createBrunchMutationApprovalWidget(coordinator, toolName),
    }),
  );
