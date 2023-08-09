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
    repr,
    url::{BaseUrl, VersionedUrl},
    DataType, DataTypeReference, EntityType, EntityTypeReference, ParseDataTypeError,
    ParseEntityTypeError, ParsePropertyTypeError, PropertyType, PropertyTypeReference,
};
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};

pub use self::{
    data_type::{DataTypeQueryPath, DataTypeQueryPathVisitor, DataTypeQueryToken},
    entity_type::{EntityTypeQueryPath, EntityTypeQueryPathVisitor, EntityTypeQueryToken},
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryPathVisitor, PropertyTypeQueryToken},
};
use crate::{
    identifier::{
        ontology::OntologyTypeRecordId,
        time::{LeftClosedTemporalInterval, TimeAxis, TransactionTime},
    },
    provenance::{OwnedById, ProvenanceMetadata},
    store::Record,
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
///
/// # Panics
///
/// - if serializing the given [`VersionedUrl`] fails
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
    type Metadata;

    fn id(&self) -> &VersionedUrl;

    fn traverse_references(&self) -> Vec<OntologyTypeReference>;
}

impl OntologyType for DataType {
    type ConversionError = ParseDataTypeError;
    type Metadata = OntologyElementMetadata;
    type Representation = repr::DataType;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        vec![]
    }
}

impl OntologyType for PropertyType {
    type ConversionError = ParsePropertyTypeError;
    type Metadata = OntologyElementMetadata;
    type Representation = repr::PropertyType;

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

/// A [`CustomEntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialCustomEntityTypeMetadata {
    pub label_property: Option<BaseUrl>,
    pub common: PartialCustomOntologyMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEntityTypeMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(flatten)]
    pub common: CustomOntologyMetadata,
}

// Utoipa does not know how to generate a schema for flattend enumerations
impl ToSchema<'static> for CustomEntityTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "CustomEntityTypeMetadata",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("CustomOwnedEntityTypeMetadata"))
                            .property("labelProperty", Ref::from_schema_name("SHARED_BaseUrl"))
                            .property(
                                "provenance",
                                Ref::from_schema_name(ProvenanceMetadata::schema().0),
                            )
                            .required("provenance")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name(OntologyTemporalMetadata::schema().0),
                            )
                            .required("temporalVersioning")
                            .property("ownedById", Ref::from_schema_name(OwnedById::schema().0))
                            .required("ownedById")
                            .build(),
                    )
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("CustomExternalEntityTypeMetadata"))
                            .property("labelProperty", Ref::from_schema_name("SHARED_BaseUrl"))
                            .property(
                                "provenance",
                                Ref::from_schema_name(ProvenanceMetadata::schema().0),
                            )
                            .required("provenance")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name(OntologyTemporalMetadata::schema().0),
                            )
                            .required("temporalVersioning")
                            .property(
                                "fetchedAt",
                                schema::ObjectBuilder::new()
                                    .schema_type(schema::SchemaType::String),
                            )
                            .required("fetchedAt")
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialEntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: PartialCustomEntityTypeMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: CustomEntityTypeMetadata,
}

impl EntityTypeMetadata {
    #[must_use]
    pub fn from_partial(
        partial: PartialEntityTypeMetadata,
        transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    ) -> Self {
        Self {
            record_id: partial.record_id,
            custom: match partial.custom {
                PartialCustomEntityTypeMetadata {
                    label_property,
                    common:
                        PartialCustomOntologyMetadata::Owned {
                            provenance,
                            owned_by_id,
                        },
                } => CustomEntityTypeMetadata {
                    label_property,
                    common: CustomOntologyMetadata::Owned {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        owned_by_id,
                    },
                },
                PartialCustomEntityTypeMetadata {
                    label_property,
                    common:
                        PartialCustomOntologyMetadata::External {
                            provenance,
                            fetched_at,
                        },
                } => CustomEntityTypeMetadata {
                    label_property,
                    common: CustomOntologyMetadata::External {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        fetched_at,
                    },
                },
            },
        }
    }
}

impl OntologyType for EntityType {
    type ConversionError = ParseEntityTypeError;
    type Metadata = EntityTypeMetadata;
    type Representation = repr::EntityType;

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

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OntologyTemporalMetadata {
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

/// A [`CustomOntologyMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PartialCustomOntologyMetadata {
    Owned {
        provenance: ProvenanceMetadata,
        owned_by_id: OwnedById,
    },
    External {
        provenance: ProvenanceMetadata,
        fetched_at: OffsetDateTime,
    },
}

impl PartialCustomOntologyMetadata {
    #[must_use]
    pub const fn provenance(&self) -> ProvenanceMetadata {
        let (Self::External { provenance, .. } | Self::Owned { provenance, .. }) = self;

        *provenance
    }
}

// TODO: Restrict mutable access when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum CustomOntologyMetadata {
    #[schema(title = "CustomOwnedOntologyElementMetadata")]
    #[serde(rename_all = "camelCase")]
    Owned {
        provenance: ProvenanceMetadata,
        temporal_versioning: OntologyTemporalMetadata,
        owned_by_id: OwnedById,
    },
    #[schema(title = "CustomExternalOntologyElementMetadata")]
    #[serde(rename_all = "camelCase")]
    External {
        provenance: ProvenanceMetadata,
        temporal_versioning: OntologyTemporalMetadata,
        #[schema(value_type = String)]
        #[serde(with = "crate::serde::time")]
        fetched_at: OffsetDateTime,
    },
}

impl CustomOntologyMetadata {
    #[must_use]
    pub const fn temporal_versioning(&self) -> &OntologyTemporalMetadata {
        match self {
            Self::Owned {
                temporal_versioning,
                ..
            }
            | Self::External {
                temporal_versioning,
                ..
            } => temporal_versioning,
        }
    }
}

/// An [`OntologyElementMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialOntologyElementMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: PartialCustomOntologyMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyElementMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: CustomOntologyMetadata,
}

impl From<EntityTypeMetadata> for OntologyElementMetadata {
    fn from(value: EntityTypeMetadata) -> Self {
        Self {
            record_id: value.record_id,
            custom: value.custom.common,
        }
    }
}

impl OntologyElementMetadata {
    #[must_use]
    pub fn from_partial(
        partial: PartialOntologyElementMetadata,
        transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    ) -> Self {
        Self {
            record_id: partial.record_id,
            custom: match partial.custom {
                PartialCustomOntologyMetadata::Owned {
                    provenance,
                    owned_by_id,
                } => CustomOntologyMetadata::Owned {
                    provenance,
                    temporal_versioning: OntologyTemporalMetadata { transaction_time },
                    owned_by_id,
                },
                PartialCustomOntologyMetadata::External {
                    provenance,
                    fetched_at,
                } => CustomOntologyMetadata::External {
                    provenance,
                    temporal_versioning: OntologyTemporalMetadata { transaction_time },
                    fetched_at,
                },
            },
        }
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    deny_unknown_fields,
    bound(
        serialize = "S: Clone, S::Metadata: Serialize",
        deserialize = "S: Deserialize<'de>, S::Metadata: Deserialize<'de>"
    )
)]
pub struct OntologyTypeWithMetadata<S: OntologyType> {
    #[serde(serialize_with = "serialize_ontology_type")]
    pub schema: S,
    pub metadata: S::Metadata,
}

// Utoipa's signature is too... not generic enough, thus we have to implement it for all ontology
// types.
impl ToSchema<'static> for DataTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "DataTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("VAR_DATA_TYPE"))
                .required("schema")
                .property(
                    "metadata",
                    Ref::from_schema_name(OntologyElementMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}

impl ToSchema<'static> for PropertyTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "PropertyTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("VAR_PROPERTY_TYPE"))
                .required("schema")
                .property(
                    "metadata",
                    Ref::from_schema_name(OntologyElementMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}

impl ToSchema<'static> for EntityTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("VAR_ENTITY_TYPE"))
                .required("schema")
                .property(
                    "metadata",
                    Ref::from_schema_name(EntityTypeMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}

pub type DataTypeWithMetadata = OntologyTypeWithMetadata<DataType>;

impl Record for DataTypeWithMetadata {
    type QueryPath<'p> = DataTypeQueryPath<'p>;
    type VertexId = DataTypeVertexId;
}

impl DataTypeWithMetadata {
    #[must_use]
    pub fn vertex_id(&self, _time_axis: TimeAxis) -> DataTypeVertexId {
        let record_id = &self.metadata.record_id;
        DataTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}

pub type PropertyTypeWithMetadata = OntologyTypeWithMetadata<PropertyType>;

impl Record for PropertyTypeWithMetadata {
    type QueryPath<'p> = PropertyTypeQueryPath<'p>;
    type VertexId = PropertyTypeVertexId;
}

impl PropertyTypeWithMetadata {
    #[must_use]
    pub fn vertex_id(&self, _time_axis: TimeAxis) -> PropertyTypeVertexId {
        let record_id = &self.metadata.record_id;
        PropertyTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}

pub type EntityTypeWithMetadata = OntologyTypeWithMetadata<EntityType>;

impl Record for EntityTypeWithMetadata {
    type QueryPath<'p> = EntityTypeQueryPath<'p>;
    type VertexId = EntityTypeVertexId;
}

impl EntityTypeWithMetadata {
    #[must_use]
    pub fn vertex_id(&self, _time_axis: TimeAxis) -> EntityTypeVertexId {
        let record_id = &self.metadata.record_id;
        EntityTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}
