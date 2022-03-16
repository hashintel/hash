import React, {
  ChangeEvent,
  HTMLProps,
  useCallback,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolEntity,
  BlockProtocolLink,
  JSONObject,
} from "blockprotocol";
import { tw } from "twind";

import {
  CreateLinkFnWithFixedSource,
  DeleteLinkFnWithFixedSource,
} from "./types";
import { entityName } from "../../lib/entities";
import { Link } from "../Link";

// @todo make this not need to know about accountId
type MinimalEntity = { accountId: string; entityId: string; name: string };

type EntitySelectProps = {
  accountId: string;
  aggregateEntities: BlockProtocolAggregateEntitiesFunction;
  allowsMultipleSelections: boolean;
  createLinkFromEntity: CreateLinkFnWithFixedSource;
  deleteLinkFromEntity: DeleteLinkFnWithFixedSource;
  entityTypeId: string;
  linksOnField: {
    linkedEntity: BlockProtocolEntity;
    link: BlockProtocolLink;
  }[];
  path: string;
};

const noSelectionValue = "__none";

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
    <option value={noSelectionValue}>{defaultLabel}</option>
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
export const EntityFieldLinkEditor: VoidFunctionComponent<
  EntitySelectProps
> = ({
  accountId,
  aggregateEntities,
  allowsMultipleSelections,
  createLinkFromEntity,
  deleteLinkFromEntity,
  entityTypeId,
  linksOnField,
  path,
}) => {
  const [entityOptions, setEntityOptions] = useState<MinimalEntity[]>([]);

  useEffect(() => {
    aggregateEntities({
      accountId,
      operation: {
        entityTypeId,
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
          results.map(
            ({ accountId: resultAccountId, entityId, ...properties }) => ({
              accountId: resultAccountId ?? "",
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
  }, [accountId, aggregateEntities, entityTypeId]);

  const onSelectNew = useCallback(
    (evt: ChangeEvent<HTMLSelectElement>) => {
      const selectedEntityId = evt.target.value;
      const newlySelectedEntity = entityOptions.find(
        ({ entityId }) => entityId === selectedEntityId,
      );
      if (
        !newlySelectedEntity &&
        !(!allowsMultipleSelections && selectedEntityId === noSelectionValue)
      ) {
        throw new Error(
          `Could not find entity with id ${selectedEntityId} in options.`,
        );
      }
      /**
       * @todo needs updating when link pagination introduced, to find the last index to insert after
       *    or a way of telling the API 'insert at the end of the list' (omitting index?)
       */
      const lastLinkData = linksOnField[linksOnField.length - 1];
      if (allowsMultipleSelections) {
        void createLinkFromEntity({
          destinationEntityId: selectedEntityId,
          path,
          index: (lastLinkData?.link.index ?? -1) + 1,
        });
      } else {
        if (lastLinkData) {
          void deleteLinkFromEntity({ linkId: linksOnField[0]!.link.linkId });
        }
        if (selectedEntityId !== noSelectionValue) {
          void createLinkFromEntity({
            destinationEntityId: selectedEntityId,
            path,
          });
        }
      }
    },
    [
      allowsMultipleSelections,
      createLinkFromEntity,
      deleteLinkFromEntity,
      entityOptions,
      linksOnField,
      path,
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
        value={
          allowsMultipleSelections
            ? ""
            : linksOnField[0]?.linkedEntity.entityId ?? noSelectionValue
        }
      />
      {allowsMultipleSelections
        ? linksOnField.map(({ link, linkedEntity }) => (
            <div className={tw`flex my-6`} key={link.linkId}>
              <div className={tw`font-bold w-32`}>
                {/*
                 * @todo remove the need for this component to know about links and accountId
                 *    e.g. pass a GoToEntity component into it
                 */}
                <Link
                  href={`/${linkedEntity.accountId}/entities/${linkedEntity.entityId}`}
                >
                  <a>{entityName(linkedEntity as JSONObject)}</a>
                </Link>
              </div>
              <button
                className={tw`text-red-500 text-sm`}
                onClick={() => deleteLinkFromEntity({ linkId: link.linkId })}
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
