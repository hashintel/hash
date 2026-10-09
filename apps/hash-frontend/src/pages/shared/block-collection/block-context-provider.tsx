import { useMemo, useState } from "react";

import { BlockContext } from "./block-context";

import type { BlockContextType } from "./block-context";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityPermissionsMap } from "@local/hash-graph-sdk/entity";
import type { PropsWithChildren } from "react";

export const BlockContextProvider = ({ children }: PropsWithChildren) => {
  const [error, setError] = useState(false);
  const [blockSubgraph, setBlockSubgraph] = useState<
    Subgraph<EntityRootType> | undefined
  >();
  const [userPermissions, setUserPermissions] = useState<
    EntityPermissionsMap | undefined
  >();
  const [blockSelectDataModalIsOpen, setBlockSelectDataModalIsOpen] =
    useState(false);

  const context = useMemo<BlockContextType>(
    () => ({
      error,
      setError,
      blockSelectDataModalIsOpen,
      setBlockSelectDataModalIsOpen,
      blockSubgraph,
      setBlockSubgraph,
      userPermissions,
      setUserPermissions,
    }),
    [
      error,
      setError,
      blockSubgraph,
      blockSelectDataModalIsOpen,
      setBlockSelectDataModalIsOpen,
      setBlockSubgraph,
      userPermissions,
      setUserPermissions,
    ],
  );

  return (
    <BlockContext.Provider value={context}>{children}</BlockContext.Provider>
  );
};
