import { BlockMetadata } from "blockprotocol";
import produce from "immer";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useCachedDefaultState } from "../components/hooks/useDefaultState";
import { advancedFetch } from "../components/util/advancedFetch";

export type RemoteBlockMetadata = BlockMetadata & {
  componentId: string;
  packagePath?: string;
};

// @todo - remove this and packagePath once componentId starts being generated on the backend
const getComponentId = (meta: RemoteBlockMetadata) => {
  if (meta.componentId) {
    return meta.componentId;
  }

  if (meta.packagePath) {
    return `https://blockprotocol.org/blocks/${meta.packagePath}`;
  }

  throw new Error("Added a block without packagePath or componentId");
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
        draftUserBlocks[matchingUserBlockIndex]?.version !==
        latestUserBlock.version
      ) {
        // @ts-expect-error TS warns `Type instantiation is excessively deep` but this isn't a problem here
        draftUserBlocks[matchingUserBlockIndex] = latestUserBlock;
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

  const [blockFetchFailed, setBlockFetchFailed] = useState(false);

  useEffect(() => {
    const setInitialBlocks = () => {
      if (process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY) {
        const blocksMetadataHeaders = new Headers();
        blocksMetadataHeaders.set(
          "x-api-key",
          process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY,
        );

        const fetchUserBlocks = advancedFetch(
          "https://blockprotocol.org/api/blocks",
          {
            headers: blocksMetadataHeaders,
          },
        );

        fetchUserBlocks.ready
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Fetch failed with status: ${response.status}`);
            }
            return response.json();
          })
          .then((responseData) => {
            const userBlocks = (responseData.results as UserBlocks).map(
              (userBlock) => ({
                ...userBlock,
                componentId: getComponentId(userBlock),
              }),
            );

            setValue((prevValue) => {
              return mergeBlocksData(prevValue, userBlocks);
            });
          })
          .catch((error) => {
            // eslint-disable-next-line no-console -- TODO: consider using logger
            console.error(error);
            setBlockFetchFailed(true);
          });

        return fetchUserBlocks;
      }
    };

    const { abort } = setInitialBlocks() ?? {};

    return () => {
      if (abort) {
        abort();
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
