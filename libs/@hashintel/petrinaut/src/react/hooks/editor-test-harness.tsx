import { use, type ReactNode } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  createJsonDocHandle,
  createPetrinaut,
  type Petrinaut,
  type PetrinautRules,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../document/instance-context";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../document/sdcpn-context";
import {
  SimulationContext,
  type SimulationState,
  DEFAULT_SIMULATION_CONTEXT,
} from "../simulation/context";
import { EditorContext } from "../state/editor-context";

export const emptySdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/** The editor's default state, in the given mode. */
const EditorInMode = ({
  globalMode,
  children,
}: {
  globalMode: "edit" | "simulate";
  children: ReactNode;
}) => (
  <EditorContext value={{ ...use(EditorContext), globalMode }}>
    {children}
  </EditorContext>
);

export type WrapperOptions = {
  sdcpn?: SDCPN;
  readonly?: boolean;
  rules?: PetrinautRules;
  globalMode?: "edit" | "simulate";
  simulationState?: SimulationState;
};

/**
 * An instance over a document, and a wrapper that gives a hook under test the
 * instance, the net, a simulation in the given state and the editor in the
 * given mode.
 */
export const createWrapper = (options: WrapperOptions = {}) => {
  const {
    sdcpn: initialSdcpn = emptySdcpn,
    readonly = false,
    rules,
    globalMode = "edit",
    simulationState = "NotRun",
  } = options;

  const instance: Petrinaut = createPetrinaut({
    document: createJsonDocHandle({ initial: structuredClone(initialSdcpn) }),
    rules,
  });

  const sdcpnContextValue: SDCPNContextValue = {
    petriNetId: "test-net",
    petriNetDefinition: instance.definition.get(),
    readonly,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    getItemType: () => null,
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PetrinautInstanceContext value={instance}>
      <SDCPNContext value={sdcpnContextValue}>
        <SimulationContext
          value={{ ...DEFAULT_SIMULATION_CONTEXT, state: simulationState }}
        >
          <EditorInMode globalMode={globalMode}>{children}</EditorInMode>
        </SimulationContext>
      </SDCPNContext>
    </PetrinautInstanceContext>
  );

  return { Wrapper, instance };
};
