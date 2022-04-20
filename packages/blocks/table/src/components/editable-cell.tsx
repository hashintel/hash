import React, {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { Column, Row } from "react-table";
import { BlockProtocolUpdateEntitiesFunction } from "blockprotocol";
import { tw } from "twind";
import { identityEntityAndProperty } from "../lib/identify-entity";

type EditableCellProps = {
  value: string;
  row: Row;
  column: Column;
  readOnly?: boolean;
  updateEntities: BlockProtocolUpdateEntitiesFunction;
};

export const EditableCell: VoidFunctionComponent<EditableCellProps> = ({
  value: initialValue,
  row,
  column,
  readOnly,
  updateEntities,
}) => {
  const [value, setValue] = useState(initialValue);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // If the initialValue is changed external, sync it up with our state
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // dynamically resize text area height
  useEffect(() => {
    if (!textAreaRef.current) return;
    const inputEl = textAreaRef.current;

    inputEl.style.height = "auto";
    inputEl.style.height = `${inputEl.scrollHeight + 2}px`;
  }, [value, textAreaRef]);

  if (readOnly) {
    return <span>{initialValue}</span>;
  }

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  };

  const onBlur = () => {
    const accessorKey = column.id!;
    const { entity: objectToUpdate, property } = identityEntityAndProperty(
      row.original,
      accessorKey,
    );

    const newEntity = JSON.parse(JSON.stringify(objectToUpdate));

    // Set a potentially nested property
    const updateKeyChain = property.split(".");
    let objectToModify = newEntity;
    for (let i = 0; i < updateKeyChain.length; i++) {
      const key = updateKeyChain[i]!;
      if (i === updateKeyChain.length - 1) {
        objectToModify[key] = value;
      } else {
        objectToModify = objectToModify[key];
      }
    }

    updateEntities([
      {
        data: newEntity,
        entityId: objectToUpdate.entityId,
        entityTypeId: objectToUpdate.entityTypeId,
        // @todo shouldn't need this – HASH should know it
        accountId: objectToUpdate.accountId,
      },
      // eslint-disable-next-line no-console -- TODO: consider using logger
    ])?.catch((err) => console.error("Could not update table data: ", err));
  };

  return (
    <textarea
      ref={textAreaRef}
      className={tw`block resize-none w-full bg-transparent rounded border-1 border-transparent hover:border-blue-500 py-1 px-2 -mx-2 w-max max-w-[150px] md:max-w-[300px]`}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onBlur();
        }
      }}
      rows={1}
    />
  );
};
