import { UserPermissionsOnEntities } from "@local/hash-isomorphic-utils/types";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  createContext,
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";

export type BlockContextType = {
  error: boolean;
  setError: (error: boolean) => void;
  blockSelectDataModalIsOpen: boolean;
  setBlockSelectDataModalIsOpen: (isOpen: boolean) => void;
  blockSubgraph: Subgraph<EntityRootType> | undefined;
  setBlockSubgraph: Dispatch<
    SetStateAction<Subgraph<EntityRootType> | undefined>
  >;
  userPermissions: UserPermissionsOnEntities | undefined;
  setUserPermissions: (permissions: UserPermissionsOnEntities) => void;
};

export const BlockContext = createContext<BlockContextType | null>(null);

export const useBlockContext = () => {
  const blockContext = useContext(BlockContext);

  if (!blockContext) {
    throw new Error("no BlockContext value has been provided");
  }

  return blockContext;
};

export const BlockContextProvider = ({ children }: PropsWithChildren) => {
  const [error, setError] = useState(false);
  const [blockSubgraph, setBlockSubgraph] = useState<
    Subgraph<EntityRootType> | undefined
  >();
  const [userPermissions, setUserPermissions] = useState<
    UserPermissionsOnEntities | undefined
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
