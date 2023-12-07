import { EntityType } from "@blockprotocol/type-system";
import {
  ComponentIdHashBlockMap,
  fetchBlock,
} from "@local/hash-isomorphic-utils/blocks";
import {
  createContext,
  Dispatch,
  FunctionComponent,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { useCachedDefaultState } from "../components/hooks/use-default-state";
import { useGetBlockProtocolBlocks } from "../components/hooks/use-get-block-protocol-blocks";

interface UserBlocksContextState {
  value: ComponentIdHashBlockMap;
  setValue: Dispatch<SetStateAction<ComponentIdHashBlockMap>>;
  blockFetchFailed: boolean;
}

/** @private enforces use of custom provider */
const UserBlocksContext = createContext<UserBlocksContextState | null>(null);

export const UserBlocksProvider: FunctionComponent<{
  value: ComponentIdHashBlockMap;
  children?: ReactNode;
}> = ({ value: initialUserBlocks, children }) => {
  const [value, setValue] = useCachedDefaultState(
    initialUserBlocks,
    "hash-workspace-user-blocks-v2",
    (nextInitialItems, prevInitialItems) => {
      return { ...prevInitialItems, ...nextInitialItems };
    },
  );

  const fetchBlockSchema = useCallback(
    async (params: { schemaId: string }): Promise<EntityType | null> => {
      try {
        const response = await fetch(params.schemaId);

        const text = await response.text();

        const schema = await JSON.parse(text);

        return schema;
      } catch {
        return null;
      }
    },
    [],
  );

  const { data, error } = useGetBlockProtocolBlocks();

  useEffect(() => {
    const setInitialBlocks = async () => {
      if (!data) {
        return;
      }

      const apiBlocksWithSchema = await Promise.all(
        data.getBlockProtocolBlocks.map(async ({ componentId }) => {
          const fetchedBlock = await fetchBlock(componentId, {
            /**
             * We want to avoid using the `blockCache` here as we want to
             * fetch the latest version of the block once per page-load,
             * incase there's been an update.
             *
             * @todo consider mechanisms for migrating existing blocks
             * to new versions if there are breaking changes
             */
            bustCache: true,
          });

          const blockSchema = await fetchBlockSchema({
            schemaId: fetchedBlock.meta.schema,
          });

          return { ...fetchedBlock, schema: blockSchema };
        }),
      );

      const apiProvidedBlocksMap: ComponentIdHashBlockMap = {};

      for (const block of apiBlocksWithSchema) {
        apiProvidedBlocksMap[block.meta.componentId] = block;
      }

      setValue((prevValue) => {
        const newValue: ComponentIdHashBlockMap = {};
        for (const [componentId, blockData] of Object.entries({
          ...prevValue,
          ...apiProvidedBlocksMap,
        })) {
          if (parseFloat(blockData.meta.protocol) >= 0.3) {
            newValue[componentId] = blockData;
          }
        }
        return newValue;
      });
    };

    void setInitialBlocks();
  }, [setValue, data, fetchBlockSchema]);

  useEffect(() => {
    const fetchMissingSchemas = async () => {
      const blocksWithoutSchema = Object.entries(value).filter(
        ([_, { schema }]) => typeof schema === "undefined",
      );

      for (const [componentId, { meta }] of blocksWithoutSchema) {
        const schema = await fetchBlockSchema({
          schemaId: meta.schema,
        });

        setValue((prevValue) => {
          const newValue: ComponentIdHashBlockMap = { ...prevValue };

          newValue[componentId]!.schema = schema;

          return newValue;
        });
      }
    };
    void fetchMissingSchemas();
  }, [value, setValue, fetchBlockSchema]);

  const state = useMemo(
    () => ({ value, setValue, blockFetchFailed: !!error }),
    [value, setValue, error],
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
