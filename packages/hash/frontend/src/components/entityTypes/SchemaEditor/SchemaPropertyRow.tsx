import { Schema } from "jsonschema";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";

import { tdClasses } from "./SchemaPropertiesTable";
import { SchemaPropertyTypeList } from "./SchemaPropertyTypeList";
import { SchemaSelectElementType } from "./SchemaEditor";

type SchemaPropertyRowProps = {
  name: string;
  property: Schema;
  required: boolean;
  SchemaSelect: SchemaSelectElementType;
};

export const SchemaPropertyRow: VoidFunctionComponent<
  SchemaPropertyRowProps
> = ({ name, property, required, SchemaSelect }) => {
  const isArray = property.type === "array";

  /**
   * @todo deal with tuples and other array keywords, e.g. preferredItems
   */
  const { description, $ref, type, properties, ...constraints } = isArray
    ? (property.items as Schema)
    : property;

  return (
    <tr
      className={tw`border border-gray-100 rounded-2xl odd:bg-gray-50 even:bg-gray-100`}
      key={name}
    >
      <td className={tdClasses}>{name}</td>
      <td className={tdClasses}>
        <SchemaPropertyTypeList
          hasSubSchema={!!properties}
          propertyName={name}
          SchemaSelect={SchemaSelect}
          $ref={$ref}
          type={type}
        />
      </td>
      <td className={tdClasses}>{description}</td>
      <td className={tdClasses}>{isArray ? "Yes" : "No"}</td>
      <td className={tdClasses}>{required ? "Yes" : "No"}</td>
      <td className={tdClasses}>
        {/* @todo constraints may appear on any in a list of types, need to display this multiple times */}
        {Object.entries(constraints).map(([typeName, value]) => (
          <div key={typeName}>
            {typeName}: {value}
          </div>
        ))}
      </td>
    </tr>
  );
};
