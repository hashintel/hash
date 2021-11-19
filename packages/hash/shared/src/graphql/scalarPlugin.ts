/**
 * Based on a GitHub project not on npm
 *
 * @see https://github.com/homebound-team/graphql-typescript-scalar-type-policies
 */

import {
  GraphQLField,
  GraphQLObjectType,
  GraphQLNamedType,
  GraphQLScalarType,
  GraphQLType,
  isNonNullType,
} from "graphql";
import { code, imp } from "ts-poet";
import { PluginFunction, Types } from "@graphql-codegen/plugin-helpers";

export function isObjectType(
  type: GraphQLNamedType,
): type is GraphQLObjectType {
  return type instanceof GraphQLObjectType;
}

export function isScalarType(type: GraphQLType): type is GraphQLScalarType {
  return type instanceof GraphQLScalarType;
}

// Maps the graphql-code-generation convention of `@src/context#Context` to ts-poet's `Context@@src/context`.
export function toImp(spec: string | undefined): unknown {
  if (!spec) {
    return undefined;
  }
  const [path, symbol] = spec.split("#");
  return imp(`${symbol}@${path}`);
}

/** The config values we read from the graphql-codegen.yml file. */
export type Config = {
  scalars: Record<string, string>;
  scalarTypePolicies: Record<string, string>;
};

/** Generates field policies for user-defined types, i.e. Date handling. */
export const plugin: PluginFunction<Config> = async (schema, _, config) => {
  const { scalarTypePolicies = {} } = config || {};

  function isScalarWithTypePolicy(field: GraphQLField<any, any>): boolean {
    let type = field.type;
    if (isNonNullType(type)) {
      type = type.ofType;
    }
    return isScalarType(type) && scalarTypePolicies[type.name] !== undefined;
  }

  const content = await code`
    export const scalarTypePolicies = {
      ${Object.values(schema.getTypeMap())
        .filter(isObjectType)
        .filter((type) => !type.name.startsWith("__"))
        .filter((type) =>
          Object.values(type.getFields()).some(isScalarWithTypePolicy),
        )
        .map((type) => {
          return code`${type.name}: { fields: { ${Object.values(
            type.getFields(),
          )
            .filter(isScalarWithTypePolicy)
            .map((field) => {
              let fieldType = field.type;
              if (isNonNullType(fieldType)) {
                fieldType = fieldType.ofType;
              }
              return code`${field.name}: ${toImp(
                scalarTypePolicies[(fieldType as any).name],
              )},`;
            })} } },`;
        })}
    };
  `.toStringWithImports();
  return { content } as Types.PluginOutput;
};
