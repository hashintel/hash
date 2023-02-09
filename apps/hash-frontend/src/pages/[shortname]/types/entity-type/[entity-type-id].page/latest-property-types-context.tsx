import { PropertyType } from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { SubgraphRootTypes } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useBlockProtocolAggregatePropertyTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-property-types";

export type LatestPropertyTypesContextValues = {
  propertyTypes: Record<VersionedUri, PropertyType> | null;
  refetch: () => Promise<void>;
};

export const LatestPropertyTypesContext =
  createContext<null | LatestPropertyTypesContextValues>(null);

export const useLatestPropertyTypes = () => {
  return useContext(LatestPropertyTypesContext)?.propertyTypes;
};

export const usePropertyTypesContextRequired = () => {
  const context = useContext(LatestPropertyTypesContext);

  if (!context) {
    throw new Error("Context missing");
  }

  return context;
};

export const useFetchLatestPropertyTypes = () => {
  return usePropertyTypesContextRequired().refetch;
};

export const useLatestPropertyTypesContextValue = () => {
  const [propertyTypes, setPropertyTypes] = useState<
    LatestPropertyTypesContextValues["propertyTypes"] | null
  >(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  const fetch = useCallback(async () => {
    await aggregatePropertyTypes({ data: {} }).then(
      ({ data: propertyTypesSubgraph }) => {
        if (propertyTypesSubgraph) {
          setPropertyTypes((existingPropertyTypes) => ({
            ...(existingPropertyTypes ?? {}),
            ...Object.fromEntries(
              getRoots<SubgraphRootTypes["propertyType"]>(
                propertyTypesSubgraph as any, // @todo-0.3 fix this
              ).map((propertyType) => {
                return [propertyType.schema.$id, propertyType.schema];
              }),
            ),
          }));
        }
      },
    );
  }, [aggregatePropertyTypes]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const result = useMemo(
    () => ({ refetch: fetch, propertyTypes }),
    [fetch, propertyTypes],
  );

  return result;
};

export const LatestPropertyTypesContextProvider = ({
  children,
}: PropsWithChildren) => {
  const value = useLatestPropertyTypesContextValue();

  return (
    <LatestPropertyTypesContext.Provider value={value}>
      {children}
    </LatestPropertyTypesContext.Provider>
  );
};
