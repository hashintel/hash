import { BlockProtocolProps } from "@hashintel/block-protocol";
import Link from "next/link";
import { Schema as JsonSchema } from "jsonschema";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { get } from "lodash";

import { SchemaPropertiesTable } from "./SchemaPropertiesTable";

export type SchemaSelectElementType = VoidFunctionComponent<{
  schemaRef: string;
}>;

type JsonSchemaEditorProps = {
  schema: JsonSchema;
  SchemaSelect: SchemaSelectElementType;
  subSchemaReference?: string;
} & Pick<BlockProtocolProps, "entityId" | "update">;

export const SchemaEditor: VoidFunctionComponent<JsonSchemaEditorProps> = ({
  schema,
  SchemaSelect,
  subSchemaReference,
  update: _update,
}) => {
  const { description, required, title } = schema;

  /**
   * @todo deal with $anchors https://json-schema.org/understanding-json-schema/structuring.html#anchor
   */
  const selectedSchema = subSchemaReference
    ? get(schema, subSchemaReference.slice(2).replace(/\//g, "."))
    : schema;

  const requiredArray = required instanceof Array ? required : undefined;

  return (
    <div>
      <header className={tw`mb-12`}>
        <h1>
          <strong>{title ?? "No title."}</strong>
        </h1>
        <p>{description ?? "No description."}</p>
      </header>
      <section>
        <div className={tw`flex items-center`}>
          <h2>
            Properties of <Link href={schema.$id ?? "#"}>{title}</Link>
          </h2>
          {subSchemaReference && (
            <h3 className={tw`mb-7 ml-2`}>{` > ${subSchemaReference
              .split("/")
              .pop()}`}</h3>
          )}
        </div>
        <div>
          <SchemaPropertiesTable
            requiredArray={requiredArray}
            schema={selectedSchema}
            SchemaSelect={SchemaSelect}
          />
        </div>
      </section>
    </div>
  );
};
