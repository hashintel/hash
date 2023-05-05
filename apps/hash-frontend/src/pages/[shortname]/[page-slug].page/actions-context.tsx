import { ActionData, ActionDefinition } from "@blockprotocol/action";
import { Modal } from "@hashintel/design-system";
import { EntityId } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { ElementActionsConfiguration } from "./actions-context/element-action-configuration";

export type ElementAction = {
  action?: (payload: ActionData["payload"]) => void;
  eventTrigger: ActionDefinition;
  updateTriggerLabel?: (label: string) => void;
};

export type ActionsByTriggerName = {
  [ActionName: string]: ElementAction;
};

export type BlockActionsByElement = {
  [ElementId: string]: ActionsByTriggerName;
};

export type PageActionsByBlock = Record<EntityId, BlockActionsByElement>;

type PageActionsContextValue = {
  pageActionsByBlock: PageActionsByBlock;
  processEvent: (blockId: EntityId, action: ActionData) => void;
  setBlockActions: (
    blockEntityId: EntityId,
    blockActions: BlockActionsByElement,
  ) => void;
  showActionsInterface: () => void;
};

export const PageActionsContext = createContext<PageActionsContextValue | null>(
  null,
);

export const ActionsContextProvider = ({ children }: PropsWithChildren) => {
  const [pageActionsByBlock, setPageActionsByBlock] =
    useState<PageActionsByBlock>({});
  const [selectedActionData, setSelectedActionData] = useState<{
    actions: ActionsByTriggerName;
    backgroundOverlay: HTMLDivElement;
    blockId: string;
    overlay: HTMLDivElement;
  }>();

  const processEvent = useCallback<PageActionsContextValue["processEvent"]>(
    (blockId, action) => {
      const eventAction =
        pageActionsByBlock[blockId]?.[action.elementId]?.[action.actionName];
      if (eventAction?.action) {
        eventAction.action(action.payload);
      }
    },
    [pageActionsByBlock],
  );

  console.log({ pageActionsByBlock });

  const showActionsInterface = useCallback(() => {
    for (const [blockId, blockActionsByElement] of Object.entries(
      pageActionsByBlock,
    )) {
      for (const [elementId, actionsByName] of Object.entries(
        blockActionsByElement,
      )) {
        const blockWrapper = document.querySelector(
          `[data-entity-id="${blockId}"]`,
        );
        if (!blockWrapper) {
          throw new Error(
            `Could not find block wrapping element with id ${blockId} in DOM`,
          );
        }

        /**
         * This will not work if the element is inside a shadow DOM.
         * One approach with an 'open' shadow DOM is to traverse all elements within the blockWrapper,
         * and find one that has a .shadowRoot property. Then, look within [element].shadowRoot.
         * This fallback method will not work if the shadow DOM is 'closed' (shadowRoot will be null).
         */
        const triggerElement = blockWrapper.querySelector(`#${elementId}`);
        if (!triggerElement) {
          throw new Error(
            `Could not find element with id ${elementId} within block`,
          );
        }

        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = `${triggerElement.clientWidth}px`;
        overlay.style.height = `${triggerElement.clientHeight}px`;
        overlay.style.zIndex = "999";

        overlay.style.backgroundImage = `
          linear-gradient(rgba(0, 255, 0, 0.7) .1em, transparent .1em), 
          linear-gradient(90deg, rgba(0, 255, 0, 0.7) .1em, transparent .1em)
        `;
        overlay.style.backgroundSize = "10px 10px";
        overlay.style.cursor = "pointer";
        overlay.style.border = "5px solid rgba(0, 255, 0, 0.7)";

        const backgroundOverlay = document.createElement("div");
        backgroundOverlay.style.position = "fixed";
        backgroundOverlay.style.top = "0";
        backgroundOverlay.style.left = "0";
        backgroundOverlay.style.width = "100vw";
        backgroundOverlay.style.height = "100vh";
        backgroundOverlay.style.zIndex = "998";

        backgroundOverlay.style.backgroundImage = `
          linear-gradient(rgba(50, 50, 50, 0.1) 0.01em, transparent .1em),
          linear-gradient(90deg, rgba(50, 50, 50, 0.1) 0.01em, transparent .1em)
        `;
        backgroundOverlay.style.backgroundSize = "10px 10px";

        triggerElement.appendChild(overlay);
        document.body.appendChild(backgroundOverlay);

        overlay.addEventListener("click", (event) => {
          event.stopPropagation();
          setSelectedActionData({
            actions: actionsByName,
            blockId,
            overlay,
            backgroundOverlay,
          });
        });
      }
    }
  }, [pageActionsByBlock]);

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
      showActionsInterface,
    }),
    [pageActionsByBlock, processEvent, showActionsInterface],
  );

  const deselectElement = () => {
    selectedActionData?.overlay.remove();
    selectedActionData?.backgroundOverlay.remove();
    setSelectedActionData(undefined);
  };

  return (
    <PageActionsContext.Provider value={pageActionsContextValue}>
      <Modal open={!!selectedActionData} onClose={deselectElement}>
        {selectedActionData ? (
          <ElementActionsConfiguration
            actions={selectedActionData.actions}
            updateActions={(actions) => {
              setPageActionsByBlock((pageActions) => ({
                ...pageActions,
                [selectedActionData.blockId]: {
                  ...pageActions[selectedActionData.blockId as EntityId],
                  [selectedActionData.overlay.parentElement!.id]: actions,
                },
              }));
            }}
          />
        ) : (
          <Box />
        )}
      </Modal>
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
