import React, { useEffect, useState } from "react";
import { AddIcon } from "./Icons";
import { tw } from "twind";
import { ColumnInstance } from "react-table";

type SortDetailProps = {
  columns: ColumnInstance<{}>[];
  onSort: (sortFields: { field: string; desc: boolean }[]) => void;
};

export const SortDetail: React.VFC<SortDetailProps> = ({ columns, onSort }) => {
  const [fields, setFields] = useState<
    { field: string; desc: boolean; id: number }[]
  >([]);

  useEffect(() => {
    onSort(fields);
  }, [fields]);

  const addField = () => {
    setFields((prevFields) => [
      ...prevFields,
      { field: "", desc: false, id: prevFields.length + 1 },
    ]);
  };

  const removeField = (id: number) => {
    setFields((prevFields) =>
      prevFields.filter((property) => property.id != id)
    );
  };

  const updateField = (
    id: number,
    property: { field?: string; desc?: boolean }
  ) => {
    const updatedFields = fields.map((item) =>
      item.id == id
        ? {
            id: item.id,
            field: property.field ?? item.field,
            desc: property.desc ?? item.desc,
          }
        : item
    );

    setFields(updatedFields);
  };

  return (
    <div className={tw`w-96 pt-4 px-4 pb-2`}>
      <p className={tw`text-sm mb-3`}>Sort for</p>

      {fields.map(({ id }) => {
        return (
          <div className={tw`flex mb-4`}>
            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-2 mr-2`}
              onChange={(evt) => updateField(id, { field: evt.target.value })}
            >
              {columns.map((column) => (
                <option value={column.id}>{column.id}</option>
              ))}
            </select>
            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-2`}
              onChange={(evt) =>
                updateField(id, { desc: evt.target.value == "desc" })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              className={tw`ml-auto text-2xl text-gray-300 hover:text-gray-400`}
              onClick={() => removeField(id)}
            >
              &times;
            </button>
          </div>
        );
      })}

      <button
        className={tw`flex w-full items-center text-blue-500 text-sm py-1 px-2 hover:bg-gray-200   focus:outline-none`}
        onClick={addField}
      >
        <AddIcon className={tw`text-current h-4 w-4 mr-2`} />
        <span>Add a sort</span>
      </button>
    </div>
  );
};
