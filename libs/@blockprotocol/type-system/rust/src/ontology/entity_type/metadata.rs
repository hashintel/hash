#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{Ref, RefOr, Schema, schema},
};

use super::{ClosedEntityType, EntityType};
use crate::ontology::{
    OntologyTemporalMetadata, OntologyTypeWithMetadata,
    id::OntologyTypeRecordId,
    provenance::{OntologyOwnership, OntologyProvenance},
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub ownership: OntologyOwnership,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
}

#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod metadata_patch {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(untagged)]
    enum EntityTypeMetadata {
        #[serde(rename_all = "camelCase")]
        Impl {
            record_id: OntologyTypeRecordId,
            #[serde(flatten)]
            ownership: OntologyOwnership,
            temporal_versioning: OntologyTemporalMetadata,
            provenance: OntologyProvenance,
        },
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for EntityTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityTypeMetadata",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("OwnedEntityTypeMetadata"))
                            .property("recordId", Ref::from_schema_name("OntologyTypeRecordId"))
                            .required("recordId")
                            .property("webId", Ref::from_schema_name("WebId"))
                            .required("webId")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name("OntologyTemporalMetadata"),
                            )
                            .required("temporalVersioning")
                            .property("provenance", Ref::from_schema_name("OntologyProvenance"))
                            .required("provenance")
                            .build(),
                    )
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("ExternalEntityTypeMetadata"))
                            .property("recordId", Ref::from_schema_name("OntologyTypeRecordId"))
                            .required("recordId")
                            .property("fetchedAt", Ref::from_schema_name("Timestamp"))
                            .required("fetchedAt")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name("OntologyTemporalMetadata"),
                            )
                            .required("temporalVersioning")
                            .property("provenance", Ref::from_schema_name("OntologyProvenance"))
                            .required("provenance")
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

pub type EntityTypeWithMetadata = OntologyTypeWithMetadata<EntityType>;

pub type ClosedEntityTypeWithMetadata = OntologyTypeWithMetadata<ClosedEntityType>;

#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod with_metadata_patch {
    use super::*;

    #[derive(tsify::Tsify)]
    struct EntityTypeWithMetadata {
        schema: EntityType,
        metadata: EntityTypeMetadata,
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for EntityTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("EntityType"))
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
