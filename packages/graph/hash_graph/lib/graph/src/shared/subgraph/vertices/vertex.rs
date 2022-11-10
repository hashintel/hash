use serde::Serialize;
use utoipa::{openapi, ToSchema};

use crate::{
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "inner")]
#[serde(rename_all = "camelCase")]
pub enum OntologyVertex {
    DataType(DataTypeWithMetadata),
    PropertyType(PropertyTypeWithMetadata),
    EntityType(EntityTypeWithMetadata),
}

// WARNING: This MUST be kept up to date with the enum names and serde attribute, as utoipa does
// not currently support adjacently tagged enums so we must roll our own:
// https://github.com/juhaku/utoipa/issues/219
impl ToSchema for OntologyVertex {
    fn schema() -> openapi::Schema {
        let mut builder =
            openapi::OneOfBuilder::new().discriminator(Some(openapi::Discriminator::new("kind")));

        for (kind, schema) in [
            ("dataType", DataTypeWithMetadata::schema()),
            ("propertyType", PropertyTypeWithMetadata::schema()),
            ("entityType", EntityTypeWithMetadata::schema()),
        ] {
            builder = builder.item(
                openapi::ObjectBuilder::new()
                    .property(
                        "kind",
                        // Apparently OpenAPI doesn't support const values, the best you can do is
                        // an enum with one option
                        openapi::Schema::from(
                            openapi::ObjectBuilder::new().enum_values(Some([kind])),
                        ),
                    )
                    .required("kind")
                    .property("inner", schema)
                    .required("inner"),
            );
        }

        builder.into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "inner")]
#[serde(rename_all = "camelCase")]
pub enum KnowledgeGraphVertex {
    Entity(Entity),
}

// WARNING: This MUST be kept up to date with the enum names and serde attribute, as utoipa does
// not currently support adjacently tagged enums so we must roll our own:
// https://github.com/juhaku/utoipa/issues/219
impl ToSchema for KnowledgeGraphVertex {
    fn schema() -> openapi::Schema {
        let builder = openapi::OneOfBuilder::new()
            .discriminator(Some(openapi::Discriminator::new("kind")))
            .item(
                openapi::ObjectBuilder::new()
                    .property(
                        "kind",
                        // Apparently OpenAPI doesn't support const values, the best you can do is
                        // an enum with one option
                        openapi::Schema::from(
                            openapi::ObjectBuilder::new().enum_values(Some(["entity"])),
                        ),
                    )
                    .required("kind")
                    .property("inner", Entity::schema())
                    .required("inner"),
            );

        builder.into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum Vertex {
    Ontology(OntologyVertex),
    KnowledgeGraph(KnowledgeGraphVertex),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for Vertex {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(OntologyVertex::schema())
            .item(KnowledgeGraphVertex::schema())
            .into()
    }
}
