import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Backdrop } from "@mui/material";
import type { FunctionComponent, RefObject } from "react";
import { useCallback, useMemo, useState } from "react";

import type { EditEntitySlideOverProps } from "../[shortname]/entities/[entity-uuid].page/edit-entity-slide-over";
import { EditEntitySlideOver } from "../[shortname]/entities/[entity-uuid].page/edit-entity-slide-over";
import type { EntityEditorProps } from "../[shortname]/entities/[entity-uuid].page/entity-editor";
import { generateEntityRootedSubgraph } from "./subgraphs";

interface EntityEditorSlideStackProps {
  disableTypeClick?: boolean;
  /**
   * If you already have a subgraph with the entity, its types and incoming/outgoing links to a depth of 1, provide it.
   * If you have a subgraph with partial data (e.g. no links), you can provide it along with `entityId`,
   * and the missing data will be fetched and loaded in when it is available.
   */
  entitySubgraph?: Subgraph<EntityRootType>;
  /**
   * Hide the link to open the entity in a new tab.
   */
  hideOpenInNew?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  readonly?: boolean;
  /**
   * The entityId to start the stack with.
   */
  rootEntityId: EntityId;
  /**
   * Options to pass to the EntityEditor for the root entity
   */
  rootEntityOptions?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">;
  /**
   * If a container ref is provided, the slide will be attached to it (defaults to the MUI default, the body)
   */
  slideContainerRef?: RefObject<HTMLDivElement>;
}

const Slide = (allProps: EditEntitySlideOverProps) => {
  const { entitySubgraph: fullSubgraph, ...props } = allProps;

  const entitySubgraph = useMemo(
    () =>
      props.entityId && fullSubgraph
        ? generateEntityRootedSubgraph(props.entityId, fullSubgraph)
        : undefined,
    [props.entityId, fullSubgraph],
  );

  return <EditEntitySlideOver {...props} entitySubgraph={entitySubgraph} />;
};

export const EntityEditorSlideStack: FunctionComponent<
  EntityEditorSlideStackProps
> = ({
  disableTypeClick,
  entitySubgraph,
  hideOpenInNew,
  onClose,
  onSubmit,
  readonly,
  rootEntityId,
  rootEntityOptions,
  slideContainerRef,
}) => {
  const [animateOut, setAnimateOut] = useState(false);
  const [items, setItems] = useState<EntityId[]>([rootEntityId]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  if (rootEntityId !== items[0]) {
    setCurrentIndex(0);
    setItems([rootEntityId]);
  }

  const handleBack = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, []);

  const handleForward = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, items.length - 1));
  }, [items.length]);

  const handleNavigateToEntity = useCallback(
    (entityId: EntityId) => {
      setItems((prev) => [...prev.slice(0, currentIndex + 1), entityId]);
      setCurrentIndex((prevIndex) => prevIndex + 1);
    },
    [currentIndex],
  );

  const handleClose = useCallback(() => {
    setAnimateOut(true);

    setTimeout(() => {
      setAnimateOut(false);
      setItems([]);
      onClose();
    }, 200);
  }, [setAnimateOut, setItems, onClose]);

  return (
    <Backdrop
      onClick={handleClose}
      open={!animateOut}
      sx={{ zIndex: ({ zIndex }) => zIndex.drawer + 2 }}
    >
      {items.slice(0, currentIndex + 1).map((entityId, index) => {
        return (
          <Slide
            disableTypeClick={disableTypeClick}
            entitySubgraph={entitySubgraph}
            entityId={entityId}
            hideOpenInNew={hideOpenInNew}
            // eslint-disable-next-line react/no-array-index-key
            key={`${index}-${entityId}`}
            open={!animateOut}
            onBack={index > 0 ? handleBack : undefined}
            onClose={handleClose}
            onEntityClick={handleNavigateToEntity}
            onForward={index < items.length - 1 ? handleForward : undefined}
            onSubmit={onSubmit}
            readonly={readonly}
            slideContainerRef={slideContainerRef}
            stackPosition={index + 1}
            {...(rootEntityId === entityId ? rootEntityOptions : {})}
          />
        );
      })}
    </Backdrop>
  );
};
