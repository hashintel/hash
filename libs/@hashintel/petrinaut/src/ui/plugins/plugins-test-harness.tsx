import { render, type RenderOptions } from "@testing-library/react";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Petrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautProvider } from "../../react/petrinaut-provider";
import { PetrinautPluginsProvider } from "./plugins-provider";

import type { NetManagement } from "../../react/net-management-context";
import type { PetrinautPlugin } from "./define-petrinaut-plugin";
import type { ComponentType, ReactNode } from "react";

class WorkerStub extends EventTarget {
  onerror = null;
  onmessage = null;
  onmessageerror = null;

  postMessage() {}
  terminate() {}
}

// Not `vi.stubGlobal`, which a test's `unstubAllGlobals` would undo: the
// language server starts its worker after an async import, past the test.
globalThis.Worker = WorkerStub as unknown as typeof Worker;

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const Passthrough = ({ children }: { children: ReactNode }) => children;

/**
 * Renders `view` as the editor view beside `plugins`, under the editor's
 * providers over a new document; `Around` wraps the plugins provider inside
 * them. `rerender` keeps the core instance unless given another.
 */
export const renderPlugins = (
  plugins: readonly PetrinautPlugin[],
  view: ReactNode,
  {
    netManagement,
    Around = Passthrough,
    ...options
  }: RenderOptions & {
    netManagement?: Partial<NetManagement>;
    Around?: ComponentType<{ children: ReactNode }>;
  } = {},
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({ initial: emptyNet }),
  });
  const tree = (
    nextPlugins: readonly PetrinautPlugin[],
    nextView: ReactNode,
    nextInstance: Petrinaut,
  ) => (
    <PetrinautProvider
      instance={nextInstance}
      netManagement={{
        title: "Net",
        existingNets: [],
        createNewNet: () => {},
        loadPetriNet: () => {},
        ...netManagement,
      }}
    >
      <Around>
        <PetrinautPluginsProvider plugins={nextPlugins}>
          {nextView}
        </PetrinautPluginsProvider>
      </Around>
    </PetrinautProvider>
  );
  const result = render(tree(plugins, view, instance), options);

  return {
    ...result,
    instance,
    rerender: (
      nextPlugins = plugins,
      nextView = view,
      nextInstance = instance,
    ) => result.rerender(tree(nextPlugins, nextView, nextInstance)),
  };
};
