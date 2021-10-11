import React, { useState } from "react";
import { AddIcon } from "./Icons";
import { tw } from "twind";
import { v4 as uuid } from "uuid";
import { Modal } from "./Modal";
import { ColumnInstance } from "react-table";

const OPERATIONS = [
  {
    label: "Is",
    value: "IS",
  },
  {
    label: "Is Not",
    value: "IS_NOT",
  },
  {
    label: "Contains",
    value: "CONTAINS",
  },
  {
    label: "Does not contain",
    value: "DOES_NOT_CONTAIN",
  },
  {
    label: "Starts with",
    value: "STARTS_WITH",
  },
  {
    label: "Ends with",
    value: "ENDS_WITH",
  },
  {
    label: "Is empty",
    value: "IS_EMPTY",
  },
  {
    label: "Is not empty",
    value: "IS_NOT_EMPTY",
  },
] as const;

type FilterDetailProps = {
  columns: ColumnInstance<{}>[];
};

export const FilterDetail: React.VFC<FilterDetailProps> = ({ columns }) => {
  const [operation, setOperation] = useState("And");
  const [fields, setFields] = useState<
    {
      property: string;
      operator: typeof OPERATIONS[number]["value"];
      value: string;
      id: string;
    }[]
  >([]);

  const addField = () => {
    setFields((prevFields) => [
      ...prevFields,
      {
        property: columns?.[0].id ?? "",
        operator: "CONTAINS",
        value: "",
        id: uuid(),
      },
    ]);
  };

  const removeField = (id: string) => {
    setFields((prevFields) =>
      prevFields.filter((property) => property.id != id)
    );
  };

  const updateField = (
    id: string,
    data: {
      property?: string;
      value?: string;
      operator?: typeof OPERATIONS[number]["value"];
    }
  ) => {
    const updatedFields = fields.map((item) =>
      item.id == id
        ? {
            id: item.id,
            property: data.property ?? item.property,
            value: data.value ?? item.value,
            operator: data.operator ?? item.operator,
          }
        : item
    );

    setFields(updatedFields);
  };

  return (
    <div style={{ width: 540 }} className={tw`pt-4 px-4 pb-2`}>
      <p className={tw`text-sm mb-3`}>Filters For </p>

      {fields.map(({ id }, index) => {
        return (
          <div key={id} className={tw`flex items-center mb-4`}>
            <div className={tw`w-14 mr-2`}>
              {index == 0 ? (
                <span className={tw`text-sm px-1`}>Where</span>
              ) : (
                <select
                  className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 px-1`}
                  value={operation}
                  onChange={(evt) => setOperation(evt.target.value)}
                >
                  <option value="And">And</option>
                  <option value="Or">Or</option>
                </select>
              )}
            </div>

            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) w-28 focus:outline-none rounded h-8 px-2 mr-2`}
              onChange={(evt) =>
                updateField(id, { property: evt.target.value })
              }
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.id}
                </option>
              ))}
            </select>
            <select
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 w-28 px-2 mr-2`}
              onChange={(evt) =>
                updateField(id, {
                  operator: evt.target
                    .value as typeof OPERATIONS[number]["value"],
                })
              }
            >
              {OPERATIONS.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              placeholder="Value"
              className={tw`text-sm border(1 gray-300 focus:gray-500) focus:outline-none rounded h-8 w-40 px-2`}
              onChange={(evt) => updateField(id, { value: evt.target.value })}
            />
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
        className={tw`flex w-full items-center text-blue-500 text-sm py-1 px-2 hover:bg-gray-200 focus:outline-none`}
        onClick={addField}
      >
        <AddIcon className={tw`text-current h-4 w-4 mr-2`} />
        <span>Add a Filter</span>
      </button>
    </div>
  );
};
