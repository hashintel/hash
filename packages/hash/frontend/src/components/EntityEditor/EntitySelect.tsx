import React, {
  ChangeEvent,
  HTMLProps,
  useCallback,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import {
  BlockProtocolAggregateFn,
  BlockProtocolEntity,
} from "@hashintel/block-protocol";
import { tw } from "twind";
import Link from "next/link";

import { entityName } from "../../lib/entities";

// @todo make this not need to know about accountId
type MinimalEntity = { accountId: string; entityId: string; name: string };

type EntitySelectProps = {
  aggregate: BlockProtocolAggregateFn;
  allowsMultipleSelections: boolean;
  entityTypeId: string;
  selectedEntities: MinimalEntity[];
  setSelectedEntities: (entities: MinimalEntity[]) => void;
};

const SelectInput: VoidFunctionComponent<
  Required<Pick<HTMLProps<HTMLSelectElement>, "onChange" | "value">> & {
    options: MinimalEntity[];
    defaultLabel: string;
  }
> = ({ defaultLabel, value, onChange, options }) => (
  <select
    className={tw`text-sm border(1 gray-300 focus:gray-500) w-52 focus:outline-none rounded h-8 px-1`}
    value={value}
    onChange={onChange}
  >
    <option value="__remove">{defaultLabel}</option>
    {options.map(({ entityId, name }) => (
      <option key={entityId} value={entityId}>
        {name}
      </option>
    ))}
  </select>
);

/**
 * Allows a user to select one or more entities of a given type
 */
export const EntitySelect: VoidFunctionComponent<EntitySelectProps> = ({
  aggregate,
  allowsMultipleSelections,
  entityTypeId,
  selectedEntities,
  setSelectedEntities,
}) => {
  const [entityOptions, setEntityOptions] = useState<MinimalEntity[]>([]);

  useEffect(() => {
    aggregate({
      entityTypeId,
      operation: {
        itemsPerPage: 100, // @todo paginate
      },
    })
      .then(({ results }) =>
        /**
         * These options purposefully do not filter out entities already selected for a field.
         * Duplicate entities will be valid for some purposes.
         * @todo support users defining the JSON Schema uniqueItems property on an array field
         */
        setEntityOptions(
          (results as BlockProtocolEntity[]).map(
            ({ accountId, entityId, ...properties }) => ({
              accountId,
              entityId,
              name: entityName({ entityId, ...properties }),
            }),
          ),
        ),
      )
      .catch((err) =>
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(
          `Error fetching entities to populate select options: ${err.message}`,
        ),
      );
  }, [aggregate, entityTypeId, selectedEntities]);

  const removeLink = (index: number) => {
    const newSelection: MinimalEntity[] = [
      ...selectedEntities.slice(0, index),
      ...selectedEntities.slice(index + 1),
    ];
    setSelectedEntities(newSelection);
  };

  const onSelectNew = useCallback(
    (evt: ChangeEvent<HTMLSelectElement>) => {
      const selectedEntityId = evt.target.value;
      const newlySelectedEntity = entityOptions.find(
        ({ entityId }) => entityId === selectedEntityId,
      );
      if (
        !newlySelectedEntity &&
        !(!allowsMultipleSelections && selectedEntityId === "__remove")
      ) {
        throw new Error(
          `Could not find entity with id ${selectedEntityId} in options.`,
        );
      }
      let newSelection: MinimalEntity[];
      if (allowsMultipleSelections) {
        newSelection = [...selectedEntities, newlySelectedEntity!];
      } else {
        newSelection = newlySelectedEntity ? [newlySelectedEntity] : [];
      }
      setSelectedEntities(newSelection);
    },
    [
      allowsMultipleSelections,
      entityOptions,
      selectedEntities,
      setSelectedEntities,
    ],
  );

  return (
    <div>
      <SelectInput
        defaultLabel={
          allowsMultipleSelections
            ? "--- Select entity to add ---"
            : "--- Select linked entity ---"
        }
        onChange={onSelectNew}
        options={entityOptions}
        value={allowsMultipleSelections ? "" : selectedEntities[0]?.entityId}
      />
      {allowsMultipleSelections
        ? selectedEntities.map(({ accountId, entityId, name }, index) => (
            // @todo use link position instead of index when dealing with link pagination
            // eslint-disable-next-line react/no-array-index-key
            <div className={tw`flex my-6`} key={`${entityId}-${index}`}>
              <div className={tw`font-bold w-32`}>
                {/*
                 * @todo remove the need for this component to know about links and accountId
                 *    e.g. pass a GoToEntity component into it
                 */}
                <Link href={`/${accountId}/entities/${entityId}`}>
                  <a>{name}</a>
                </Link>
              </div>
              <button
                className={tw`text-red-500 text-sm`}
                onClick={() => removeLink(index)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))
        : null}
    </div>
  );
};
