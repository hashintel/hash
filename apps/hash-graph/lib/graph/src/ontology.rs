//! TODO: DOC

mod data_type;
pub mod domain_validator;
mod entity_type;
mod property_type;

use core::fmt;
use std::iter::once;

use error_stack::{Context, IntoReport, Result, ResultExt};
use serde::{Deserialize, Serialize, Serializer};
use serde_json;
use time::OffsetDateTime;
use type_system::{
    repr, url::VersionedUrl, DataType, DataTypeReference, EntityType, EntityTypeReference,
    ParseDataTypeError, ParseEntityTypeError, ParsePropertyTypeError, PropertyType,
    PropertyTypeReference,
};
use utoipa::ToSchema;

pub use self::{
    data_type::{DataTypeQueryPath, DataTypeQueryPathVisitor, DataTypeQueryToken},
    entity_type::{EntityTypeQueryPath, EntityTypeQueryPathVisitor, EntityTypeQueryToken},
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryPathVisitor, PropertyTypeQueryToken},
};
use crate::{
    identifier::{ontology::OntologyTypeRecordId, time::TimeAxis},
    provenance::{OwnedById, ProvenanceMetadata},
    store::{query::Filter, Record},
    subgraph::identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
};

#[derive(Deserialize, ToSchema)]
pub enum Selector {
    #[serde(rename = "*")]
    Asterisk,
}

#[derive(Debug)]
pub struct PatchAndParseError;

impl Context for PatchAndParseError {}

impl fmt::Display for PatchAndParseError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to patch schema's id and parse as type")
    }
}

/// Takes the [`serde_json::Value`] representation of an ontology type schema (without an "$id"
/// field), inserts the given [`VersionedUrl`] under the "$id" key, and tries to deserialize the
/// type.
///
/// # Errors
///
/// - [`PatchAndParseError`] if
///   - "$id" already existed
///   - the [`serde_json::Value`] wasn't an 'Object'
///   - deserializing into `T` failed
pub fn patch_id_and_parse<T: OntologyType>(
    id: &VersionedUrl,
    mut value: serde_json::Value,
) -> Result<T, PatchAndParseError> {
    if let Some(object) = value.as_object_mut() {
        if let Some(previous_val) = object.insert(
            "$id".to_owned(),
            serde_json::to_value(id).expect("failed to deserialize id"),
        ) {
            return Err(PatchAndParseError)
                .into_report()
                .attach_printable("schema already had an $id")
                .attach_printable(previous_val);
        }
    } else {
        return Err(PatchAndParseError)
            .into_report()
            .attach_printable("unexpected schema format, couldn't parse as object")
            .attach_printable(value);
    }

    let ontology_type_repr: T::Representation = serde_json::from_value(value)
        .into_report()
        .change_context(PatchAndParseError)?;
    let ontology_type: T = ontology_type_repr
        .try_into()
        .into_report()
        .change_context(PatchAndParseError)?;

    Ok(ontology_type)
}

fn serialize_ontology_type<T, S>(
    ontology_type: &T,
    serializer: S,
) -> std::result::Result<S::Ok, S::Error>
where
    T: OntologyType + Clone,
    S: Serializer,
{
    // This clone is necessary because `Serialize` requires us to take the param by reference here
    //  even though we only use it in places where we could move
    T::Representation::from(ontology_type.clone()).serialize(serializer)
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[allow(clippy::enum_variant_names)]
pub enum OntologyTypeReference<'a> {
    EntityTypeReference(&'a EntityTypeReference),
    PropertyTypeReference(&'a PropertyTypeReference),
    DataTypeReference(&'a DataTypeReference),
}

impl OntologyTypeReference<'_> {
    #[must_use]
    pub const fn url(&self) -> &VersionedUrl {
        match self {
            Self::EntityTypeReference(entity_type_ref) => entity_type_ref.url(),
            Self::PropertyTypeReference(property_type_ref) => property_type_ref.url(),
            Self::DataTypeReference(data_type_ref) => data_type_ref.url(),
        }
    }
}

pub trait OntologyType:
    Sized + TryFrom<Self::Representation, Error = Self::ConversionError>
{
    type ConversionError: Context;
    type Representation: From<Self> + Serialize + for<'de> Deserialize<'de>;
    type WithMetadata: OntologyTypeWithMetadata<OntologyType = Self>;

    fn id(&self) -> &VersionedUrl;

    fn traverse_references(&self) -> Vec<OntologyTypeReference>;
}

impl OntologyType for DataType {
    type ConversionError = ParseDataTypeError;
    type Representation = repr::DataType;
    type WithMetadata = DataTypeWithMetadata;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        vec![]
    }
}

impl OntologyType for PropertyType {
    type ConversionError = ParsePropertyTypeError;
    type Representation = repr::PropertyType;
    type WithMetadata = PropertyTypeWithMetadata;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        self.property_type_references()
            .into_iter()
            .map(OntologyTypeReference::PropertyTypeReference)
            .chain(
                self.data_type_references()
                    .into_iter()
                    .map(OntologyTypeReference::DataTypeReference),
            )
            .collect()
    }
}

impl OntologyType for EntityType {
    type ConversionError = ParseEntityTypeError;
    type Representation = repr::EntityType;
    type WithMetadata = EntityTypeWithMetadata;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        self.property_type_references()
            .into_iter()
            .map(OntologyTypeReference::PropertyTypeReference)
            .chain(
                self.inherits_from()
                    .all_of()
                    .iter()
                    .map(OntologyTypeReference::EntityTypeReference),
            )
            .chain(self.link_mappings().into_iter().flat_map(
                |(link_entity_type, destination_entity_type_constraint)| {
                    {
                        once(link_entity_type)
                            .chain(destination_entity_type_constraint.unwrap_or_default())
                    }
                    .map(OntologyTypeReference::EntityTypeReference)
                },
            ))
            .collect()
    }
}

pub trait OntologyTypeWithMetadata: Record {
    type OntologyType: OntologyType<WithMetadata = Self>;

    fn new(record: Self::OntologyType, metadata: OntologyElementMetadata) -> Self;

    fn inner(&self) -> &Self::OntologyType;

    fn metadata(&self) -> &OntologyElementMetadata;
}

// TODO: Flatten when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum OntologyElementMetadata {
    Owned(OwnedOntologyElementMetadata),
    External(ExternalOntologyElementMetadata),
}

impl OntologyElementMetadata {
    #[must_use]
    pub const fn record_id(&self) -> &OntologyTypeRecordId {
        match self {
            Self::Owned(owned) => owned.record_id(),
            Self::External(external) => external.record_id(),
        }
    }

    #[must_use]
    pub const fn provenance_metadata(&self) -> ProvenanceMetadata {
        match self {
            Self::Owned(owned) => owned.provenance_metadata,
            Self::External(external) => external.provenance_metadata,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OwnedOntologyElementMetadata {
    record_id: OntologyTypeRecordId,
    #[serde(rename = "provenance")]
    provenance_metadata: ProvenanceMetadata,
    owned_by_id: OwnedById,
}

impl OwnedOntologyElementMetadata {
    #[must_use]
    pub const fn new(
        record_id: OntologyTypeRecordId,
        provenance_metadata: ProvenanceMetadata,
        owned_by_id: OwnedById,
    ) -> Self {
        Self {
            record_id,
            provenance_metadata,
            owned_by_id,
        }
    }

    #[must_use]
    pub const fn record_id(&self) -> &OntologyTypeRecordId {
        &self.record_id
    }

    #[must_use]
    pub const fn provenance_metadata(&self) -> ProvenanceMetadata {
        self.provenance_metadata
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> OwnedById {
        self.owned_by_id
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExternalOntologyElementMetadata {
    record_id: OntologyTypeRecordId,
    #[serde(rename = "provenance")]
    provenance_metadata: ProvenanceMetadata,
    #[schema(value_type = String)]
    #[serde(with = "crate::serde::time")]
    fetched_at: OffsetDateTime,
}

impl ExternalOntologyElementMetadata {
    #[must_use]
    pub const fn new(
        record_id: OntologyTypeRecordId,
        provenance_metadata: ProvenanceMetadata,
        fetched_at: OffsetDateTime,
    ) -> Self {
        Self {
            record_id,
            provenance_metadata,
            fetched_at,
        }
    }

    #[must_use]
    pub const fn record_id(&self) -> &OntologyTypeRecordId {
        &self.record_id
    }

    #[must_use]
    pub const fn provenance_metadata(&self) -> ProvenanceMetadata {
        self.provenance_metadata
    }

    #[must_use]
    pub const fn fetched_at(&self) -> OffsetDateTime {
        self.fetched_at
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
pub struct DataTypeWithMetadata {
    #[schema(value_type = VAR_DATA_TYPE)]
    #[serde(rename = "schema", serialize_with = "serialize_ontology_type")]
    inner: DataType,
    metadata: OntologyElementMetadata,
}

impl Record for DataTypeWithMetadata {
    type QueryPath<'p> = DataTypeQueryPath<'p>;
    type VertexId = DataTypeVertexId;

    fn vertex_id(&self, _time_axis: TimeAxis) -> Self::VertexId {
        let record_id = self.metadata().record_id();
        DataTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }

    fn create_filter_for_vertex_id(vertex_id: &Self::VertexId) -> Filter<Self> {
        Filter::for_ontology_type_vertex_id(vertex_id)
    }
}

impl OntologyTypeWithMetadata for DataTypeWithMetadata {
    type OntologyType = DataType;

    fn new(record: Self::OntologyType, metadata: OntologyElementMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }

    fn inner(&self) -> &Self::OntologyType {
        &self.inner
    }

    fn metadata(&self) -> &OntologyElementMetadata {
        &self.metadata
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
pub struct PropertyTypeWithMetadata {
    #[schema(value_type = VAR_PROPERTY_TYPE)]
    #[serde(rename = "schema", serialize_with = "serialize_ontology_type")]
    inner: PropertyType,
    metadata: OntologyElementMetadata,
}

impl Record for PropertyTypeWithMetadata {
    type QueryPath<'p> = PropertyTypeQueryPath<'p>;
    type VertexId = PropertyTypeVertexId;

    fn vertex_id(&self, _time_axis: TimeAxis) -> Self::VertexId {
        let record_id = self.metadata().record_id();
        PropertyTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }

    fn create_filter_for_vertex_id(vertex_id: &Self::VertexId) -> Filter<Self> {
        Filter::for_ontology_type_vertex_id(vertex_id)
    }
}

impl OntologyTypeWithMetadata for PropertyTypeWithMetadata {
    type OntologyType = PropertyType;

    fn new(record: Self::OntologyType, metadata: OntologyElementMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }

    fn inner(&self) -> &Self::OntologyType {
        &self.inner
    }

    fn metadata(&self) -> &OntologyElementMetadata {
        &self.metadata
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
pub struct EntityTypeWithMetadata {
    #[schema(value_type = VAR_ENTITY_TYPE)]
    #[serde(rename = "schema", serialize_with = "serialize_ontology_type")]
    inner: EntityType,
    metadata: OntologyElementMetadata,
}

impl Record for EntityTypeWithMetadata {
    type QueryPath<'p> = EntityTypeQueryPath<'p>;
    type VertexId = EntityTypeVertexId;

    fn vertex_id(&self, _time_axis: TimeAxis) -> Self::VertexId {
        let record_id = self.metadata().record_id();
        EntityTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }

    fn create_filter_for_vertex_id(vertex_id: &Self::VertexId) -> Filter<Self> {
        Filter::for_ontology_type_vertex_id(vertex_id)
    }
}

impl OntologyTypeWithMetadata for EntityTypeWithMetadata {
    type OntologyType = EntityType;

    fn new(record: Self::OntologyType, metadata: OntologyElementMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }

    fn inner(&self) -> &Self::OntologyType {
        &self.inner
    }

    fn metadata(&self) -> &OntologyElementMetadata {
        &self.metadata
    }
}
