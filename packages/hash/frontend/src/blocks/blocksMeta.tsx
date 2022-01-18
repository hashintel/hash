import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { createContext, useContext, useMemo } from "react";
import { useLocalstorageState } from "rooks";

export type BlocksMetaMap = Record<string, BlockMeta>;

interface BlocksMetaContextState {
  value: BlocksMetaMap;
  setValue(value: BlocksMetaMap): void;
}

const BlocksMetaContext = createContext<BlocksMetaContextState>({
  value: {},
  setValue(_) {},
});

export const BlocksMetaProvider: React.FC<{ value: BlocksMetaMap }> = ({
  value: initialValue,
  children,
}) => {
  const [value, setValue] = useLocalstorageState("blocks-meta", initialValue);

  const state = useMemo(() => ({ value, setValue }), [value, setValue]);

  return (
    <BlocksMetaContext.Provider value={state}>
      {children}
    </BlocksMetaContext.Provider>
  );
};

export const useBlocksMeta = () => useContext(BlocksMetaContext);
