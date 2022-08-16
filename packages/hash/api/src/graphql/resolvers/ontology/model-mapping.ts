import {
  DataTypeModel,
  EntityTypeModel,
  LinkTypeModel,
  PropertyTypeModel,
} from "../../../model";
import {
  PersistedDataType,
  PersistedEntityType,
  PersistedLinkType,
  PersistedPropertyType,
} from "../../apiTypes.gen";

export const dataTypeModelToGQL = (
  dataType: DataTypeModel,
): PersistedDataType => ({
  createdBy: dataType.accountId,
  dataTypeVersionedUri: dataType.schema.$id,
  schema: dataType.schema,
});

export const propertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): PersistedPropertyType => ({
  createdBy: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  schema: propertyType.schema,
});

export const linkTypeModelToGQL = (
  linkType: LinkTypeModel,
): PersistedLinkType => ({
  createdBy: linkType.accountId,
  linkTypeVersionedUri: linkType.schema.$id,
  schema: linkType.schema,
});

export const entityTypeModelToGQL = (
  entityType: EntityTypeModel,
): PersistedEntityType => ({
  createdBy: entityType.accountId,
  entityTypeVersionedUri: entityType.schema.$id,
  schema: entityType.schema,
});
