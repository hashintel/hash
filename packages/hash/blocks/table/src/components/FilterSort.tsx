import React, { useState, VFC } from "react";
import { tw } from "twind";
import { BlockProtocolAggregateOperationInput } from "@hashintel/block-protocol";

export type AggregateArgs = {
  operation: "filter" | "sort" | "changePage";
} & BlockProtocolAggregateOperationInput;

type FilterSortProps = {
  sortableFields: string[];
  onAggregate: (args: AggregateArgs) => void;
};

export const FilterSort: VFC<FilterSortProps> = ({
  sortableFields = [],
  onAggregate,
}) => {
  const [sortBy, setSortBy] = useState(() => ({
    field: sortableFields?.[0] || "",
    desc: false,
  }));
  const [filter, setFilter] = useState(() => ({
    field: sortableFields?.[0] || "",
    value: "",
  }));

  const handleAggregate = (operation: "filter" | "sort") => {
    if (operation === "filter") {
      return onAggregate({ operation, filter });
    }

    if (operation === "sort") {
      return onAggregate({ operation, sort: sortBy });
    }
  };

  return (
    <div className={tw`p-4`}>
      <div className={tw`flex flex-col mt-5 mb-3`}>
        <label className={tw`underline`}>Sort Field</label>
        <div className={tw`flex items-center`}>
          <select
            className={tw`mr-5 text-sm border-1 px-2 py-1`}
            onChange={(evt) =>
              setSortBy((prev) => ({
                ...prev,
                field: evt.target.value,
              }))
            }
          >
            {sortableFields.map((field: string) => (
              <option value={field} key={field}>
                {field}
              </option>
            ))}
          </select>
          <label className={tw`mr-4`}>
            <input
              type="checkbox"
              className={tw`mr-2`}
              onChange={(evt) =>
                setSortBy((prev) => ({
                  ...prev,
                  desc: evt.target.checked,
                }))
              }
            />
            desc
          </label>
          <button
            type="button"
            className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none) rounded no-underline mr-3 text-sm py-1 px-4`}
            onClick={() => handleAggregate("sort")}
          >
            Sort
          </button>
        </div>
      </div>
      <div className={tw`flex flex-col mt-5 mb-3`}>
        <label className="underline">Filter Field</label>
        <div className={tw`flex items-center`}>
          <select
            className={tw`mr-5 text-sm border-1 px-2 py-1`}
            onChange={(evt) =>
              setFilter({
                field: evt.target.value,
                value: "",
              })
            }
          >
            {sortableFields.map((field: string) => (
              <option value={field} key={field}>
                {field}
              </option>
            ))}
          </select>
          <input
            placeholder="filter query"
            className={tw`border-1 px-2 py-0.5 text-sm mr-4`}
            onChange={(evt) =>
              setFilter((prev) => ({
                ...prev,
                value: evt.target.value,
              }))
            }
          />
          <button
            type="button"
            className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none) rounded no-underline mr-3 text-sm py-1 px-4`}
            onClick={() => handleAggregate("filter")}
          >
            Filter
          </button>
        </div>
      </div>
    </div>
  );
};
