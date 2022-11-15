import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
  FunctionComponent,
} from "react";
import { Column, Row } from "react-table";
import { Entity, GraphBlockHandler } from "@blockprotocol/graph";
import { tw } from "twind";
import { identityEntityAndProperty } from "../lib/identify-entity";

type EditableCellProps = {
  value: string;
  row: Row;
  column: Column;
  readOnly?: boolean;
  updateEntity?: GraphBlockHandler["updateEntity"];
};

export const EditableCell: FunctionComponent<EditableCellProps> = ({
  value: initialValue,
  row,
  column,
  readOnly,
  updateEntity,
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

    const newEntity = JSON.parse(JSON.stringify(objectToUpdate)) as Entity;

    // Set a potentially nested property
    const updateKeyChain = property.split(".");
    let objectToModify = newEntity;
    for (let i = 0; i < updateKeyChain.length; i++) {
      const key = updateKeyChain[i]!;
      if (i === updateKeyChain.length - 1) {
        // @ts-expect-error -- consider refactoring in a type-safe way
        objectToModify[key] = value;
      } else {
        // @ts-expect-error -- consider refactoring in a type-safe way
        objectToModify = objectToModify[key] as unknown;
      }
    }

    void updateEntity?.({
      data: {
        entityId: newEntity.entityId,
        properties: newEntity.properties,
      },
    });
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
