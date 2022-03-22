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

import { useCachedDefaultState } from "../components/hooks/useDefaultState";

export type UserBlock = BlockMetadata & {
  componentId?: string;
  packagePath?: string;
};

export const getComponentId = (meta: UserBlock) => {
  if (meta.componentId) {
    return meta.componentId;
  }

  if (meta.packagePath) {
    return `https://blockprotocol.org/blocks/${meta.packagePath}`;
  }

  throw new Error("Added a block without packagePath or componentId");
};

type UserBlocks = UserBlock[];

interface UserBlocksContextState {
  value: UserBlocks;
  setValue: Dispatch<SetStateAction<UserBlocks>>;
}

/** @private enforces use of custom provider */
const UserBlocksContext = createContext<UserBlocksContextState | null>(null);

const mergeBlocksData = (
  oldBlocksData: UserBlocks,
  newBlocksData: UserBlocks,
): UserBlocks => {
  return produce(oldBlocksData, (draftUserBlocks) => {
    for (const latestUserBlock of newBlocksData) {
      const matchingUserBlockIndex = draftUserBlocks.findIndex(
        (userBlock) => userBlock.name === latestUserBlock.name,
      );

      // Using `any` to fix a `Type instantiation is excessively deep` error.
      // @todo find a potential fix.
      if (matchingUserBlockIndex === -1) {
        draftUserBlocks.push(latestUserBlock as any);
      }

      // Using `any` to fix a `Type instantiation is excessively deep` error.
      // @todo find a potential fix.
      if (
        draftUserBlocks[matchingUserBlockIndex]?.version !==
        latestUserBlock.version
      ) {
        draftUserBlocks[matchingUserBlockIndex] = latestUserBlock as any;
      }
    }
  });
};

export const UserBlocksProvider: React.FC<{ value: UserBlocks }> = ({
  value: initialUserBlocks,
  children,
}) => {
  const [value, setValue] = useCachedDefaultState(
    initialUserBlocks,
    "hash-workspace-user-blocks",
    (nextInitialItems, prevInitialItems) => {
      return mergeBlocksData(prevInitialItems, nextInitialItems);
    },
  );

  useEffect(() => {
    const setInitialBlocks = async () => {
      if (process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY) {
        const blocksMetadataHeaders = new Headers();
        blocksMetadataHeaders.set(
          "x-api-key",
          process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY,
        );

        try {
          const userBlocks = (
            await fetch("https://blockprotocol.org/api/blocks", {
              headers: blocksMetadataHeaders,
            }).then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Fetch failed with status: ${response.statusText}`,
                );
              }
              return response.json();
            })
          ).results as UserBlocks;

          setValue((prevValue) => {
            console.log({ prevValue, userBlocks });
            return mergeBlocksData(prevValue, userBlocks);
          });
        } catch (error) {
          console.error(error);
        }
      }
    };

    void setInitialBlocks();
  }, [setValue]);

  useEffect(() => {
    setValue((prevValue) => {
      return mergeBlocksData(prevValue, initialUserBlocks);
    });
  }, [initialUserBlocks, setValue]);

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
