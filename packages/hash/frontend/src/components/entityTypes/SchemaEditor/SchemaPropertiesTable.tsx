import { Schema } from "jsonschema";
import React, { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { SchemaSelectElementType } from "./SchemaEditor";
import { SchemaPropertyRow } from "./SchemaPropertyRow";

type SchemaPropertiesTableProps = {
  requiredArray?: string[];
  schema: Schema;
  SchemaSelect: SchemaSelectElementType;
};

const cellPadding = "pl-4 pr-8 py-4";

const thClasses = tw`sticky first:rounded-tl-2xl last:rounded-tr-2xl ${cellPadding}`;
export const tdClasses = tw`align-top ${cellPadding}`;

export const SchemaPropertiesTable: VoidFunctionComponent<SchemaPropertiesTableProps> =
  ({ schema, requiredArray, SchemaSelect }) => {
    const { properties } =
      schema.type === "array" ? (schema.items as Schema) : schema;

    return (
      <table
        className={tw`max-w-full w-full text-sm text-left border-separate border border-gray-100 rounded-2xl`}
        style={{ borderSpacing: 0 }}
      >
        <thead>
          <tr>
            <th className={thClasses}>Property</th>
            <th className={thClasses}>Expected Type</th>
            <th className={thClasses}>Description</th>
            <th className={thClasses}>Array</th>
            <th className={thClasses}>Required</th>
            <th className={thClasses}>Constraints</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(properties ?? {})?.map(([name, propertySchema]) => {
            const isRequired =
              requiredArray?.includes(name) || !!propertySchema.required;
            return (
              <SchemaPropertyRow
                key={name}
                name={name}
                property={propertySchema}
                required={isRequired}
                SchemaSelect={SchemaSelect}
              />
            );
          })}
        </tbody>
      </table>
    );
  };
