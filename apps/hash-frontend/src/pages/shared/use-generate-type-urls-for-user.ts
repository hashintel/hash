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
        domain:
          // To be replaced by 'frontendUrl' in H-1172: Temporary provision until https://app.hash.ai migrated to https://hash.ai
          frontendUrl === "https://app.hash.ai"
            ? "https://hash.ai"
            : frontendUrl,
        kind,
        title,
        webShortname: activeWorkspace.shortname,
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
