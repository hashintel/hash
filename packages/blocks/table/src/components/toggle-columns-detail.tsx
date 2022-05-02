import React from "react";
import { ColumnInstance } from "react-table";
import { tw } from "twind";

type ToggleColumnsDetailProps = {
  columns: ColumnInstance<{}>[];
  toggleHideColumn: (columnId: string, value?: boolean) => void;
};

export const ToggleColumnsDetail: React.VFC<ToggleColumnsDetailProps> = ({
  columns,
  toggleHideColumn,
}) => {
  /**
   * @todo fix issue with the popup closing when the label is clicked on
   * @see https://github.com/tailwindlabs/headlessui/issues/514
   */
  return (
    <div className={tw`w-60 pt-4 px-2 pb-2`}>
      <p className={tw`text-sm font-bold mb-3`}>Select columns to display</p>
      <div className={tw`flex flex-col`}>
        {columns.map((column) => (
          <label
            key={column.id}
            className={tw`text-sm leading-none flex items-center mb-3`}
            htmlFor={column.id}
          >
            <input
              id={column.id}
              type="checkbox"
              className={tw`mr-2`}
              onChange={(evt) =>
                toggleHideColumn(column.id, !evt.target.checked)
              }
              checked={column.isVisible}
            />
            {column.id}
          </label>
        ))}
      </div>
    </div>
  );
};
