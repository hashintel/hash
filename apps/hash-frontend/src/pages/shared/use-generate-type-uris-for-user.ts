import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { generateBaseTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { versionedUriFromComponents } from "@local/hash-subgraph/shared/type-system-patch";
import { useCallback, useContext } from "react";

import { WorkspaceContext } from "./workspace-context";

export const useGenerateTypeUrisForUser = () => {
  const { activeWorkspace } = useContext(WorkspaceContext);

  return useCallback(
    ({
      kind,
      title,
      version,
    }: {
      kind: "entity-type" | "property-type";
      title: string;
      version: number;
    }) => {
      if (!activeWorkspace?.shortname) {
        throw new Error("No valid active workspace");
      }

      const baseUri = generateBaseTypeId({
        domain: frontendUrl,
        namespace: activeWorkspace.shortname,
        kind,
        title,
      });

      const versionedUri = versionedUriFromComponents(baseUri, version);

      return {
        baseUri,
        versionedUri,
      };
    },
    [activeWorkspace],
  );
};
