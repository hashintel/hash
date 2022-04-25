import React, { useEffect, useState } from "react";
import { tw } from "twind";
import { ColumnInstance } from "react-table";
import { v4 as uuid } from "uuid";
import { BlockProtocolAggregateOperationInput } from "blockprotocol";
import { AddIcon } from "./icons";

type SortDetailProps = {
  columns: ColumnInstance<{}>[];
  onSort: (
    sortFields: NonNullable<BlockProtocolAggregateOperationInput["multiSort"]>,
  ) => void;
  multiSort: BlockProtocolAggregateOperationInput["multiSort"];
};

type SortFieldsWithId = (NonNullable<
  BlockProtocolAggregateOperationInput["multiSort"]
>[number] & {
  id: string;
})[];

export const SortDetail: React.VFC<SortDetailProps> = ({
  columns,
  onSort,
  multiSort,
}) => {
  const [fields, setFields] = useState<SortFieldsWithId>([]);

  useEffect(() => {
    if (!multiSort) return;
    const fieldsWithId = multiSort.map(({ field, desc }) => ({
      field,
      desc,
      id: uuid(),
    }));
    setFields(fieldsWithId);
  }, [multiSort]);

  const handleSort = (sortFields?: SortFieldsWithId) => {
    const fieldsWithoutId = (sortFields ?? fields)
      .filter(({ field }) => Boolean(field))
      .map(({ field, desc }) => ({ field, desc }));

    onSort(fieldsWithoutId);
  };

  const addField = () => {
    setFields((prevFields) => [
      ...prevFields,
      { field: "", desc: false, id: uuid() },
    ]);
  };

  const removeField = (id: string) => {
    const newFields = fields.filter((property) => property.id !== id);
    setFields(newFields);
    handleSort(newFields);
  };

  const updateField = (
    id: string,
    property: { field?: string; desc?: boolean },
  ) => {
    const updatedFields = fields.map((item) =>
      item.id === id
        ? {
            id: item.id,
            field: property.field ?? item.field,
            desc: property.desc ?? item.desc,
          }
        : item,
    );

    setFields(updatedFields);
    handleSort(updatedFields);
  };

  return (
    <div className={tw`w-96 pt-4 px-4 pb-2`}>
      <p className={tw`text-sm mb-3`}>Sort for</p>

      {fields.map(({ id, field, desc }) => {
        return (
          <div key={id} className={tw`flex mb-4`}>
            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-2 mr-2`}
              onChange={(evt) => updateField(id, { field: evt.target.value })}
              value={field}
            >
              <option value="">---</option>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.id}
                </option>
              ))}
            </select>
            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-2`}
              onChange={(evt) =>
                updateField(id, { desc: evt.target.value === "desc" })
              }
              value={desc ? "desc" : "asc"}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              className={tw`ml-auto text-2xl text-gray-300 hover:text-gray-400`}
              onClick={() => removeField(id)}
              type="button"
            >
              &times;
            </button>
          </div>
        );
      })}

      <button
        className={tw`flex w-full items-center text-blue-500 text-sm py-1 px-2 hover:bg-gray-200   focus:outline-none`}
        onClick={addField}
        type="button"
      >
        <AddIcon className={tw`text-current h-4 w-4 mr-2`} />
        <span>Add a sort</span>
      </button>
    </div>
  );
};
