import React, { useCallback, useMemo, useRef, useState } from "react";
import { tw } from "twind";
import { v4 as uuid } from "uuid";
import { ColumnInstance } from "react-table";

import {
  MultiFilter,
  FilterOperatorWithoutValue,
  FilterOperatorType,
  MultiFilterOperatorType,
  FilterOperatorRequiringValue,
  AggregateOperationInput,
} from "@blockprotocol/graph";
import { unstable_batchedUpdates } from "react-dom";
import { debounce } from "lodash";
import { AddIcon } from "./icons";

const MENU_WIDTH = 540;

const FILTER_OPERATORS: FilterOperatorType[] = [
  "CONTAINS",
  "DOES_NOT_CONTAIN",
  "IS",
  "IS_NOT",
  "STARTS_WITH",
  "ENDS_WITH",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

const MULTI_FILTER_OPERATORS: MultiFilterOperatorType[] = ["AND", "OR"];

const FILTER_OPERATORS_WITHOUT_VALUE: FilterOperatorWithoutValue[] = [
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

type Filter = MultiFilter["filters"][0];

type FilterWithId = MultiFilter["filters"][0] & { id: string };

type FilterRequiringValue = {
  field: string;
  operator: FilterOperatorRequiringValue;
  value: string;
};

const filterHasValue = (filter: Filter): filter is FilterRequiringValue => {
  return (
    !FILTER_OPERATORS_WITHOUT_VALUE.includes(
      filter.operator as FilterOperatorWithoutValue,
    ) && (filter as FilterRequiringValue).value !== null
  );
};

type FilterDetailProps = {
  columns: ColumnInstance<{}>[];
  onFilter: (multiFilter: AggregateOperationInput["multiFilter"]) => void;
  multiFilter: AggregateOperationInput["multiFilter"];
};

export const FilterDetail: React.VFC<FilterDetailProps> = ({
  columns,
  onFilter,
  multiFilter,
}) => {
  const [combinatorFilterOperator, setCombinatorFilterOperator] =
    useState<MultiFilterOperatorType>("AND");
  const [filters, setFilters] = useState<FilterWithId[]>([]);
  const isMounted = useRef(false);

  const handleFilter = useCallback(
    (
      filterFields?: FilterWithId[],
      newCombinatorFilterOperator?: MultiFilterOperatorType,
    ) => {
      const filtersWithoutId = (filterFields ?? filters)
        .filter(({ field }) => Boolean(field))
        .map(({ id: _id, ...rest }) => rest);

      onFilter({
        operator: newCombinatorFilterOperator ?? combinatorFilterOperator,
        filters: filtersWithoutId,
      });
    },
    [filters, onFilter, combinatorFilterOperator],
  );

  const debouncedHandleFilter = useMemo(
    () => debounce(handleFilter, 500),
    [handleFilter],
  );

  const addField = () => {
    setFilters((prevFields) => [
      ...prevFields,
      {
        field: columns?.[0]?.id ?? "",
        operator: "CONTAINS",
        value: "",
        id: uuid(),
      },
    ]);
  };

  const removeField = (id: string) => {
    const newFields = filters.filter((filter) => filter.id !== id);
    setFilters(newFields);
    handleFilter(newFields);
  };

  const updateField = (id: string, data: Partial<Filter>) => {
    const updatedFields = filters.map((item) =>
      item.id === id
        ? ({
            ...item,
            ...data,
          } as FilterWithId)
        : item,
    );

    setFilters(updatedFields);
    debouncedHandleFilter(updatedFields);
  };

  const handleCombinatorFilterChange = (value: MultiFilterOperatorType) => {
    setCombinatorFilterOperator(value);
    debouncedHandleFilter(filters, value);
  };

  if (multiFilter && !filters.length && !isMounted.current) {
    isMounted.current = true;
    const fieldsWithId = (multiFilter.filters ?? []).map((filter) => ({
      ...filter,
      id: uuid(),
    }));

    unstable_batchedUpdates(() => {
      setFilters(fieldsWithId);
      setCombinatorFilterOperator(multiFilter.operator);
    });
  }

  return (
    <div style={{ width: MENU_WIDTH }} className={tw`pt-4 px-4 pb-2`}>
      <p className={tw`text-sm mb-3`}>Filters For </p>

      {filters.map((filter, index) => {
        return (
          <div key={filter.id} className={tw`flex items-center mb-4`}>
            <div className={tw`w-14 mr-2`}>
              {index === 0 ? (
                <span className={tw`text-sm px-1`}>Where</span>
              ) : (
                <select
                  className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-1`}
                  defaultValue={combinatorFilterOperator}
                  onChange={(evt) => {
                    handleCombinatorFilterChange(
                      evt.target.value as MultiFilterOperatorType,
                    );
                  }}
                >
                  {MULTI_FILTER_OPERATORS.map((operator) => {
                    return (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) w-28 focus:outline-none rounded h-8 px-2 mr-2`}
              onChange={(evt) =>
                updateField(filter.id, { field: evt.target.value })
              }
              defaultValue={filter.field}
            >
              <option value="">---</option>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.id}
                </option>
              ))}
            </select>
            <select
              className={tw`text-sm capitalize border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 w-28 px-2 mr-2`}
              onChange={(evt) =>
                updateField(filter.id, {
                  operator: evt.target.value as FilterOperatorType,
                })
              }
              defaultValue={filter.operator}
            >
              {FILTER_OPERATORS.map((operator) => {
                const label = operator.replaceAll("_", " ").toLowerCase();
                return (
                  <option key={operator} value={operator}>
                    {label}
                  </option>
                );
              })}
            </select>
            {filterHasValue(filter) && (
              <input
                placeholder="Value"
                className={tw`text-sm w-40 border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-2`}
                onChange={(evt) =>
                  updateField(filter.id, { value: evt.target.value })
                }
                defaultValue={filter.value}
              />
            )}
            <button
              className={tw`ml-auto text-2xl text-gray-300 hover:text-gray-400`}
              onClick={() => removeField(filter.id)}
              type="button"
            >
              &times;
            </button>
          </div>
        );
      })}

      <button
        className={tw`flex w-full items-center text-blue-500 text-sm py-1 px-2 hover:bg-gray-200 focus:outline-none`}
        onClick={addField}
        type="button"
      >
        <AddIcon className={tw`text-current h-4 w-4 mr-2`} />
        <span>Add a Filter</span>
      </button>
    </div>
  );
};
