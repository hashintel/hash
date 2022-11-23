import { EntityType, VersionedUri } from "@blockprotocol/type-system-web";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { getPersistedEntityType } from "../../../../lib/subgraph";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";
import { mustBeVersionedUri } from "./util";

type EntityTypesContextValues = {
  types: Record<VersionedUri, EntityType> | null;
};

const EntityTypesContext = createContext<null | EntityTypesContextValues>(null);

export const EntityTypesContextProvider = ({ children }: PropsWithChildren) => {
  const typeSystemLoading = useInitTypeSystem();
  const [entityTypes, setEntityTypes] = useState<
    EntityTypesContextValues["types"] | null
  >(null);
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  const fetch = useCallback(async () => {
    if (typeSystemLoading) {
      return;
    }
    await aggregateEntityTypes({ data: {} }).then(({ data: subgraph }) => {
      // @todo error handling
      if (subgraph) {
        setEntityTypes(
          Object.fromEntries(
            subgraph.roots.map((entityTypeId) => {
              const entityType = getPersistedEntityType(subgraph, entityTypeId);

              if (!entityType) {
                throw new Error(
                  "entity type was missing from the subgraph vertices list",
                );
              }

              return [mustBeVersionedUri(entityTypeId), entityType.inner];
            }),
          ),
        );
      }
    });
  }, [aggregateEntityTypes, typeSystemLoading]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const state = useMemo(() => ({ types: entityTypes }), [entityTypes]);

  return (
    <EntityTypesContext.Provider value={state}>
      {children}
    </EntityTypesContext.Provider>
  );
};

export const useEntityTypes = () => {
  return useContext(EntityTypesContext)?.types;
};
