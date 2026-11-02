/**
 * Copies a library component into the document the first time it is used:
 * the subnet a component becomes has the same id in every document, so a
 * second use finds the copy already there.
 */

import { use } from "react";

import {
  instantiateLibraryComponent,
  libraryComponentSubnetId,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../react/hooks/use-petrinaut-mutations";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { usePluginComponentLibraries } from "./plugins-provider";

import type { Subnet } from "@hashintel/petrinaut-core";

export type LibraryComponentRef = {
  libraryId: string;
  componentId: string;
};

/**
 * Returns a function that ensures the document holds the subnet for a
 * library component, adding it when it does not, and returns that subnet,
 * or `null` when no running plugin offers the component.
 */
export const useEnsureLibraryComponent = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const libraries = usePluginComponentLibraries();
  const { addSubnet } = usePetrinautMutations();

  return ({ libraryId, componentId }: LibraryComponentRef): Subnet | null => {
    const subnetId = libraryComponentSubnetId(libraryId, componentId);
    const existing = (petriNetDefinition.subnets ?? []).find(
      ({ id }) => id === subnetId,
    );
    if (existing) {
      return existing;
    }
    const component = libraries
      .find(({ id }) => id === libraryId)
      ?.components.find(({ id }) => id === componentId);
    if (component === undefined) {
      return null;
    }
    const subnet = instantiateLibraryComponent(libraryId, component);
    addSubnet(subnet);
    return subnet;
  };
};
