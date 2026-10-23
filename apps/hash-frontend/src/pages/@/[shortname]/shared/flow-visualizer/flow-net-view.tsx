import { Box, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { compileFlowDefinition } from "@local/flow-petri-net/compile-flow-definition";

import { flowSectionBorderRadius } from "./shared/styles";

import type { SDCPN } from "@hashintel/petrinaut";
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

/**
 * A flow as its compiled Petri net, read-only. It fills the space it's given.
 */
export const FlowNetView = ({
  flowDefinition,
}: {
  flowDefinition: FlowDefinition<FlowActionDefinitionId>;
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
        <PetrinautPreview
          definition={compiledNet.net}
          title={flowDefinition.name}
        />
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
