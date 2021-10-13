import React, {
  ChangeEvent,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import { Column, Row } from "react-table";
import { BlockProtocolUpdateFn } from "@hashintel/block-protocol";
import { tw } from "twind";
import { identityEntityAndProperty } from "../lib/identifyEntity";

type EditableCellProps = {
  value: string;
  row: Row;
  column: Column;
  readOnly?: boolean;
  updateData: BlockProtocolUpdateFn;
};

export const EditableCell: VoidFunctionComponent<EditableCellProps> = ({
  value: initialValue,
  row,
  column,
  readOnly,
  updateData,
}) => {
  const [value, setValue] = useState(initialValue);

  // If the initialValue is changed external, sync it up with our state
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  if (readOnly) {
    return <span>{initialValue}</span>;
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  };

  const onBlur = () => {
    const accessorKey = column.id!;
    const { entity: objectToUpdate, property } = identityEntityAndProperty(
      row.original,
      accessorKey
    );

    const newEntity = JSON.parse(JSON.stringify(objectToUpdate));

    // Set a potentially nested property
    const updateKeyChain = property.split(".");
    let objectToModify = newEntity;
    for (let i = 0; i < updateKeyChain.length; i++) {
      const key = updateKeyChain[i];
      if (i === updateKeyChain.length - 1) {
        objectToModify[key] = value;
      } else {
        objectToModify = objectToModify[key];
      }
    }

    updateData([
      {
        data: newEntity,
        entityId: objectToUpdate.entityId,
        entityTypeId: objectToUpdate.entityTypeId,
        // @todo shouldn't need this – hash.dev should know it
        accountId: objectToUpdate.accountId,
      },
    ])?.catch((err) => console.error("Could not update table data: ", err));
  };

  return (
    <input
      className={tw`block w-28 bg-transparent rounded border-1 border-transparent hover:border-blue-500 py-1 px-2 `}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onBlur();
        }
      }}
    />
  );
};
