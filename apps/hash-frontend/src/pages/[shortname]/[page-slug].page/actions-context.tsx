import { ActionData, ActionDefinition } from "@blockprotocol/action";
import { Modal } from "@hashintel/design-system";
import { EntityId } from "@local/hash-subgraph";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type BlockElementActions = {
  [ActionName: string]: {
    action?: (payload: ActionData["payload"]) => void;
    eventTrigger: ActionDefinition;
    updateTriggerLabel?: (label: string) => void;
  };
};

export type BlockActionsByElement = {
  [ElementId: string]: BlockElementActions;
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
  const [showActionModal, setShowActionModal] = useState(false);

  const [pageActionsByBlock, setPageActionsByBlock] =
    useState<PageActionsByBlock>({});

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

  const showActionsInterface = useCallback(() => {
    for (const [blockId, blockActionsByElement] of Object.entries(
      pageActionsByBlock,
    )) {
      for (const elementId of Object.keys(blockActionsByElement)) {
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
        console.log({ triggerElement });

        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = `${triggerElement.clientWidth}px`;
        overlay.style.height = `${triggerElement.clientHeight}px`;
        overlay.style.zIndex = "2000000000";

        overlay.style.backgroundImage = `
          linear-gradient(rgba(0, 255, 0, .7) .1em, transparent .1em), 
          linear-gradient(90deg, rgba(0, 255, 0, .7) .1em, transparent .1em)
        `;
        overlay.style.backgroundSize = "10px 10px";
        overlay.style.cursor = "pointer";
        overlay.addEventListener("click", (event) => {
          event.stopPropagation();
          overlay.style.opacity = "0.8";
          console.log("Clicked element", elementId);
        });

        triggerElement.appendChild(overlay);
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

  return (
    <PageActionsContext.Provider value={pageActionsContextValue}>
      <Modal open={showActionModal} onClose={() => setShowActionModal(false)}>
        <div>Modal content</div>
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
