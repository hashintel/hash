import {
  EmbedderGraphMessageCallbacks,
  Entity,
  Link,
} from "@blockprotocol/graph";
import { JsonObject } from "@blockprotocol/core";
import React, {
  ChangeEvent,
  HTMLProps,
  useCallback,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import { tw } from "twind";

import { CreateLinkFnWithFixedSource } from "./types";
import {
  guessEntityName,
  parseEntityIdentifier,
} from "../../../../../lib/entities";
import { Link as LinkComponent } from "../../../../../shared/ui";

type MinimalEntity = { entityId: string; name: string };

type EntitySelectProps = {
  aggregateEntities: EmbedderGraphMessageCallbacks["aggregateEntities"];
  allowsMultipleSelections: boolean;
  createLinkFromEntity: CreateLinkFnWithFixedSource;
  deleteLinkFromEntity: EmbedderGraphMessageCallbacks["deleteLink"];
  entityTypeId: string;
  linksOnField: {
    linkedEntity: Entity;
    link: Link;
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
      data: {
        operation: {
          entityTypeId,
          itemsPerPage: 100, // @todo paginate
        },
      },
    })
      .then(({ data }) => {
        if (!data) {
          throw new Error("No data returned from aggregateEntitites");
        }

        /**
         * These options purposefully do not filter out entities already selected for a field.
         * Duplicate entities will be valid for some purposes.
         * @todo support users defining the JSON Schema uniqueItems property on an array field
         */
        setEntityOptions(
          data.results.map(({ entityId, ...properties }) => ({
            entityId,
            name: guessEntityName({ entityId, ...properties } as JsonObject),
          })),
        );
      })
      .catch((err) =>
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(
          `Error fetching entities to populate select options: ${err.message}`,
        ),
      );
  }, [aggregateEntities, entityTypeId]);

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
        if (lastLinkData && "linkId" in linksOnField[0]!.link) {
          void deleteLinkFromEntity({
            data: { linkId: linksOnField[0]!.link.linkId },
          });
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
        ? linksOnField.map(({ link, linkedEntity }) => {
            /*
             * @todo remove the need for this component to know about links and accountId
             *    e.g. pass a GoToEntity component into it
             */
            const { accountId, entityId } = parseEntityIdentifier(
              linkedEntity.entityId,
            );
            return (
              <div className={tw`flex my-6`} key={link.linkId}>
                <div className={tw`font-bold w-32`}>
                  <LinkComponent href={`/${accountId}/entities/${entityId}`}>
                    <a>{guessEntityName(linkedEntity as JsonObject)}</a>
                  </LinkComponent>
                </div>
                <button
                  className={tw`text-red-500 text-sm`}
                  onClick={() =>
                    deleteLinkFromEntity({ data: { linkId: link.linkId } })
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            );
          })
        : null}
    </div>
  );
};
