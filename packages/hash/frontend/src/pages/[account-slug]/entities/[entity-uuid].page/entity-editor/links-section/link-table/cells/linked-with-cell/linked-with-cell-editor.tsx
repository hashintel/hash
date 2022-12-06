import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { Entity } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useEffect, useRef, useState } from "react";
import { useBlockProtocolAggregateEntities } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolAggregateEntities";
import { useBlockProtocolArchiveEntity } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolArchiveEntity";
import { useBlockProtocolCreateEntity } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { generateEntityLabel } from "../../../../../../../../../lib/entities";
import { HashSelectorAutocomplete } from "../../../../../../../types/entity-type/hash-selector-autocomplete";
import { useEntityEditor } from "../../../../entity-editor-context";
import { LinkedWithCell } from "../linked-with-cell";

export const LinkedWithCellEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { entitySubgraph, refetch } = useEntityEditor();
  const { createEntity } = useBlockProtocolCreateEntity();
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();

  const { value: cell, onFinishedEditing } = props;
  const { expectedEntityTypes, linkAndTargetEntities, linkEntityTypeId } =
    cell.data.linkRow;

  const [search, setSearch] = useState("");

  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<null | Entity>(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const { data } = await aggregateEntities({
          data: {
            rootEntityTypeIds: expectedEntityTypes.map(
              ({ schema }) => schema.$id,
            ),
          },
        });

        if (data) {
          setEntities(getRoots(data));
        }
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [aggregateEntities, expectedEntityTypes]);

  const onCreateNew = () => {
    if (!expectedEntityTypes[0]) {
      return;
    }

    /** @todo this should be replaced with a "new entity modal" or something else */
    void window.open(
      `/new/entity?entity-type-id=${encodeURIComponent(
        expectedEntityTypes[0].schema.$id,
      )}`,
      "_blank",
    );
  };

  const onSelect = async (val: Entity) => {
    const { linkEntity: currentLink, rightEntity: currentLinkedEntity } =
      linkAndTargetEntities[0] ?? {};

    const sameEntity =
      currentLinkedEntity?.metadata.editionId.baseId ===
      val.metadata.editionId.baseId;

    // if clicked on the same entity, do nothing
    if (sameEntity) {
      return onFinishedEditing();
    }

    // if there is an existing link, archive it
    if (currentLink) {
      await archiveEntity({
        data: { entityId: currentLink.metadata.editionId.baseId },
      });
    }

    // create new link
    await createEntity({
      data: {
        entityTypeId: linkEntityTypeId,
        properties: {},
        linkData: {
          leftEntityId: getRoots(entitySubgraph)[0]?.metadata.editionId.baseId!,
          rightEntityId: val.metadata.editionId.baseId,
        },
      },
    });

    await refetch();
    onFinishedEditing(undefined);
  };

  const onCancel = () => {
    onFinishedEditing();
  };

  return (
    <HashSelectorAutocomplete
      className="click-outside-ignore"
      dropdownProps={{
        query: search,
        createButtonProps: {
          className: "click-outside-ignore",
          onMouseDown: (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            onCreateNew();
          },
        },
        variant: "entity",
      }}
      loading={loading}
      options={[...entities].sort((a, b) =>
        a.metadata.editionId.baseId.localeCompare(b.metadata.editionId.baseId),
      )}
      optionToRenderData={(entity) => ({
        /**
         * @todo we should show namespace the entity belongs on the OntologyChip here.
         * Using entity type for now
         * */
        $id: entity.metadata.entityTypeId,
        title: generateEntityLabel(entitySubgraph, entity),
      })}
      inputPlaceholder="Search for an entity"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={(_, reason) => {
        if (reason !== "toggleInput") {
          setOpen(false);
        }
      }}
      inputValue={search}
      onInputChange={(_, value) => setSearch(value)}
      onHighlightChange={(_, value) => {
        highlightedRef.current = value;
      }}
      onChange={(_, option) => {
        if (option) {
          void onSelect(option);
        }
      }}
      onKeyUp={(evt) => {
        if (evt.key === "Enter" && !highlightedRef.current) {
          onCreateNew();
        }
      }}
      onKeyDown={(evt) => {
        if (evt.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={() => {
        onCancel();
      }}
      sx={{ minWidth: 375 }}
    />
  );
};
