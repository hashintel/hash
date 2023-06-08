import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { generateBaseTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";
import { useCallback, useContext } from "react";

import { WorkspaceContext } from "./workspace-context";

export const useGenerateTypeUrlsForUser = () => {
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

      const baseUrl = generateBaseTypeId({
        domain: frontendUrl,
        namespace: activeWorkspace.shortname,
        kind,
        title,
      });

      const versionedUrl = versionedUrlFromComponents(baseUrl, version);

      return {
        baseUrl,
        versionedUrl,
      };
    },
    [activeWorkspace],
  );
};
