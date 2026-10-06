import { useSyncExternalStore } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  mutationActionInputSchemas,
  parseArcId,
  type PetrinautAiMutationToolName,
  type PetrinautDocHandle,
  type SDCPN,
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
  /**
   * A refused call keeps its streamed input-available state until the refusal
   * output round-trips, so its part alone cannot tell it from an executing call.
   */
  approvalState(toolCallId: string): "awaiting" | "refused" | null;
  /** Changes whenever a call enters or leaves the approval gate. */
  getVersion: () => number;
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
    const refused = new Set<string>();
    const listeners = new Set<() => void>();
    let alwaysAllow = false;
    let closed = false;
    let version = 0;
    const notify = () => {
      version += 1;
      listeners.forEach((listener) => listener());
    };
    const settle = (
      toolCallId: string,
      decision: BrunchMutationApprovalDecision,
    ) => {
      const approval = pending.get(toolCallId);
      if (!approval) return false;
      pending.delete(toolCallId);
      if (decision.decision === "deny") refused.add(toolCallId);
      approval.removeAbortListener();
      approval.resolve(decision);
      notify();
      return true;
    };

    return {
      request: ({ toolCallId, signal }) => {
        if (closed || signal.aborted) {
          refused.add(toolCallId);
          return Promise.resolve({ decision: "deny", reason: stoppedReason });
        }
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
      approvalState: (toolCallId) =>
        pending.has(toolCallId)
          ? "awaiting"
          : refused.has(toolCallId)
            ? "refused"
            : null,
      getVersion: () => version,
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

type NamedItem = { readonly id: string; readonly name: string };

type NetItems = Pick<
  SDCPN,
  | "places"
  | "transitions"
  | "types"
  | "differentialEquations"
  | "parameters"
  | "componentInstances"
>;

const namedNetItemsOf = (net: NetItems): NamedItem[] => [
  ...net.places,
  ...net.transitions,
  ...net.types,
  ...net.types.flatMap(({ elements }) =>
    elements.map(({ elementId, name }) => ({ id: elementId, name })),
  ),
  ...net.differentialEquations,
  ...net.parameters,
  ...(net.componentInstances ?? []),
];

/** The document's named items, subnets included. Ids are UUIDs, so names describe removals. */
const namedItemsOf = (definition: SDCPN): NamedItem[] => [
  ...namedNetItemsOf(definition),
  ...(definition.scenarios ?? []),
  ...(definition.metrics ?? []),
  ...(definition.subnets ?? []).flatMap((subnet) => [
    subnet,
    ...namedNetItemsOf(subnet),
  ]),
];

/** Looks up an item's name, falling back to its id when the item is unnamed or gone. */
const nameLookupOf = (
  definition: SDCPN | undefined,
): ((id: string) => string) => {
  const namesById = new Map(
    (definition ? namedItemsOf(definition) : []).map(({ id, name }) => [
      id,
      name,
    ]),
  );
  return (id) => namesById.get(id) || id;
};

const describeItem = (
  type: string,
  id: string,
  nameOf: (id: string) => string,
): string => {
  const arc = type === "arc" ? parseArcId(id) : null;
  return arc ? `${nameOf(arc.sourceId)} → ${nameOf(arc.targetId)}` : nameOf(id);
};

const removalDescriptions = (
  toolName: DestructiveToolName,
  input: unknown,
  nameOf: (id: string) => string,
): readonly string[] => {
  switch (toolName) {
    case "removePlace":
      return [
        `Remove place — ${nameOf(mutationActionInputSchemas.removePlace.parse(input).placeId)}`,
      ];
    case "removeTransition":
      return [
        `Remove transition — ${nameOf(mutationActionInputSchemas.removeTransition.parse(input).transitionId)}`,
      ];
    case "removeArc": {
      const { arcDirection, endpoint, placeId, transitionId } =
        mutationActionInputSchemas.removeArc.parse(input);
      const target =
        placeId !== undefined
          ? nameOf(placeId)
          : endpoint?.kind === "componentPort"
            ? `${nameOf(endpoint.componentInstanceId)} / ${nameOf(endpoint.portPlaceId)}`
            : endpoint && nameOf(endpoint.placeId);
      return [
        `Remove ${arcDirection} arc — ${nameOf(transitionId)} ↔ ${target}`,
      ];
    }
    case "removeType":
      return [
        `Remove type — ${nameOf(mutationActionInputSchemas.removeType.parse(input).typeId)}`,
      ];
    case "removeTypeElement": {
      const { elementId, typeId } =
        mutationActionInputSchemas.removeTypeElement.parse(input);
      return [`Remove type element — ${nameOf(typeId)} / ${nameOf(elementId)}`];
    }
    case "removeDifferentialEquation":
      return [
        `Remove differential equation — ${nameOf(mutationActionInputSchemas.removeDifferentialEquation.parse(input).equationId)}`,
      ];
    case "removeParameter":
      return [
        `Remove parameter — ${nameOf(mutationActionInputSchemas.removeParameter.parse(input).parameterId)}`,
      ];
    case "removeScenario":
      return [
        `Remove scenario — ${nameOf(mutationActionInputSchemas.removeScenario.parse(input).scenarioId)}`,
      ];
    case "removeMetric":
      return [
        `Remove metric — ${nameOf(mutationActionInputSchemas.removeMetric.parse(input).metricId)}`,
      ];
    case "removeSubnet":
      return [
        `Remove subnet — ${nameOf(mutationActionInputSchemas.removeSubnet.parse(input).subnetId)}`,
      ];
    case "removeComponentInstance":
      return [
        `Remove component instance — ${nameOf(mutationActionInputSchemas.removeComponentInstance.parse(input).instanceId)}`,
      ];
    case "deleteItemsByIds":
      return mutationActionInputSchemas.deleteItemsByIds
        .parse(input)
        .items.map(
          ({ id, type }) =>
            `Remove ${spacedWords(type)} — ${describeItem(type, id, nameOf)}`,
        );
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

const noDocumentSubscription = () => () => {};

/** `handle` is the document the calls edit; its names describe each removal. */
export const createBrunchMutationApprovalWidget = (
  coordinator: BrunchMutationApprovalCoordinator,
  toolName: DestructiveToolName,
  handle: PetrinautDocHandle | null,
) => {
  const subscribe = handle
    ? (listener: () => void) => handle.subscribe(listener)
    : noDocumentSubscription;
  const readDefinition = () => handle?.doc();
  const Widget = ({ input, toolCallId }: WidgetProps) => {
    const definition = useSyncExternalStore(subscribe, readDefinition);
    const nameOf = nameLookupOf(definition);
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
          {removalDescriptions(toolName, input, nameOf).map((description) => (
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
  handle: PetrinautDocHandle | null,
): readonly PetrinautAiInteractiveTool[] =>
  destructiveToolNames.map((toolName) =>
    definePetrinautAiInteractiveTool<unknown, unknown>({
      toolName,
      inputSchema: {
        parse: (value) => mutationActionInputSchemas[toolName].parse(value),
      },
      outputSchema: passthrough,
      // Earlier rows of the same tool keep their normal presentation.
      shouldHandle: ({ toolCallId }) => coordinator.hasPending(toolCallId),
      component: createBrunchMutationApprovalWidget(
        coordinator,
        toolName,
        handle,
      ),
    }),
  );
