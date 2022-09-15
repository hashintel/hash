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
  PropertyTypeRootedSubgraph,
  EntityTypeRootedSubgraph,
} from "../../apiTypes.gen";

export const dataTypeModelToGQL = (
  dataType: DataTypeModel,
): PersistedDataType => ({
  accountId: dataType.accountId,
  dataTypeVersionedUri: dataType.schema.$id,
  dataType: dataType.schema,
});

export const propertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): PersistedPropertyType => ({
  accountId: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  propertyType: propertyType.schema,
});

export const propertyTypeRootedSubgraphToGQL = ({
  propertyType,
  referencedDataTypes,
  referencedPropertyTypes,
}: {
  propertyType: PropertyTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
}): PropertyTypeRootedSubgraph => ({
  accountId: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  propertyType: propertyType.schema,
  referencedDataTypes: referencedDataTypes.map(dataTypeModelToGQL),
  referencedPropertyTypes: referencedPropertyTypes.map(propertyTypeModelToGQL),
});

export const linkTypeModelToGQL = (
  linkType: LinkTypeModel,
): PersistedLinkType => ({
  accountId: linkType.accountId,
  linkTypeVersionedUri: linkType.schema.$id,
  linkType: linkType.schema,
});

export const entityTypeModelToGQL = (
  entityType: EntityTypeModel,
): PersistedEntityType => ({
  accountId: entityType.accountId,
  entityTypeVersionedUri: entityType.schema.$id,
  entityType: entityType.schema,
});

export const entityTypeRootedSubgraphToGQL = (params: {
  entityType: EntityTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
  referencedLinkTypes: LinkTypeModel[];
  referencedEntityTypes: EntityTypeModel[];
}): EntityTypeRootedSubgraph => ({
  accountId: params.entityType.accountId,
  entityTypeVersionedUri: params.entityType.schema.$id,
  entityType: params.entityType.schema,
  referencedDataTypes: params.referencedDataTypes.map(dataTypeModelToGQL),
  referencedPropertyTypes: params.referencedPropertyTypes.map(
    propertyTypeModelToGQL,
  ),
  referencedLinkTypes: params.referencedLinkTypes.map(linkTypeModelToGQL),
  referencedEntityTypes: params.referencedEntityTypes.map(entityTypeModelToGQL),
});
