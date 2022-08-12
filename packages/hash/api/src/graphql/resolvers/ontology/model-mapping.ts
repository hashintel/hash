import {
  DataTypeModel,
  LinkTypeModel,
  PropertyTypeModel,
} from "../../../model";
import {
  PersistedDataType,
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
