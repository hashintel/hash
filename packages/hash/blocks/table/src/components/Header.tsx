import React, { VFC } from "react";
import { tw } from "twind";
import { BlockProtocolAggregateOperationInput } from "blockprotocol";
import { ColumnInstance } from "react-table";
import { SearchIcon } from "./Icons";
import { SortDetail } from "./SortDetail";
import { ToggleColumnsDetail } from "./ToggleColumnsDetail";
import { FilterDetail } from "./FilterDetail";
import { Menu } from "./Menu";

export type AggregateArgs = {
  operation: "filter" | "sort" | "changePageSize";
} & BlockProtocolAggregateOperationInput;

type HeaderProps = {
  columns: ColumnInstance<{}>[];
  onAggregate: (args: AggregateArgs) => void;
  toggleHideColumn: (columnId: string) => void;
  aggregateOptions: Pick<
    BlockProtocolAggregateOperationInput,
    "multiFilter" | "multiSort"
  >;
  entityTypeDropdown: React.ReactNode;
};

export const Header: VFC<HeaderProps> = ({
  onAggregate,
  columns,
  toggleHideColumn,
  aggregateOptions,
  entityTypeDropdown,
}) => {
  return (
    <div className={tw`pb-3 relative z-0`}>
      <div className={tw`flex items-center`}>
        <div className={tw`mr-3 flex-grow-1`}>{entityTypeDropdown}</div>
        <div className={tw`mr-3`}>
          <Menu label="Filter">
            <FilterDetail
              columns={columns}
              onFilter={(filters) =>
                onAggregate({ operation: "filter", multiFilter: filters })
              }
              multiFilter={aggregateOptions.multiFilter}
            />
          </Menu>
        </div>
        <div className={tw`mr-3`}>
          <Menu label="Sort">
            <SortDetail
              columns={columns}
              onSort={(sortFields) =>
                onAggregate({ operation: "sort", multiSort: sortFields })
              }
              multiSort={aggregateOptions.multiSort}
            />
          </Menu>
        </div>
        <div className={tw`mr-3`}>
          <Menu label="Toggle Columns">
            <ToggleColumnsDetail
              columns={columns}
              toggleHideColumn={toggleHideColumn}
            />
          </Menu>
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
};
