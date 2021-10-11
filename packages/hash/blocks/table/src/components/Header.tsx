import React, { useState, VFC } from "react";
import { tw } from "twind";
import { BlockProtocolAggregateOperationInput } from "@hashintel/block-protocol";
import { SearchIcon } from "./Icons";
import { SortDetail } from "./SortDetail";
import { ToggleColumnsDetail } from "./ToggleColumnsDetail";
import { FilterDetail } from "./FilterModal";
import { Modal } from "./Modal";
import { ColumnInstance } from "react-table";

export type AggregateArgs = {
  operation: "filter" | "sort" | "changePage";
} & BlockProtocolAggregateOperationInput;

type HeaderProps = {
  columns: ColumnInstance<{}>[];
  onAggregate: (args: AggregateArgs) => void;
  toggleHideColumn: (columnId: string) => void;
};

export const Header: VFC<HeaderProps> = ({
  onAggregate,
  columns,
  toggleHideColumn,
}) => {
  const [sortBy, setSortBy] = useState(() => ({
    field: columns?.[0].id || "",
    desc: false,
  }));
  const [filter, setFilter] = useState(() => ({
    field: columns?.[0].id || "",
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
    <div className={tw`pb-3 relative`}>
      <div className={tw`flex items-center justify-end`}>
        <div className={tw`mr-3`}>
          <Modal label="Filter">
            <FilterDetail columns={columns} />
          </Modal>
        </div>
        <div className={tw`mr-3`}>
          <Modal label="Sort">
            <SortDetail
              columns={columns}
              onSort={(sortFields) =>
                onAggregate({ operation: "sort", sortBy: sortFields })
              }
            />
          </Modal>
        </div>
        <div className={tw`mr-3`}>
          <Modal label="Toggle Columns">
            <ToggleColumnsDetail
              columns={columns}
              toggleHideColumn={toggleHideColumn}
            />
          </Modal>
        </div>
        <div className={tw`relative w-36`}>
          <input
            type="text"
            className={tw`block w-full max-w-full border-1 rounded pl-6 px-2 py-1 text-sm focus:outline-none hover:border-blue-300 focus:border-blue-500`}
            placeholder="Search"
          />
          <SearchIcon
            className={tw`text-gray-500 h-3.5 w-3.5 absolute left-1 top-0 translate-y-1/2`}
          />
        </div>
      </div>
    </div>
  );

  // return (
  //   <div className={tw`p-4`}>
  //     <div className={tw`flex flex-col mt-5 mb-3`}>
  //       {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
  //       <label className={tw`underline`}>Sort Field</label>
  //       <div className={tw`flex items-center`}>
  //         <select
  //           className={tw`mr-5 text-sm border-1 px-2 py-1`}
  //           onChange={(evt) =>
  //             setSortBy((prev) => ({
  //               ...prev,
  //               field: evt.target.value,
  //             }))
  //           }
  //         >
  //           {sortableFields.map((field: string) => (
  //             <option value={field} key={field}>
  //               {field}
  //             </option>
  //           ))}
  //         </select>
  //         {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
  //         <label className={tw`mr-4`}>
  //           <input
  //             type="checkbox"
  //             className={tw`mr-2`}
  //             onChange={(evt) =>
  //               setSortBy((prev) => ({
  //                 ...prev,
  //                 desc: evt.target.checked,
  //               }))
  //             }
  //           />
  //           desc
  //         </label>
  //         <button
  //           type="button"
  //           className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none) rounded no-underline mr-3 text-sm py-1 px-4`}
  //           onClick={() => handleAggregate("sort")}
  //         >
  //           Sort
  //         </button>
  //       </div>
  //     </div>
  //     <div className={tw`flex flex-col mt-5 mb-3`}>
  //       {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
  //       <label className="underline">Filter Field</label>
  //       <div className={tw`flex items-center`}>
  //         <select
  //           className={tw`mr-5 text-sm border-1 px-2 py-1`}
  //           onChange={(evt) =>
  //             setFilter({
  //               field: evt.target.value,
  //               value: "",
  //             })
  //           }
  //         >
  //           {sortableFields.map((field: string) => (
  //             <option value={field} key={field}>
  //               {field}
  //             </option>
  //           ))}
  //         </select>
  //         <input
  //           placeholder="filter query"
  //           className={tw`border-1 px-2 py-0.5 text-sm mr-4`}
  //           onChange={(evt) =>
  //             setFilter((prev) => ({
  //               ...prev,
  //               value: evt.target.value,
  //             }))
  //           }
  //         />
  //         <button
  //           type="button"
  //           className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none) rounded no-underline mr-3 text-sm py-1 px-4`}
  //           onClick={() => handleAggregate("filter")}
  //         >
  //           Filter
  //         </button>
  //       </div>
  //     </div>
  //   </div>
  // );
};
