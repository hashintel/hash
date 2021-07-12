import React, {
  ChangeEvent,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import { Column, Row } from "react-table";
import { identityEntityAndProperty } from "../lib/identifyEntity";
import { BlockProtocolUpdateFn } from "../types/blockProtocol";

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
  if (readOnly) {
    return <span>{initialValue}</span>;
  }

  const [value, setValue] = useState(initialValue);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
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
        entityId: objectToUpdate.id,
        entityType: objectToUpdate.type,
        // @todo shouldn't need this – hash.dev should know it
        namespaceId: objectToUpdate.namespaceId,
      },
    ]);
  };

  // If the initialValue is changed external, sync it up with our state
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onBlur();
        }
      }}
    />
  );
};
