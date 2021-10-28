import JSONSchemaForm from "@rjsf/material-ui";
import jsonpath from "jsonpath";
import { FormEvent, VoidFunctionComponent } from "react";
import {
  BlockProtocolAggregateFn,
  BlockProtocolProps,
  JSONObject,
} from "@hashintel/block-protocol";
import { unset } from "lodash";
import { ISubmitEvent } from "@rjsf/core";
import { tw } from "twind";
import { EntityLink } from "./types";
import { entityName } from "../../lib/entities";

type EntityEditorProps = {
  aggregate: BlockProtocolAggregateFn;
  disabled?: boolean;
  readonly?: boolean;
  schema: JSONObject;
} & (
  | Required<Pick<BlockProtocolProps, "create" | "entityTypeId">>
  | Required<
      Pick<BlockProtocolProps, "entityId" | "update"> & {
        entityProperties: JSONObject;
      }
    >
);

/**
 * Schemas id themselves and other schemas with a URI.
 * HASH schemas contain the entityTypeId in this URI
 * @todo handle references to schemas hosted elsewhere
 */
const typeIdFromSchemaRef = ($ref: string) =>
  $ref
    .split("/")
    .pop()!
    .replace(/\.json$/, "");

/**
 * Splits a schema into property paths which are expected to link to other entities,
 * and the residual schema for properties which are persisted on this entity directly.
 * JSON Schema Form crashes on external $
 * @todo support anyOf arrays that allow multiple $refs or $refs alongside other types
 */
const splitSchema = (
  schema: JSONObject
): {
  links: EntityLink[];
  schemaWithoutLinks: JSONObject;
} => {
  const clone = JSON.parse(JSON.stringify(schema));

  // get all $refs which link to other schemas
  // @todo handle $refs inside $defs
  const links: EntityLink[] = jsonpath
    .nodes(schema, "$..['$ref']")
    .filter((ref) => !ref.value.startsWith("#"))
    .map(({ path, value }) => ({
      // drop the leading $ and the final $ref. convert array indices to strings for lodash methods
      path: path.slice(1, -1).map((part) => part.toString()),
      // we only care about the internal entityTypeId, not the schema's external URI
      // @todo handle fields with multiple permitted type ids
      permittedTypeIds: [typeIdFromSchemaRef(value)],
    }));

  // remove the properties which link to other schemas from the clone
  links.forEach(({ path }) => unset(clone, path));

  /**
   *  Remove the 2020 version we otherwise use, because react json schema form can't handle it
   *  @see https://github.com/rjsf-team/react-jsonschema-form/issues/2241
   *  @todo fix this - could use the 2019 version once RJSF supports it (we don't really need to use 2020)
   */
  delete clone.$schema;

  return {
    links,
    schemaWithoutLinks: clone,
  };
};

export const EntityEditor: VoidFunctionComponent<EntityEditorProps> = ({
  disabled,
  readonly,
  schema,
  ...entityProps
}) => {
  const existingData =
    "entityProperties" in entityProps
      ? entityProps.entityProperties
      : undefined;

  const onSubmit = (args: ISubmitEvent<any>, event: FormEvent) => {
    event.preventDefault();
    if ("entityId" in entityProps) {
      entityProps
        .update([
          {
            data: {
              ...existingData,
              ...args.formData,
            },
            entityId: entityProps.entityId,
          },
        ])
        .catch((err) => console.error(`Error creating entity: ${err.message}`));
    } else {
      entityProps
        .create([
          { data: args.formData, entityTypeId: entityProps.entityTypeId },
        ])
        .catch((err) => console.error(`Error updating entity: ${err.message}`));
    }
  };

  const { links: _links, schemaWithoutLinks } = splitSchema(schema);

  const name = existingData
    ? entityName({ properties: existingData })
    : "Entity";

  return (
    <div>
      <div className={tw`mb-12`}>
        <h2>{name}'s properties</h2>
        <JSONSchemaForm
          disabled={disabled}
          formData={existingData}
          onSubmit={onSubmit}
          readonly={readonly}
          schema={schemaWithoutLinks}
        />
      </div>
      <div>
        <h2>Links from {name}</h2>
      </div>
    </div>
  );
};
