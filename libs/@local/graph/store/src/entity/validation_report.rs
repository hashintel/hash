use std::collections::HashSet;

use error_stack::Report;
use hash_graph_types::knowledge::{
    entity::EntityId, property::visitor::PropertyObjectValidationReport,
};
use type_system::{schema::ResolveClosedEntityTypeError, url::VersionedUrl};

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not read the entity")]
#[must_use]
pub struct EntityRetrieval {
    pub entity_id: EntityId,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not read the entity type {entity_type_url}")]
#[must_use]
pub struct EntityTypeRetrieval {
    pub entity_type_url: VersionedUrl,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "error", rename_all = "camelCase")]
#[must_use]
pub enum LinkedEntityError {
    EntityRetrieval(Report<EntityRetrieval>),
    EntityTypeRetrieval(
        #[cfg_attr(feature = "utoipa", schema(value_type = MultiReport))]
        Report<[EntityTypeRetrieval]>,
    ),
    ResolveClosedEntityType(Report<ResolveClosedEntityTypeError>),
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("The entity is a link but does not contain link data")]
#[must_use]
pub struct MissingLinkData;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("The entity is not a link but contains link data")]
#[must_use]
pub struct UnexpectedLinkData;

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "error", rename_all = "camelCase")]
#[must_use]
pub enum LinkDataStateError {
    Missing(Report<MissingLinkData>),
    Unexpected(Report<UnexpectedLinkData>),
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct UnexpectedEntityType {
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub actual: HashSet<VersionedUrl>,
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub expected: HashSet<VersionedUrl>,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum LinkError {
    UnexpectedEntityType { data: UnexpectedEntityType },
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum LinkTargetError {
    UnexpectedEntityType { data: UnexpectedEntityType },
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct LinkDataValidationReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_entity: Option<LinkedEntityError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_entity: Option<LinkedEntityError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_type: Option<LinkError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_type: Option<LinkTargetError>,
}

impl LinkDataValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.left_entity.is_none()
            && self.right_entity.is_none()
            && self.link_type.is_none()
            && self.target_type.is_none()
    }
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct LinkValidationReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_data: Option<LinkDataStateError>,
    #[serde(flatten)]
    pub link_data_validation: LinkDataValidationReport,
}

impl LinkValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.link_data.is_none() && self.link_data_validation.is_valid()
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("The entity does not contain any entity types")]
#[must_use]
pub struct EmptyEntityTypes;

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "error", rename_all = "camelCase")]
#[must_use]
pub enum EntityTypesError {
    Empty(Report<EmptyEntityTypes>),
    EntityTypeRetrieval(
        #[cfg_attr(feature = "utoipa", schema(value_type = MultiReport))]
        Report<[EntityTypeRetrieval]>,
    ),
    ResolveClosedEntityType(Report<ResolveClosedEntityTypeError>),
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct PropertyMetadataValidationReport;

impl PropertyMetadataValidationReport {
    #[must_use]
    #[expect(
        clippy::unused_self,
        reason = "The struct will be extended in the future"
    )]
    pub const fn is_valid(&self) -> bool {
        true
    }
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct MetadataValidationReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_types: Option<EntityTypesError>,
    #[serde(skip_serializing_if = "PropertyMetadataValidationReport::is_valid")]
    pub properties: PropertyMetadataValidationReport,
}

impl MetadataValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.entity_types.is_none() && self.properties.is_valid()
    }
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct PropertyValidationReport {
    pub object_report: Option<PropertyObjectValidationReport>,
}

impl PropertyValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.object_report.is_none()
    }
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct EntityValidationReport {
    #[serde(skip_serializing_if = "PropertyValidationReport::is_valid")]
    pub properties: PropertyValidationReport,
    #[serde(skip_serializing_if = "LinkValidationReport::is_valid")]
    pub link: LinkValidationReport,
    #[serde(skip_serializing_if = "MetadataValidationReport::is_valid")]
    pub metadata: MetadataValidationReport,
}

impl EntityValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.link.is_valid() && self.metadata.is_valid()
    }
}

pub struct PropertyValidationReport {}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not read the property type {}", property_type_reference.url)]
#[must_use]
pub struct PropertyTypeRetrieval {
    pub property_type_reference: PropertyTypeReference,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct UnexpectedPropertyType {
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub actual: JsonSchemaValueType,
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub expected: JsonSchemaValueType,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "report", rename_all = "camelCase")]
#[must_use]
pub enum PropertyValidationError {
    Value(PropertyValueValidationReport),
    Array(PropertyArrayValidationReport),
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum ObjectPropertyError {
    Unexpected,
    Retrieval {
        report: Report<PropertyTypeRetrieval>,
    },
    WrongType {
        data: UnexpectedPropertyType,
    },
    Validation(PropertyValidationError),
    Missing,
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PropertyObjectValidationReport {
    properties: HashMap<BaseUrl, ObjectPropertyError>,
}

impl PropertyObjectValidationReport {
    pub fn is_valid(&self) -> bool {
        self.properties.is_empty()
    }
}

#[derive(Debug, Default, serde::Serialize)]
pub struct PropertyArrayValidationReport;

#[derive(Debug, Default, serde::Serialize)]
pub struct PropertyValueValidationReport;

impl PropertyObjectValidationReport {
    pub fn capture_missing_required_property(&mut self, key: BaseUrl) {
        self.properties.insert(key, ObjectPropertyError::Missing);
    }
}

impl ObjectVisitationReport for PropertyObjectValidationReport {
    type ArrayVisitationReport = PropertyArrayValidationReport;
    type PropertyVisitationReport = PropertyValueValidationReport;

    fn capture_unexpected_property(&mut self, key: BaseUrl) {
        self.properties.insert(key, ObjectPropertyError::Unexpected);
    }

    #[track_caller]
    fn capture_property_type_retrieval_failed(
        &mut self,
        reference: PropertyTypeReference,
        report: Report<impl Error + Send + Sync>,
    ) {
        self.properties.insert(
            reference.url.base_url.clone(),
            ObjectPropertyError::Retrieval {
                report: report.change_context(PropertyTypeRetrieval {
                    property_type_reference: reference,
                }),
            },
        );
    }

    fn capture_unexpected_type(
        &mut self,
        key: BaseUrl,
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    ) {
        self.properties.insert(key, ObjectPropertyError::WrongType {
            data: UnexpectedPropertyType { actual, expected },
        });
    }

    fn capture_property_validation_report(
        &mut self,
        key: BaseUrl,
        report: Self::PropertyVisitationReport,
    ) {
        self.properties.insert(
            key,
            ObjectPropertyError::Validation(PropertyValidationError::Value(report)),
        );
    }

    fn capture_array_validation_report(
        &mut self,
        key: BaseUrl,
        report: Self::ArrayVisitationReport,
    ) {
        self.properties.insert(
            key,
            ObjectPropertyError::Validation(PropertyValidationError::Array(report)),
        );
    }
}
