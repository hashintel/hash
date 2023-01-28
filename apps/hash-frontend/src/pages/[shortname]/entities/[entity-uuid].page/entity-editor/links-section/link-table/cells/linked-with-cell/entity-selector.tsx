import { Entity, EntityId, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
import { useEffect, useMemo, useRef, useState } from "react";

import { GRID_CLICK_IGNORE_CLASS } from "../../../../../../../../../components/grid/utils";
import { useBlockProtocolAggregateEntities } from "../../../../../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-aggregate-entities";
import { generateEntityLabel } from "../../../../../../../../../lib/entities";
import { HashSelectorAutocomplete } from "../../../../../../../shared/hash-selector-autocomplete";
import { useEntityEditor } from "../../../../entity-editor-context";

interface EntitySelectorProps {
  onSelect: (option: Entity) => void;
  onCancel: () => void;
  expectedEntityTypes: EntityTypeWithMetadata[];
  entityIdsToFilterOut?: EntityId[];
}

export const EntitySelector = ({
  onSelect,
  onCancel,
  expectedEntityTypes,
  entityIdsToFilterOut,
}: EntitySelectorProps) => {
  const { entitySubgraph } = useEntityEditor();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const [search, setSearch] = useState("");

  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
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

  const sortedAndFilteredEntities = useMemo(() => {
    return [...entities]
      .filter(
        (entity) =>
          !entityIdsToFilterOut?.includes(entity.metadata.editionId.baseId),
      )
      .sort((a, b) =>
        a.metadata.version.decisionTime.start.localeCompare(
          b.metadata.version.decisionTime.start,
        ),
      );
  }, [entities, entityIdsToFilterOut]);

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

  return (
    <HashSelectorAutocomplete
      className={GRID_CLICK_IGNORE_CLASS}
      open
      dropdownProps={{
        query: search,
        createButtonProps: {
          className: GRID_CLICK_IGNORE_CLASS,
          onMouseDown: (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            onCreateNew();
          },
        },
        variant: "entity",
      }}
      loading={loading}
      options={sortedAndFilteredEntities}
      optionToRenderData={(entity) => ({
        /**
         * @todo we should show namespace the entity belongs on the OntologyChip here.
         * Using entity type for now
         * */
        $id: entity.metadata.entityTypeId,
        title: generateEntityLabel(entitySubgraph, entity),
      })}
      inputPlaceholder="Search for an entity"
      inputValue={search}
      onInputChange={(_, value) => setSearch(value)}
      onHighlightChange={(_, value) => {
        highlightedRef.current = value;
      }}
      onChange={(_, option) => {
        onSelect(option);
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
