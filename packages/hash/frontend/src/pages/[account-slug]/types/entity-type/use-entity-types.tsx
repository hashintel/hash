import { EntityType, VersionedUri } from "@blockprotocol/type-system";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";

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

  useEffect(() => {
    const fetch = async () => {
      if (typeSystemLoading) {
        return;
      }
      await aggregateEntityTypes({ data: {} }).then(({ data: subgraph }) => {
        if (subgraph) {
          setEntityTypes(
            Object.fromEntries(
              getRoots(subgraph).map((entityType) => {
                return [entityType.schema.$id, entityType.schema];
              }),
            ),
          );
        }
      });
    };

    void fetch();
  }, [aggregateEntityTypes, typeSystemLoading]);

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
