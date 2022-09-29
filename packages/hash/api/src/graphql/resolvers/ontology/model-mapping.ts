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

export const mapDataTypeModelToGQL = (
  dataType: DataTypeModel,
): PersistedDataType => ({
  ownedById: dataType.ownedById,
  accountId: dataType.ownedById,
  dataTypeId: dataType.schema.$id,
  dataType: dataType.schema,
});

export const mapPropertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): PersistedPropertyType => ({
  ownedById: propertyType.ownedById,
  accountId: propertyType.ownedById,
  propertyTypeId: propertyType.schema.$id,
  propertyType: propertyType.schema,
});

export const mapPropertyTypeRootedSubgraphToGQL = ({
  propertyType,
  referencedDataTypes,
  referencedPropertyTypes,
}: {
  propertyType: PropertyTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
}): PropertyTypeRootedSubgraph => ({
  ownedById: propertyType.ownedById,
  accountId: propertyType.ownedById,
  propertyTypeId: propertyType.schema.$id,
  propertyType: propertyType.schema,
  referencedDataTypes: referencedDataTypes.map(mapDataTypeModelToGQL),
  referencedPropertyTypes: referencedPropertyTypes.map(
    mapPropertyTypeModelToGQL,
  ),
});

export const mapLinkTypeModelToGQL = (
  linkType: LinkTypeModel,
): PersistedLinkType => ({
  ownedById: linkType.ownedById,
  accountId: linkType.ownedById,
  linkTypeId: linkType.schema.$id,
  linkType: linkType.schema,
});

export const mapEntityTypeModelToGQL = (
  entityType: EntityTypeModel,
): PersistedEntityType => ({
  ownedById: entityType.ownedById,
  accountId: entityType.ownedById,
  entityTypeId: entityType.schema.$id,
  entityType: entityType.schema,
});

export const mapEntityTypeRootedSubgraphToGQL = (params: {
  entityType: EntityTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
  referencedLinkTypes: LinkTypeModel[];
  referencedEntityTypes: EntityTypeModel[];
}): EntityTypeRootedSubgraph => ({
  ownedById: params.entityType.ownedById,
  accountId: params.entityType.ownedById,
  entityTypeId: params.entityType.schema.$id,
  entityType: params.entityType.schema,
  referencedDataTypes: params.referencedDataTypes.map(mapDataTypeModelToGQL),
  referencedPropertyTypes: params.referencedPropertyTypes.map(
    mapPropertyTypeModelToGQL,
  ),
  referencedLinkTypes: params.referencedLinkTypes.map(mapLinkTypeModelToGQL),
  referencedEntityTypes: params.referencedEntityTypes.map(
    mapEntityTypeModelToGQL,
  ),
});
