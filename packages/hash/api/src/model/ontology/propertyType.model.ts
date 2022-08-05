import {
  PropertyType as PropertyTypeSchema,
  GraphApi,
} from "@hashintel/hash-graph-client";

import { PropertyType as PropertyTypeModel } from "../index";

type PropertyTypeArgs = {
  accountId: string;
  schema: PropertyTypeSchema;
};

class __PropertyType {
  accountId: string;

  schema: PropertyTypeSchema;

  constructor({ schema, accountId }: PropertyTypeArgs) {
    this.accountId = accountId;
    this.schema = schema;
  }

  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: PropertyTypeSchema;
    },
  ): Promise<PropertyTypeModel> {
    const { data: schema } = await graphApi.createPropertyType(params);

    return new PropertyTypeModel({ schema, accountId: params.accountId });
  }

  static async getAllLatest(
    graphApi: GraphApi,
    params: { accountId: string },
  ): Promise<PropertyTypeModel[]> {
    /** @todo: get all latest property types in specified account */
    const { data: schemas } = await graphApi.getLatestPropertyTypes();

    throw schemas.map(
      (schema) =>
        new PropertyTypeModel({ schema, accountId: params.accountId }),
    );
  }

  static async get(
    graphApi: GraphApi,
    params: {
      accountId: string;
      versionedUri: string;
    },
  ): Promise<PropertyTypeModel> {
    const { accountId, versionedUri } = params;
    const { data: schema } = await graphApi.getPropertyType(versionedUri);

    return new PropertyTypeModel({ schema, accountId });
  }

  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: PropertyTypeSchema;
    },
  ): Promise<PropertyTypeModel> {
    const { accountId } = params;

    const { data: schema } = await graphApi.updatePropertyType(params);

    return new PropertyTypeModel({ schema, accountId });
  }
}

export default __PropertyType;
