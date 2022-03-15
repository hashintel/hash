import { BlockMetadata } from "blockprotocol";
import produce from "immer";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useLocalstorageState } from "rooks";

type UserBlocks = BlockMetadata[];

interface UserBlocksContextState {
  value: UserBlocks;
  setValue: Dispatch<SetStateAction<UserBlocks>>;
}

/** @private enforces use of custom provider */
const UserBlocksContext = createContext<UserBlocksContextState | null>(null);

export const UserBlocksProvider: React.FC<{ value: BlockMetadata[] }> = ({
  value: initialUserBlocks,
  children,
}) => {
  const [value, setValue] = useLocalstorageState<UserBlocks>(
    "hash-workspace-user-blocks",
    initialUserBlocks,
  );

  useEffect(() => {
    const nextUserBlocks = produce(value, (draftUserBlocks) => {
      for (const latestUserBlock of initialUserBlocks) {
        const matchingUserBlockIndex = draftUserBlocks.findIndex(
          (userBlock) =>
            userBlock.name === latestUserBlock.name &&
            userBlock.version !== latestUserBlock.version,
        );

        if (matchingUserBlockIndex > -1) {
          // Using `any` to fix a `Type instantiation is excessively deep` error.
          // @todo find a potential fix.
          draftUserBlocks[matchingUserBlockIndex] = latestUserBlock as any;
        }
      }
    });

    setValue(nextUserBlocks);
  }, [initialUserBlocks]);

  const state = useMemo(() => ({ value, setValue }), [value, setValue]);

  return (
    <UserBlocksContext.Provider value={state}>
      {children}
    </UserBlocksContext.Provider>
  );
};

export const useUserBlocks = () => {
  const state = useContext(UserBlocksContext);

  if (state === null) {
    throw new Error("no value has been provided to UserBlocksContext");
  }

  return state;
};
