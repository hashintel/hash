import { memo } from "react";

import { BulkActionsDropdown } from "../../../shared/table-header/bulk-actions-dropdown";
import { TableHeaderToggle } from "../table-header-toggle";
import { visualizerViewIcons } from "../visualizer-views";
import { FilterRibbon, QueryCount, VisualizerHeader } from "./header";

import type { VisualizerView } from "../visualizer-views";
import type { InternalWeb } from "./header";
import type { EntitiesFilterState } from "./shared/filter-state";
import type { FilterMetadataForProperty } from "./shared/property-filters/property-filter";
import type { AvailableType } from "./shared/use-available-types";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { Dispatch, SetStateAction } from "react";

interface VisualizerToolbarProps {
  readonly availableEntityTypes: AvailableType[];
  readonly availableTypesLoading: boolean;
  readonly filterState: EntitiesFilterState;
  /**
   * Entities graph exploration OR-ed into the set beyond the query's own
   * results; shown as a dismissible pill.
   */
  readonly frontierAdditionsCount: number;
  readonly internalWebs: InternalWeb[];
  readonly isTypePinned: boolean;
  /**
   * Loaded entities in the displayed set (query roots plus graph additions),
   * for the "m of n entities" count. Null while no page has landed.
   */
  readonly loadedResultCount: number | null;
  readonly onBulkActionCompleted: () => void;
  readonly onClearFrontierAdditions: () => void;
  /** Download the current filter configuration (filters plus graph additions). */
  readonly onExportFilters: () => void;
  /** Restore a configuration from a picked file's text. */
  readonly onImportFilters: (fileText: string) => void;
  readonly propertyFilterData: FilterMetadataForProperty[];
  /** When non-empty, the filter ribbon is replaced by bulk actions for the selection. */
  readonly selectedEntities: HashEntity[];
  readonly setFilterState: Dispatch<SetStateAction<EntitiesFilterState>>;
  readonly setView: (view: VisualizerView) => void;
  /** Size of the whole displayed set: the query's total plus graph additions. */
  readonly totalResultCount: number | null;
  readonly totalResultCountLoading: boolean;
  readonly view: VisualizerView;
  readonly viewOptions: VisualizerView[];
}

/**
 * The bar above the visualizer content: filter pills (or bulk actions when
 * rows are selected) on the left, the result count and view toggle on the
 * right.
 */
export const VisualizerToolbar: React.FC<VisualizerToolbarProps> = memo(
  ({
    availableEntityTypes,
    availableTypesLoading,
    filterState,
    frontierAdditionsCount,
    internalWebs,
    isTypePinned,
    loadedResultCount,
    onBulkActionCompleted,
    onClearFrontierAdditions,
    onExportFilters,
    onImportFilters,
    propertyFilterData,
    selectedEntities,
    setFilterState,
    setView,
    totalResultCount,
    totalResultCountLoading,
    view,
    viewOptions,
  }) => (
    <VisualizerHeader
      left={
        selectedEntities.length > 0 ? (
          <BulkActionsDropdown
            selectedItems={selectedEntities}
            onBulkActionCompleted={onBulkActionCompleted}
          />
        ) : (
          <FilterRibbon
            availableEntityTypes={availableEntityTypes}
            availableTypesLoading={availableTypesLoading}
            propertyFilterMetadata={propertyFilterData}
            filterState={filterState}
            frontierAdditionsCount={frontierAdditionsCount}
            internalWebs={internalWebs}
            isTypePinned={isTypePinned}
            onClearFrontierAdditions={onClearFrontierAdditions}
            onExportFilters={onExportFilters}
            onImportFilters={onImportFilters}
            setFilterState={setFilterState}
          />
        )
      }
      right={
        <>
          <QueryCount
            count={totalResultCount}
            loadedCount={loadedResultCount}
            loading={totalResultCountLoading}
          />
          <TableHeaderToggle
            value={view}
            setValue={setView}
            options={viewOptions.map((optionValue) => ({
              icon: visualizerViewIcons[optionValue],
              label: `${optionValue} view`,
              value: optionValue,
            }))}
          />
        </>
      }
    />
  ),
);
