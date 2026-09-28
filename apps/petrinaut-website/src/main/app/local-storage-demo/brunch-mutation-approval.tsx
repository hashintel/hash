import { useSyncExternalStore } from "react";

import {
  mutatePetrinetInputSchema,
  mutatePetrinetOutputSchema,
  mutatePetrinautNetToolName,
  type MutatePetrinetInput,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  definePetrinautAiInteractiveTool,
  type PetrinautAiInteractiveToolWidgetProps,
} from "@hashintel/petrinaut/ui";

export type BrunchMutationApprovalChoice = "allow" | "always-allow" | "deny";

export type BrunchMutationApprovalDecision =
  | { readonly decision: "allow" }
  | { readonly decision: "deny"; readonly reason: string };

type PendingApproval = {
  readonly resolve: (decision: BrunchMutationApprovalDecision) => void;
  readonly removeAbortListener: () => void;
};

export interface BrunchMutationApprovalCoordinator {
  request(params: {
    readonly toolCallId: string;
    readonly input: unknown;
    readonly signal: AbortSignal;
  }): Promise<BrunchMutationApprovalDecision>;
  resolve(toolCallId: string, choice: BrunchMutationApprovalChoice): boolean;
  hasPending(toolCallId: string): boolean;
  subscribe: (listener: () => void) => () => void;
  dispose(): void;
}

const stoppedReason = "The mutation request was stopped before approval.";
const deniedReason = "The user denied this destructive mutation batch.";

/** One ephemeral approval authority. Create once per mounted conversation. */
export const createBrunchMutationApprovalCoordinator =
  (): BrunchMutationApprovalCoordinator => {
    const pending = new Map<string, PendingApproval>();
    const listeners = new Set<() => void>();
    let alwaysAllow = false;
    let disposed = false;
    const notify = () => listeners.forEach((listener) => listener());
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
      request: ({ toolCallId, input, signal }) => {
        mutatePetrinetInputSchema.parse(input);
        if (disposed || signal.aborted)
          return Promise.resolve({ decision: "deny", reason: stoppedReason });
        if (alwaysAllow) return Promise.resolve({ decision: "allow" });
        return new Promise((resolve) => {
          const onAbort = () => {
            settle(toolCallId, { decision: "deny", reason: stoppedReason });
          };
          signal.addEventListener("abort", onAbort, { once: true });
          pending.set(toolCallId, {
            resolve,
            removeAbortListener: () =>
              signal.removeEventListener("abort", onAbort),
          });
          notify();
        });
      },
      resolve: (toolCallId, choice) => {
        if (!pending.has(toolCallId) || disposed) return false;
        if (choice === "always-allow") alwaysAllow = true;
        return settle(
          toolCallId,
          choice === "deny"
            ? { decision: "deny", reason: deniedReason }
            : { decision: "allow" },
        );
      },
      hasPending: (toolCallId) => pending.has(toolCallId),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose: () => {
        disposed = true;
        alwaysAllow = false;
        for (const toolCallId of pending.keys())
          settle(toolCallId, { decision: "deny", reason: stoppedReason });
      },
    };
  };

const destructiveOperations = (input: MutatePetrinetInput) =>
  input.operations.filter(({ type }) => type.startsWith("remove"));

export const requiresBrunchMutationApproval = (input: unknown): boolean =>
  destructiveOperations(mutatePetrinetInputSchema.parse(input)).length > 0;

const operationDescription = (
  operation: MutatePetrinetInput["operations"][number],
): string => {
  const values = operation.input as Record<string, unknown>;
  switch (operation.type) {
    case "removePlace":
      return `Remove place — ${String(values.placeId)}`;
    case "removeTransition":
      return `Remove transition — ${String(values.transitionId)}`;
    case "removeArc":
      return `Remove ${String(values.arcDirection)} arc — ${String(values.transitionId)} ↔ ${String(values.placeId)}`;
    case "removeType":
      return `Remove type — ${String(values.typeId)}`;
    case "removeTypeElement":
      return `Remove type element — ${String(values.typeId)} / ${String(values.elementId)}`;
    case "removeParameter":
      return `Remove parameter — ${String(values.parameterId)}`;
    case "removeDifferentialEquation":
      return `Remove differential equation — ${String(values.differentialEquationId)}`;
    case "removeScenario":
      return `Remove scenario — ${String(values.scenarioId)}`;
    case "removeMetric":
      return `Remove metric — ${String(values.metricId)}`;
    default:
      return operation.operationId;
  }
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

type WidgetProps = PetrinautAiInteractiveToolWidgetProps<
  MutatePetrinetInput,
  unknown
>;

const createWidget = (coordinator: BrunchMutationApprovalCoordinator) => {
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
    if (state === "submitted") {
      const output = mutatePetrinetOutputSchema.parse(submittedOutput);
      const failure = output.outcomes.find(
        (outcome) =>
          outcome.status === "failed" || outcome.status === "unknown",
      );
      return <p>{failure?.error ?? "Model edits completed."}</p>;
    }
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
          {destructiveOperations(input).map((operation) => (
            <li key={operation.operationId}>
              {operationDescription(operation)}
            </li>
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

export const createBrunchMutationApprovalInteractiveTool = (
  coordinator: BrunchMutationApprovalCoordinator,
) => {
  const Widget = createWidget(coordinator);
  return {
    Widget,
    interactiveTool: definePetrinautAiInteractiveTool({
      toolName: mutatePetrinautNetToolName,
      inputSchema: mutatePetrinetInputSchema,
      outputSchema: mutatePetrinetOutputSchema,
      shouldHandle: requiresBrunchMutationApproval,
      component: Widget,
    }),
  };
};
