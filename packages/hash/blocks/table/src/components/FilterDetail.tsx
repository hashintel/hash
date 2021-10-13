import React, { useEffect, useState } from "react";
import { tw } from "twind";
import { v4 as uuid } from "uuid";
import { ColumnInstance } from "react-table";
import { BlockProtocolAggregateOperationInput } from "@hashintel/block-protocol";
// @todo figure out why importing these enums results in an error
// import {
//   BlockProtocolFilterOperator,
//   BlockProtocolCombinatorFilterOperator,
// } from "@hashintel/block-protocol";
import { AddIcon } from "./Icons";

enum BlockProtocolFilterOperator {
  IS = "IS",
  IS_NOT = "IS_NOT",
  CONTAINS = "CONTAINS",
  DOES_NOT_CONTAIN = "DOES_NOT_CONTAIN",
  STARTS_WITH = "STARTS_WITH",
  ENDS_WITH = "ENDS_WITH",
  IS_EMPTY = "IS_EMPTY",
  IS_NOT_EMPTY = "IS_NOT_EMPTY",
}

enum BlockProtocolCombinatorFilterOperator {
  AND = "AND",
  OR = "OR",
}

const MENU_WIDTH = 540;

type FilterDetailProps = {
  columns: ColumnInstance<{}>[];
  onFilter: (filters: BlockProtocolAggregateOperationInput["filters"]) => void;
};

export const FilterDetail: React.VFC<FilterDetailProps> = ({
  columns,
  onFilter,
}) => {
  const [combinatorFilterOperator, setCombinatorFilterOperator] =
    useState<BlockProtocolCombinatorFilterOperator>(
      BlockProtocolCombinatorFilterOperator.AND
    );
  const [filters, setFilters] = useState<
    (NonNullable<
      BlockProtocolAggregateOperationInput["filters"]
    >["filters"][number] & { id: string })[]
  >([]);

  useEffect(() => {
    const filtersWithoutId = filters.map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      value: filter.value,
    }));

    // @todo throttle call
    onFilter({
      operator: combinatorFilterOperator,
      filters: filtersWithoutId,
    });
  }, [filters, combinatorFilterOperator]);

  const addField = () => {
    setFilters((prevFields) => [
      ...prevFields,
      {
        field: columns?.[0].id ?? "",
        operator: BlockProtocolFilterOperator.CONTAINS,
        value: "",
        id: uuid(),
      },
    ]);
  };

  const removeField = (id: string) => {
    setFilters((prevFields) =>
      prevFields.filter((property) => property.id !== id)
    );
  };

  const updateField = (
    id: string,
    data: {
      field?: string;
      value?: string;
      operator?: BlockProtocolFilterOperator;
    }
  ) => {
    const updatedFields = filters.map((item) =>
      item.id === id
        ? {
            id: item.id,
            field: data.field ?? item.field,
            value: data.value ?? item.value,
            operator: data.operator ?? item.operator,
          }
        : item
    );

    setFilters(updatedFields);
  };

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
                  value={combinatorFilterOperator}
                  onChange={(evt) =>
                    setCombinatorFilterOperator(
                      evt.target.value as BlockProtocolCombinatorFilterOperator
                    )
                  }
                >
                  {Object.values(BlockProtocolCombinatorFilterOperator).map(
                    (operator) => {
                      return (
                        <option key={operator} value={operator}>
                          {operator}
                        </option>
                      );
                    }
                  )}
                </select>
              )}
            </div>

            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) w-28 focus:outline-none rounded h-8 px-2 mr-2`}
              onChange={(evt) =>
                updateField(filter.id, { field: evt.target.value })
              }
              value={filter.field}
            >
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
                  operator: evt.target.value as BlockProtocolFilterOperator,
                })
              }
              value={filter.operator}
            >
              {Object.values(BlockProtocolFilterOperator).map((operator) => {
                const label = operator.replaceAll("_", " ").toLowerCase();
                return (
                  <option key={operator} value={operator}>
                    {label}
                  </option>
                );
              })}
            </select>
            <input
              placeholder="Value"
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 w-40 px-2`}
              onChange={(evt) =>
                updateField(filter.id, { value: evt.target.value })
              }
              value={filter.value}
            />
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
