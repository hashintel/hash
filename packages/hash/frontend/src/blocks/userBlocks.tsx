import { BlockMetadata } from "blockprotocol";
import produce from "immer";
import { BlockConfig, fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import {
  createContext,
  Dispatch,
  FC,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isProduction } from "../lib/config";
import { useCachedDefaultState } from "../components/hooks/useDefaultState";

export type RemoteBlockMetadata = BlockMetadata & {
  componentId: string;
};

type UserBlocks = RemoteBlockMetadata[];

interface UserBlocksContextState {
  value: UserBlocks;
  setValue: Dispatch<SetStateAction<UserBlocks>>;
  blockFetchFailed: boolean;
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

      // @todo Remove need for @ts-expect-error here
      if (matchingUserBlockIndex === -1) {
        // @ts-expect-error TS warns `Type instantiation is excessively deep` but this isn't a problem here
        draftUserBlocks.push(latestUserBlock);
      }

      if (
        // in development, overwrite the locally cached block if the source has changed
        (!isProduction &&
          draftUserBlocks[matchingUserBlockIndex]?.source !==
            latestUserBlock.source) ||
        // overwrite the locally cached block if loading a different version
        draftUserBlocks[matchingUserBlockIndex]?.version !==
          latestUserBlock.version
      ) {
        // @ts-expect-error TS warns `Type instantiation is excessively deep` but this isn't a problem here
        draftUserBlocks[matchingUserBlockIndex] = latestUserBlock;
      }
    }
  });
};

export const UserBlocksProvider: FC<{ value: UserBlocks }> = ({
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

  const [blockFetchFailed, setBlockFetchFailed] = useState(false);

  useEffect(() => {
    const setInitialBlocks = () => {
      if (process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY) {
        const blocksMetadataHeaders = new Headers();
        blocksMetadataHeaders.set(
          "x-api-key",
          process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY,
        );

        const controller = new AbortController();
        const signal = controller.signal;

        fetch("https://blockprotocol.org/api/blocks", {
          headers: blocksMetadataHeaders,
          signal,
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Fetch failed with status: ${response.status}`);
            }
            return response.json();
          })
          .then(async ({ results: responseData }) => {
            const resolvedMetadata = await Promise.all(
              (responseData as BlockConfig[]).map(
                async (metadata) =>
                  (
                    await fetchBlockMeta(metadata.componentId)
                  ).componentMetadata,
              ),
            );
            setValue((prevValue) => {
              return mergeBlocksData(prevValue, resolvedMetadata);
            });
          })
          .catch((error) => {
            // eslint-disable-next-line no-console -- TODO: consider using logger
            console.error(error);
            setBlockFetchFailed(true);
          });

        return controller;
      }
    };

    const controller = setInitialBlocks();

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [setValue]);

  const state = useMemo(
    () => ({ value, setValue, blockFetchFailed }),
    [value, setValue, blockFetchFailed],
  );

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
