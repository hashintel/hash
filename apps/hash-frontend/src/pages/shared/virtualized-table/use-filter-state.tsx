import { useEffect, useRef, useState } from "react";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { isEqual } from "lodash";
import type {
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValuesByFieldId,
} from "./header/filter";

/**
 * Maintain filter state for the virtualized table.
 *
 * The main purpose of this hook is to abstract away updating the filter values when the default filter values change:
 * 1. Update to the new defaults where users have not made any changes
 * 2. If the user has made changes, preserve their selections, while removing any options that are now invalid
 */
export const useVirtualizedTableFilterState = <
  FilterValues extends VirtualizedTableFilterValuesByFieldId | null,
>({
  defaultFilterValues,
  filterDefinitions,
}: {
  defaultFilterValues: FilterValues;
  filterDefinitions?: VirtualizedTableFilterDefinitionsByFieldId;
}) => {
  const [filterValues, setFilterValues] = useState(defaultFilterValues);

  const previousDefaultFilterValues = useRef<FilterValues>(defaultFilterValues);

  /**
   * Before the claims data has loaded, we don't have initialFilterValues to set filterValues to.
   * Once it has, we initialize the filterValues with the initialFilterValues.
   *
   * We don't change them if filterValues exists, because the user may have set some filters,
   * and we don't want to reset them each time new claim data arrives.
   * This does mean that the user has to be aware that they have filters applied which may be hiding new data.
   */
  useEffect(() => {
    if (!filterDefinitions) {
      /**
       * We don't have any definitions yet, so nothing else should have been initialized.
       */
      return;
    }

    if (!filterValues && defaultFilterValues) {
      /**
       * We may start off with no defaultFilterValues due to the way the data is loaded,
       * in which case we initialize filterValues once defaultFilterValues is defined.
       */
      setFilterValues(defaultFilterValues);
    } else if (
      defaultFilterValues &&
      !isEqual(defaultFilterValues, previousDefaultFilterValues.current)
    ) {
      /**
       * The default filter values have changed, which may because possible values have added or removed,
       * or because new columns have been added.
       *
       * We want to ensure the filterValues reflects the new options, while preserving the user's selections
       * where possible.
       */
      setFilterValues((currentFilterValues) => {
        const newFilterValues: FilterValues = {
          ...defaultFilterValues,
        };

        if (!currentFilterValues || !previousDefaultFilterValues.current) {
          /**
           * It should be impossible to reach this, as we know defaultFilterValues is defined and if there's no
           * filterValues we set it to defaultFilterValues above, previousDefaultFilterValues would have been set to
           * defaultFilterValues. But this costs effectively nothing and is safer than a non-null assertion if the
           * branching logic above is ever changed.
           */
          return newFilterValues;
        }

        for (const [columnId, defaultValue] of typedEntries(
          defaultFilterValues,
        )) {
          const currentValue = currentFilterValues[columnId];
          const filterOptions = filterDefinitions[columnId]?.options;
          const previousFilterOptions = previousDefaultFilterValues.current;

          if (!filterOptions) {
            throw new Error(
              `No filter options for column ${columnId}, which is present in defaultFilterValues.`,
            );
          }

          const previousDefault = previousFilterOptions[columnId];

          if (currentValue === undefined || !previousDefault) {
            /**
             * We didn't have this column previously, so we set it to its default.
             */
            newFilterValues[columnId] = defaultValue;
          } else if (typeof currentValue === "string") {
            /**
             * This is a single value (radio group) filter.
             */
            if (filterOptions[currentValue]) {
              /**
               * If the currentValue is still a valid option, keep it.
               * This does mean that if the default is changed, the new default will not be applied.
               */
              newFilterValues[columnId] = currentValue;
            } else {
              /**
               * The currentValue is no longer valid for some reason – set the new default.
               */
              newFilterValues[columnId] = defaultValue;
            }
          } else {
            if (typeof defaultValue === "string") {
              throw new Error(
                `Got string defaultValue '${defaultValue}' for columnId '${columnId}', expected Set`,
              );
            }
            if (typeof previousDefault === "string") {
              throw new Error(
                `Got string previousDefault '${previousDefault}' for columnId '${columnId}', expected Set`,
              );
            }

            /**
             * This is a Set (checkbox group) filter.
             */
            if (currentValue === defaultValue) {
              /**
               * Shortcut in case the default value is the same Set in memory as the current value,
               * meaning that it's untouched (since we don't mutate the Set when updating the filter values).
               */
              newFilterValues[columnId] = currentValue;
            } else if (previousDefault.difference(currentValue).size === 0) {
              /**
               * The user may have deselected and reselected values, creating a new Set in memory,
               * but their values may be functionally the same as the previous default, meaning
               * that we want to update their values to the new default.
               *
               * This logic assumes that the default includes all possible values, meaning our check for equality
               * is based on checking if the currentValue contains all values in the previous default.
               */
              newFilterValues[columnId] = defaultValue;
            } else {
              /**
               * The user has deselected some values, so we want to preserve their selection.
               * We need to check if each value in the current value is still a valid option.
               *
               * This does mean that there may be new possible values that are not selected.
               */
              const currentValueArray = Array.from(currentValue);
              const newValues = new Set(currentValueArray);
              for (const value of currentValueArray) {
                if (!filterOptions[value]) {
                  /**
                   * If the value is no longer a valid option, remove it from the Set.
                   */
                  newValues.delete(value);
                }
              }
              newFilterValues[columnId] = newValues;
            }
          }
        }

        return newFilterValues;
      });
    }

    previousDefaultFilterValues.current = defaultFilterValues;
  }, [filterDefinitions, filterValues, defaultFilterValues]);

  return [filterValues, setFilterValues] as const;
};
