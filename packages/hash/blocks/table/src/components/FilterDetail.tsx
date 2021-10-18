import React, { useEffect, useState } from "react";
import { tw } from "twind";
import { v4 as uuid } from "uuid";
import { ColumnInstance } from "react-table";
import {
  BlockProtocolAggregateOperationInput,
  BlockProtocolMultiFilterOperatorType,
  BlockProtocolFilterOperatorType,
} from "@hashintel/block-protocol";
import { AddIcon } from "./Icons";
import { unstable_batchedUpdates } from "react-dom";

const MENU_WIDTH = 540;

export const BlockProtocolFilterOperators: BlockProtocolFilterOperatorType[] = [
  "CONTAINS",
  "DOES_NOT_CONTAIN",
  "IS",
  "IS_NOT",
  "STARTS_WITH",
  "ENDS_WITH",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

export const BlockProtocolMultiFilterOperators: BlockProtocolMultiFilterOperatorType[] =
  ["AND", "OR"];

type FilterDetailProps = {
  columns: ColumnInstance<{}>[];
  onFilter: (
    multiFilter: BlockProtocolAggregateOperationInput["multiFilter"]
  ) => void;
  multiFilter: BlockProtocolAggregateOperationInput["multiFilter"];
};

type FilterFieldsWithId = (NonNullable<
  BlockProtocolAggregateOperationInput["multiFilter"]
>["filters"][number] & { id: string })[];

export const FilterDetail: React.VFC<FilterDetailProps> = ({
  columns,
  onFilter,
  multiFilter,
}) => {
  const [combinatorFilterOperator, setCombinatorFilterOperator] =
    useState<BlockProtocolMultiFilterOperatorType>("AND");
  const [filters, setFilters] = useState<FilterFieldsWithId>([]);

  useEffect(() => {
    if (!multiFilter) return;
    const fieldsWithId = (multiFilter.filters ?? []).map(
      ({ field, value, operator }) => ({
        field,
        value,
        operator,
        id: uuid(),
      })
    );

    console.log(fieldsWithId);

    unstable_batchedUpdates(() => {
      setFilters(fieldsWithId);
      setCombinatorFilterOperator(multiFilter.operator);
    });
  }, [multiFilter]);

  const handleFilter = (filterFields?: FilterFieldsWithId) => {
    const filtersWithoutId = (filterFields ?? filters)
      .filter(({ field }) => Boolean(field))
      .map(({ field, operator, value }) => ({ field, operator, value }));

    onFilter({
      operator: combinatorFilterOperator,
      filters: filtersWithoutId,
    });
  };

  const addField = () => {
    setFilters((prevFields) => [
      ...prevFields,
      {
        field: columns?.[0].id ?? "",
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

  const updateField = (
    id: string,
    data: {
      field?: string;
      value?: string;
      operator?: BlockProtocolFilterOperatorType;
    }
  ) => {
    const updatedFields = filters.map((item) =>
      item.id === id
        ? {
            ...item,
            ...data,
          }
        : item
    );

    setFilters(updatedFields);
    handleFilter(updatedFields);
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
                  onChange={(evt) => {
                    setCombinatorFilterOperator(
                      evt.target.value as BlockProtocolMultiFilterOperatorType
                    );
                  }}
                >
                  {BlockProtocolMultiFilterOperators.map((operator) => {
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
              value={filter.field}
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
                  operator: evt.target.value as BlockProtocolFilterOperatorType,
                })
              }
              value={filter.operator}
            >
              {BlockProtocolFilterOperators.map((operator) => {
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
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 flex-1 px-2`}
              onBlur={(evt) =>
                updateField(filter.id, { value: evt.target.value })
              }
              defaultValue={filter.value}
            />
            <button
              className={tw`ml-4 text-2xl text-gray-300 hover:text-gray-400`}
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
