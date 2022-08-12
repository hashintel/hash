import {
  DataTypeModel,
  LinkTypeModel,
  PropertyTypeModel,
} from "../../../model";
import {
  IdentifiedDataType,
  IdentifiedLinkType,
  IdentifiedPropertyType,
} from "../../apiTypes.gen";

export const dataTypeModelToGQL = (
  dataType: DataTypeModel,
): IdentifiedDataType => ({
  createdBy: dataType.accountId,
  dataTypeVersionedUri: dataType.schema.$id,
  schema: dataType.schema,
});

export const propertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): IdentifiedPropertyType => ({
  createdBy: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  schema: propertyType.schema,
});

export const linkTypeModelToGQL = (
  linkType: LinkTypeModel,
): IdentifiedLinkType => ({
  createdBy: linkType.accountId,
  linkTypeVersionedUri: linkType.schema.$id,
  schema: linkType.schema,
});
