import { render, type RenderOptions } from "@testing-library/react";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Petrinaut,
  type PetrinautRules,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautProvider } from "../../react/petrinaut-provider";
import "../../testing/worker-stub";
import { PetrinautPluginsProvider } from "./plugins-provider";

import type { PetrinautNavigationController } from "../../react/navigation/navigation";
import type { NetManagement } from "../../react/net-management-context";
import type { PetrinautPlugin } from "./define-petrinaut-plugin";
import type { ComponentType, ReactNode } from "react";

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
 * providers over a new document, read-only with `readonly` and held to the
 * host's `rules`; `Around` wraps the plugins provider inside them, and
 * `navigation` makes the host own navigation. `rerender` keeps the core
 * instance unless given another.
 */
export const renderPlugins = (
  plugins: readonly PetrinautPlugin[],
  view: ReactNode,
  {
    netManagement,
    navigation,
    readonly = false,
    rules,
    Around = Passthrough,
    ...options
  }: RenderOptions & {
    netManagement?: Partial<NetManagement>;
    navigation?: PetrinautNavigationController;
    readonly?: boolean;
    rules?: PetrinautRules;
    Around?: ComponentType<{ children: ReactNode }>;
  } = {},
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({ initial: emptyNet }),
    readonly,
    rules,
  });
  const tree = (
    nextPlugins: readonly PetrinautPlugin[],
    nextView: ReactNode,
    nextInstance: Petrinaut,
  ) => (
    <PetrinautProvider
      instance={nextInstance}
      navigation={navigation}
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
