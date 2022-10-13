use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::{openapi, ToSchema};

use crate::{
    knowledge::{EntityId, KnowledgeGraphQueryDepth, PersistedEntity, PersistedLink},
    ontology::{
        OntologyQueryDepth, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedPropertyType,
    },
};

// TODO - This is temporary and introduced for consistency, we need to introduce actual IDs for
//  links
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkId {
    source_entity_id: EntityId,
    target_entity_id: EntityId,
    #[schema(value_type = String)]
    link_type_id: VersionedUri,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase", untagged)]
pub enum GraphElementIdentifier {
    // TODO: can we create a new type just to generate a Utoipa line for VersionedURI and then use
    //  that inside a `#[schema(value_type =` expression?
    OntologyElementId(VersionedUri),
    KnowledgeGraphElementId(EntityId),
    Temporary(LinkId),
}

// TODO: We have to do this because utoipa doesn't understand serde untagged
//  https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementIdentifier {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Object::with_type(openapi::SchemaType::String))
            .example(Some(serde_json::json!(
                "6013145d-7392-4630-ab16-e99c59134cb6"
            )))
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum Vertex {
    DataType(PersistedDataType),
    PropertyType(PersistedPropertyType),
    LinkType(PersistedLinkType),
    EntityType(PersistedEntityType),
    Entity(PersistedEntity),
    Link(PersistedLink),
}

// WARNING: This MUST be kept up to date with the enum names and serde attribute, as utoipa does
// not currently support adjacently tagged enums so we must roll our own:
// https://github.com/juhaku/utoipa/issues/219
impl ToSchema for Vertex {
    fn schema() -> openapi::Schema {
        let mut builder =
            openapi::OneOfBuilder::new().discriminator(Some(openapi::Discriminator::new("kind")));

        for (kind, schema) in [
            ("DATA_TYPE", PersistedDataType::schema()),
            ("PROPERTY_TYPE", PersistedPropertyType::schema()),
            ("LINK_TYPE", PersistedLinkType::schema()),
            ("ENTITY_TYPE", PersistedEntityType::schema()),
            ("ENTITY", PersistedEntity::schema()),
            ("LINK", PersistedLink::schema()),
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[expect(
    dead_code,
    reason = "In process of implementing usages of these across a few PRs"
)]
pub enum EdgeKind {
    /// An [`Entity`] has a [`Link`]
    HasLink,
    /// A [`Link`] has an [`Entity`] as its destination
    HasDestination,
    /// A [`Link`] or [`Entity`] has a [`LinkType`] or [`EntityType`] as its type, respectively
    HasType,
    /// A type can reference another type
    References,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OutwardEdge {
    edge_kind: EdgeKind,
    destination: GraphElementIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GraphResolveDepths {
    #[schema(value_type = number)]
    pub data_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub property_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub entity_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub link_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub entity_resolve_depth: KnowledgeGraphQueryDepth,
    #[schema(value_type = number)]
    pub link_resolve_depth: KnowledgeGraphQueryDepth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    pub roots: Vec<GraphElementIdentifier>,
    pub vertices: HashMap<GraphElementIdentifier, Vertex>,
    pub edges: HashMap<GraphElementIdentifier, Vec<OutwardEdge>>,
    pub depths: GraphResolveDepths,
}
