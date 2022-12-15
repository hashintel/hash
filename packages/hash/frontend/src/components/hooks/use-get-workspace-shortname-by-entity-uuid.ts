import { extractBaseUri } from "@blockprotocol/type-system";
import { systemUserShortname } from "@hashintel/hash-shared/environment";
import { types } from "@hashintel/hash-shared/ontology-types";
import { entityIdFromOwnedByIdAndEntityUuid } from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { useEffect, useMemo, useState } from "react";
import { useBlockProtocolGetEntity } from "./blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useWorkspaceByShortname } from "./use-get-workspace-by-shortname";

export const useWorkspaceShortnameByEntityUuid = (params: {
  entityUuid: string;
}): { workspaceShortname?: string; loading: boolean } => {
  const { entityUuid } = params;

  const [workspaceShortname, setWorkspaceShortname] = useState<string>();
  const [loading, setLoading] = useState<boolean>(false);

  const { getEntity } = useBlockProtocolGetEntity();

  const {
    workspace: systemUserWorkspace,
    loading: loadingSystemUserWorkspace,
  } = useWorkspaceByShortname(systemUserShortname);

  const systemUserOwnedById = useMemo(
    () => systemUserWorkspace?.accountId,
    [systemUserWorkspace],
  );

  useEffect(() => {
    if (systemUserOwnedById) {
      void (async () => {
        setLoading(true);

        const entityId = entityIdFromOwnedByIdAndEntityUuid(
          systemUserOwnedById,
          entityUuid,
        );

        const { data: subgraph } = await getEntity({
          data: { entityId },
        });

        if (!subgraph) {
          throw new Error(
            `Could not get workspace entity with entity ID "${entityId}"`,
          );
        }

        const entity = getRootsAsEntities(subgraph)[0]!;

        const shortname =
          entity.properties[
            extractBaseUri(types.propertyType.shortName.propertyTypeId)
          ];

        if (!shortname) {
          throw Error(
            `Could not get shortname of workspace with entityUuid "${entityUuid}"`,
          );
        }

        setWorkspaceShortname(shortname as string);
        setLoading(false);
      })();
    }
  }, [entityUuid, getEntity, systemUserOwnedById]);

  return { workspaceShortname, loading: loadingSystemUserWorkspace || loading };
};
