//! TODO: DOC

mod data_type;
pub mod domain_validator;
mod entity_type;
mod property_type;

use core::fmt;

use error_stack::{Context, IntoReport, Result, ResultExt};
use serde::{Deserialize, Serialize, Serializer};
use serde_json;
use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};
use utoipa::ToSchema;

pub use self::{
    data_type::{DataTypeQueryPath, DataTypeQueryPathVisitor, DataTypeQueryToken},
    entity_type::{EntityTypeQueryPath, EntityTypeQueryPathVisitor, EntityTypeQueryToken},
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryPathVisitor, PropertyTypeQueryToken},
};
use crate::{
    identifier::ontology::OntologyTypeEditionId,
    provenance::{OwnedById, ProvenanceMetadata},
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
/// field), inserts the given [`VersionedUri`] under the "$id" key, and tries to deserialize the
/// type.
///
/// # Errors
///
/// - [`PatchAndParseError`] if
///   - "$id" already existed
///   - the [`serde_json::Value`] wasn't an 'Object'
///   - deserializing into `T` failed
pub fn patch_id_and_parse<T>(
    id: &VersionedUri,
    mut value: serde_json::Value,
) -> Result<T, PatchAndParseError>
where
    T: TryFrom<serde_json::Value, Error: Context>,
{
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

    let ontology_type: T = value
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
    T: Clone,
    serde_json::Value: From<T>,
    S: Serializer,
{
    // This clone is necessary because `Serialize` requires us to take the param by reference here
    //  even though we only use it in places where we could move
    serde_json::Value::from(ontology_type.clone()).serialize(serializer)
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
pub struct DataTypeWithMetadata {
    #[schema(value_type = VAR_DATA_TYPE)]
    #[serde(rename = "schema", serialize_with = "serialize_ontology_type")]
    inner: DataType,
    metadata: OntologyElementMetadata,
}

impl DataTypeWithMetadata {
    #[must_use]
    pub const fn inner(&self) -> &DataType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &OntologyElementMetadata {
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

impl PropertyTypeWithMetadata {
    #[must_use]
    pub const fn inner(&self) -> &PropertyType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &OntologyElementMetadata {
        &self.metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyElementMetadata {
    edition_id: OntologyTypeEditionId,
    #[serde(rename = "provenance")]
    provenance_metadata: ProvenanceMetadata,
    owned_by_id: OwnedById,
}

impl OntologyElementMetadata {
    #[must_use]
    pub const fn new(
        edition_id: OntologyTypeEditionId,
        provenance_metadata: ProvenanceMetadata,
        owned_by_id: OwnedById,
    ) -> Self {
        Self {
            edition_id,
            provenance_metadata,
            owned_by_id,
        }
    }

    #[must_use]
    pub const fn edition_id(&self) -> &OntologyTypeEditionId {
        &self.edition_id
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

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
pub struct EntityTypeWithMetadata {
    #[schema(value_type = VAR_ENTITY_TYPE)]
    #[serde(rename = "schema", serialize_with = "serialize_ontology_type")]
    inner: EntityType,
    metadata: OntologyElementMetadata,
}

impl EntityTypeWithMetadata {
    #[must_use]
    pub const fn inner(&self) -> &EntityType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &OntologyElementMetadata {
        &self.metadata
    }
}

pub trait PersistedOntologyType {
    type Inner;

    fn new(record: Self::Inner, metadata: OntologyElementMetadata) -> Self;
}

impl PersistedOntologyType for DataTypeWithMetadata {
    type Inner = DataType;

    fn new(record: Self::Inner, metadata: OntologyElementMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}

impl PersistedOntologyType for PropertyTypeWithMetadata {
    type Inner = PropertyType;

    fn new(record: Self::Inner, metadata: OntologyElementMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}

impl PersistedOntologyType for EntityTypeWithMetadata {
    type Inner = EntityType;

    fn new(record: Self::Inner, metadata: OntologyElementMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}
