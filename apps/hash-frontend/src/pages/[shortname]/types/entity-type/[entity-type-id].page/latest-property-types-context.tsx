import {
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
} from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
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
  propertyTypes: PropertyTypeWithMetadata[] | null;
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
          setPropertyTypes((existingPropertyTypes) => [
            ...(existingPropertyTypes ?? []),
            ...getRoots<false, PropertyTypeRootType>(
              propertyTypesSubgraph as any,
            ),
          ]);
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
