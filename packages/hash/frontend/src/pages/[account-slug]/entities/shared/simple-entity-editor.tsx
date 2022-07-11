import { MuiForm5 as JSONSchemaForm } from "@rjsf/material-ui";
import jsonpath from "jsonpath";
import { FormEvent, useMemo, VoidFunctionComponent } from "react";
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolProps,
  JSONObject,
} from "blockprotocol";
import { unset } from "lodash";
import { ISubmitEvent } from "@rjsf/core";
import { tw } from "twind";

import {
  CreateLinkFnWithFixedSource,
  DeleteLinkFnWithFixedSource,
  EntityLinkDefinition,
} from "./simple-entity-editor/types";
import { EntityLinksEditor } from "./simple-entity-editor/entity-links-editor";
import { guessEntityName } from "../../../../lib/entities";

type SimpleEntityEditorProps = {
  accountId: string; // @todo figure out if accountId is a part of the protocol or not
  aggregateEntities: BlockProtocolAggregateEntitiesFunction;
  disabled?: boolean;
  readonly?: boolean;
  refetchEntity?: () => void; // @todo handle this via the collab server or some other way
  schema: JSONObject;
} & (
  | /** @todo handle creating links along with a new entity - needs API provision for this */
  Required<Pick<BlockProtocolProps, "createEntities" | "entityTypeId">> // for new entities
  | Required<
      // for existing entities
      Pick<
        BlockProtocolProps,
        | "entityId"
        | "linkedEntities"
        | "linkGroups"
        | "updateEntities"
        | "createLinks"
        | "deleteLinks"
      > & {
        entityProperties: JSONObject;
      }
    >
);

/**
 * Schemas refer to other schemas (and themselves) with a URI.
 * HASH schemas contain the entityTypeId in this URI - this fn extracts it.
 * @todo handle pointers to subschemas
 * @todo handle references to schemas hosted elsewhere
 * @todo should we just store the entityTypeid in the schema itself in a special field?
 */
const typeIdFromSchemaRef = ($ref: string) =>
  $ref
    .split("/")
    .pop()!
    .replace(/\.json$/, "");

/**
 * Splits a schema into property paths which are expected to link to other entities,
 * and the residual schema for properties which are persisted on this entity directly.
 * JSON Schema Form crashes on external refs
 * @todo support anyOf arrays that allow multiple $refs or $refs alongside other types
 */
const splitSchema = (
  schema: JSONObject,
): {
  linksInSchema: EntityLinkDefinition[];
  schemaWithoutLinks: JSONObject;
} => {
  const clone = JSON.parse(JSON.stringify(schema));

  // get all $refs which link to other schemas
  // @todo handle $refs inside $defs
  const linksInSchema: EntityLinkDefinition[] = jsonpath
    .nodes(schema, "$..['$ref']")
    .filter((ref) => !ref.value.startsWith("#"))
    .map(({ path, value }) => {
      // drop the final $ref. convert array indices to strings for lodash methods
      const pathToField = path.slice(0, -1).map((part) => part.toString());

      let array = false;
      /**
       * Check if this is the value for 'items' in a schema entry which has type 'array'.
       * It looks like this (omitting the tree above [field]):
       * {
       *   [field]: {
       *     type: "array",
       *     items: { "$ref": "https://domain.com/path-to-schema" }
       *   }
       * }
       *
       * A $ref not in an array field will look like this:
       * {
       *   [field]: { "$ref": "https://domain.com/path-to-schema" }
       * }
       */

      if (pathToField[pathToField.length - 1] === "items") {
        const schemaEntry = jsonpath.value(
          schema,
          pathToField.slice(0, pathToField.length - 1).join("."),
        );
        if (schemaEntry.type === "array") {
          array = true;
          // we want to end up with [field] at the end of the path
          pathToField.pop();
        }
      }

      return {
        array,
        path: pathToField,
        /**
         * we only care about the internal entityTypeId, not the schema's external URI
         * @todo handle fields with multiple permitted type ids
         */
        permittedTypeIds: [typeIdFromSchemaRef(value)],
      };
    });

  // remove the properties which link to other schemas from the clone
  linksInSchema.forEach(
    ({ path }) => unset(clone, path.slice(1)), // don't send the leading $ to lodash
  );

  /**
   *  remove the 'properties' field, as this isn't part of the json path that links use
   *  @todo check when handling $refs inside $defs, might need to check and take a different approach
   */
  linksInSchema.forEach(({ path }) => path.splice(1, 1));

  /**
   *  Remove the 2019 version we otherwise use, because react json schema form can't handle it
   *  @see https://github.com/rjsf-team/react-jsonschema-form/issues/2241
   *  @todo fix this once RJSF supports it
   */
  delete clone.$schema;

  return {
    linksInSchema,
    schemaWithoutLinks: clone,
  };
};

export const SimpleEntityEditor: VoidFunctionComponent<
  SimpleEntityEditorProps
> = ({
  accountId,
  aggregateEntities: aggregate,
  disabled,
  readonly,
  refetchEntity,
  schema,
  ...entityProps
}) => {
  const {
    createLinks = undefined,
    deleteLinks = undefined,
    entityId = undefined,
    entityProperties: existingProperties = undefined,
    linkedEntities = [],
    linkGroups: existingLinkGroups = [],
  } = "entityProperties" in entityProps ? entityProps : {};

  const onSubmit = (args: ISubmitEvent<any>, event: FormEvent) => {
    event.preventDefault();
    if ("entityId" in entityProps) {
      entityProps
        .updateEntities([
          {
            accountId,
            data: {
              ...existingProperties,
              ...args.formData,
            },
            entityId: entityProps.entityId,
          },
        ])
        // eslint-disable-next-line no-console -- TODO: consider using logger
        .catch((err) => console.error(`Error creating entity: ${err.message}`));
    } else {
      if (!entityProps.entityTypeId) {
        throw new Error("entityTypeId is required to create a new entity.");
      }
      entityProps
        .createEntities([
          {
            accountId,
            data: args.formData,
            entityTypeId: entityProps.entityTypeId,
          },
        ])
        // eslint-disable-next-line no-console -- TODO: consider using logger
        .catch((err) => console.error(`Error updating entity: ${err.message}`));
    }
  };

  const { linksInSchema, schemaWithoutLinks } = useMemo(
    () => splitSchema(schema),
    [schema],
  );

  const name = existingProperties
    ? guessEntityName({ properties: existingProperties })
    : "New Entity";

  const createLinkWithFixedSource: CreateLinkFnWithFixedSource | undefined =
    createLinks && entityId
      ? (action) =>
          createLinks([
            {
              ...action,
              sourceAccountId: accountId,
              sourceEntityId: entityId,
            },
          ]).then((res) => {
            refetchEntity?.();
            return res;
          })
      : undefined;

  const deleteLinkWithFixedSource: DeleteLinkFnWithFixedSource | undefined =
    deleteLinks && entityId
      ? (action) =>
          deleteLinks([
            {
              ...action,
              sourceAccountId: accountId,
            },
          ]).then((res) => {
            refetchEntity?.();
            return res;
          })
      : undefined;

  return (
    <div>
      <div className={tw`mb-12`}>
        <h2>
          <em>{name}</em>'s properties
        </h2>
        <JSONSchemaForm
          disabled={disabled}
          formData={existingProperties}
          onSubmit={onSubmit}
          readonly={readonly}
          schema={schemaWithoutLinks}
        />
      </div>
      {/* @todo allow creation of links when creating an entity for the first time */}
      {createLinkWithFixedSource &&
      deleteLinkWithFixedSource &&
      refetchEntity ? (
        <div>
          <h2>
            Entities linked from <em>{name}</em>
          </h2>
          <EntityLinksEditor
            accountId={accountId}
            aggregateEntities={aggregate}
            createLinkFromEntity={createLinkWithFixedSource}
            deleteLinkFromEntity={deleteLinkWithFixedSource}
            existingLinkGroups={existingLinkGroups}
            linksInSchema={linksInSchema}
            linkedEntities={linkedEntities}
          />
        </div>
      ) : null}
    </div>
  );
};
