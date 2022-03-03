import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useMemo,
} from "react";
import { useLocalstorageState } from "rooks";

export type BlocksMetaMap = Record<string, BlockMeta>;

interface BlocksMetaContextState {
  value: BlocksMetaMap;
  setValue: Dispatch<SetStateAction<BlocksMetaMap>>;
}

/** @private enforces use of custom provider */
const BlocksMetaContext = createContext<BlocksMetaContextState | null>(null);

export const BlocksMetaProvider: React.FC<{ value: BlocksMetaMap }> = ({
  value: initialValue,
  children,
}) => {
  const [value, setValue] = useLocalstorageState(
    "hash-workspace-blocks-meta",
    initialValue,
  );

  const state = useMemo(() => ({ value, setValue }), [value, setValue]);

  return (
    <BlocksMetaContext.Provider value={state}>
      {children}
    </BlocksMetaContext.Provider>
  );
};

export const useBlocksMeta = () => {
  const state = useContext(BlocksMetaContext);

  if (state === null) {
    throw new Error("no value has been provided to BlocksMetaContext");
  }

  return state;
};
