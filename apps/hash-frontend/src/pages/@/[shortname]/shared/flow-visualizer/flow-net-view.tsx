import { Box, Stack, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { compileFlowDefinition } from "@local/flow-petri-net/compile-flow-definition";
import {
  replayFlowRunEvents,
  toRootNetActualModeExecution,
} from "@local/flow-petri-net/replay-flow-run-events";

import { useFlowRunEvents } from "../../../../shared/use-flow-run-events";
import { flowSectionBorderRadius } from "./shared/styles";

import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";
import type { PetrinautPreviewProps } from "@hashintel/petrinaut/preview";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

const Message = ({ children }: { children: ReactNode }) => (
  <Box
    sx={{
      alignItems: "center",
      display: "flex",
      height: "100%",
      justifyContent: "center",
      p: 3,
    }}
  >
    <Typography
      variant="smallTextParagraphs"
      sx={{ color: ({ palette }) => palette.gray[60] }}
    >
      {children}
    </Typography>
  </Box>
);

const PetrinautPreview = dynamic(
  () =>
    import("./flow-net-view/petrinaut-preview").then(
      (mod) => mod.PetrinautPreview,
    ),
  { ssr: false, loading: () => <Message>Loading Petrinaut…</Message> },
);

/**
 * Nets compiled so far, by the definition they were compiled from. A definition is loaded once per edition, so
 * switching between the step graph and the net doesn't compile it again.
 */
const compiledNets = new WeakMap<
  FlowDefinition<FlowActionDefinitionId>,
  Promise<SDCPN>
>();

const compileFlowNet = (
  flowDefinition: FlowDefinition<FlowActionDefinitionId>,
) => {
  let compiledNet = compiledNets.get(flowDefinition);

  if (!compiledNet) {
    compiledNet = compileFlowDefinition(flowDefinition);
    compiledNets.set(flowDefinition, compiledNet);
  }

  return compiledNet;
};

type CompiledNet =
  | { status: "compiling" }
  | { status: "compiled"; net: SDCPN }
  | { status: "failed"; message: string };

/**
 * The net compiled from a flow definition. Compiling lays the net out, so it finishes after the first render.
 */
const useCompiledFlowNet = (
  flowDefinition: FlowDefinition<FlowActionDefinitionId>,
): CompiledNet => {
  const [compiled, setCompiled] = useState<{
    flowDefinition: FlowDefinition<FlowActionDefinitionId>;
    result: CompiledNet;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    compileFlowNet(flowDefinition).then(
      (net) => {
        if (!cancelled) {
          setCompiled({ flowDefinition, result: { status: "compiled", net } });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setCompiled({
            flowDefinition,
            result: {
              status: "failed",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [flowDefinition]);

  return compiled?.flowDefinition === flowDefinition
    ? compiled.result
    : { status: "compiling" };
};

export type FlowNetViewRun = {
  flowRunEntityId: EntityId;
  name: string;
  /** Whether the run is still going, so new events may come. */
  live: boolean;
};

/**
 * A run's tokens on its flow's net, replayed from the run's events in Petrinaut's Actual mode. Only the root net's
 * tokens are shown: Actual mode can't yet tell apart the places inside each step's instance of its action's subnet.
 */
const FlowRunNetPreview = ({
  net,
  flowRun,
  documentId,
  title,
}: {
  net: SDCPN;
  flowRun: FlowNetViewRun;
  documentId: EntityId;
  title: string;
}) => {
  const { flowRunEntityId, name, live } = flowRun;
  const flowRunEvents = useFlowRunEvents({ flowRunEntityId, live });

  const events =
    flowRunEvents.status === "loaded" ? flowRunEvents.events : null;

  const replay = useMemo(
    () => (events ? replayFlowRunEvents(net, events) : null),
    [events, net],
  );

  const actualMode = useMemo((): NonNullable<
    PetrinautPreviewProps["actualMode"]
  > => {
    const source = { id: flowRunEntityId, label: name };

    if (flowRunEvents.status !== "loaded" || !replay) {
      return {
        available: true,
        source,
        status: flowRunEvents.status === "failed" ? "error" : "loading",
        title: name,
        definition: net,
        initialState: null,
        transitionFirings: [],
        timelineStartedAtMs: null,
        timelineNowMs: null,
        error: flowRunEvents.status === "failed" ? flowRunEvents.message : null,
      };
    }

    const { initialState, transitionFirings } =
      toRootNetActualModeExecution(replay);
    const runStarted = flowRunEvents.events.find(
      ({ kind }) => kind === "runStarted",
    );

    return {
      available: true,
      /* A reset run starts a new timeline. */
      source: { ...source, id: `${source.id}/${flowRunEvents.runId}` },
      status: live ? "streaming" : "complete",
      title: name,
      definition: net,
      initialState,
      transitionFirings,
      timelineStartedAtMs: runStarted
        ? Date.parse(runStarted.occurredAt)
        : null,
      timelineNowMs: null,
      error: null,
    };
  }, [flowRunEntityId, flowRunEvents, live, name, net, replay]);

  return (
    <Stack sx={{ height: "100%" }}>
      {flowRunEvents.status === "failed" ? (
        <Message>
          This run's events can't be loaded ({flowRunEvents.message}). Trying
          again…
        </Message>
      ) : (
        <>
          {replay && replay.problems.length > 0 ? (
            <Typography
              variant="smallTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[60], px: 2, py: 1 }}
            >
              The net can't follow {replay.problems.length} of this run's
              events, so it may not show where everything is.
            </Typography>
          ) : null}
          {flowRunEvents.status === "loaded" && flowRunEvents.checkFailure ? (
            <Typography
              variant="smallTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[60], px: 2, py: 1 }}
            >
              Can't check for this run's new events (
              {flowRunEvents.checkFailure}), so the net may be out of date.
              Trying again…
            </Typography>
          ) : null}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <PetrinautPreview
              actualMode={actualMode}
              definition={net}
              documentId={documentId}
              title={title}
            />
          </Box>
        </>
      )}
    </Stack>
  );
};

/**
 * A flow as its compiled Petri net, read-only, with a run's tokens on it if given one. It fills the space it's given.
 */
export const FlowNetView = ({
  flowDefinition,
  flowDefinitionEntityId,
  flowRun,
}: {
  flowDefinition: FlowDefinition<FlowActionDefinitionId>;
  /** Keys the viewport Petrinaut saves, so each flow opens at its own pan and zoom. */
  flowDefinitionEntityId: EntityId;
  flowRun?: FlowNetViewRun;
}) => {
  const compiledNet = useCompiledFlowNet(flowDefinition);

  return (
    <Box
      sx={{
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[30]}`,
        borderRadius: flowSectionBorderRadius,
        height: "100%",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {compiledNet.status === "compiled" ? (
        flowRun ? (
          <FlowRunNetPreview
            net={compiledNet.net}
            flowRun={flowRun}
            documentId={flowDefinitionEntityId}
            title={flowDefinition.name}
          />
        ) : (
          <PetrinautPreview
            definition={compiledNet.net}
            documentId={flowDefinitionEntityId}
            title={flowDefinition.name}
          />
        )
      ) : compiledNet.status === "failed" ? (
        <Message>
          This flow can't be compiled to a Petri net: {compiledNet.message}
        </Message>
      ) : (
        <Message>Compiling the flow…</Message>
      )}
    </Box>
  );
};
