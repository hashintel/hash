import { ActionData, ActionDefinition } from "@blockprotocol/action";
import { Brand } from "@local/advanced-types/brand";
import { EntityId } from "@local/hash-subgraph";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type ActionName = Brand<string, "actionName">;

export type ElementId = Brand<string, "elementId">;

export type ActionId = `${ElementId}-${ActionName}`;

type BlockAction = {
  action: (payload: ActionData["payload"]) => void;
  eventTrigger: ActionDefinition;
  updateTriggerLabel?: (label: string) => void;
};

export type BlockActions = Record<ActionId, BlockAction>;

export type PageActionsByBlock = Record<EntityId, BlockActions>;

type PageActionsContextValue = {
  pageActionsByBlock: PageActionsByBlock;
  processEvent: (blockId: EntityId, action: ActionData) => void;
  setBlockActions: (
    blockEntityId: EntityId,
    blockActions: BlockActions,
  ) => void;
};

export const PageActionsContext = createContext<PageActionsContextValue | null>(
  null,
);

export const ActionsContextProvider = ({ children }: PropsWithChildren) => {
  const [pageActionsByBlock, setPageActionsByBlock] =
    useState<PageActionsByBlock>({});

  const processEvent = useCallback<PageActionsContextValue["processEvent"]>(
    (blockId, action) => {
      const eventAction =
        pageActionsByBlock[blockId]?.[
          `${action.elementId as ElementId}-${action.actionName as ActionName}`
        ];
      if (eventAction) {
        eventAction.action(action.payload);
      }
    },
    [pageActionsByBlock],
  );

  const pageActionsContextValue = useMemo<PageActionsContextValue>(
    () => ({
      pageActionsByBlock,
      processEvent,
      setBlockActions: (blockEntityId, blockActions) => {
        setPageActionsByBlock((pageActions) => ({
          ...pageActions,
          [blockEntityId]: blockActions,
        }));
      },
    }),
    [pageActionsByBlock, processEvent],
  );

  return (
    <PageActionsContext.Provider value={pageActionsContextValue}>
      {children}
    </PageActionsContext.Provider>
  );
};

export const useActionsContext = () => {
  const context = useContext(PageActionsContext);

  if (!context) {
    throw new Error("No actions context provider found");
  }

  return context;
};
