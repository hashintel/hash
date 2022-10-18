use std::collections::{
    hash_map::{IntoIter, RawEntryMut},
    HashMap, HashSet,
};

use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::{openapi, openapi::Schema, ToSchema};

use crate::{
    knowledge::{EntityId, KnowledgeGraphQueryDepth, PersistedEntity, PersistedLink},
    ontology::{
        OntologyQueryDepth, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedPropertyType,
    },
    store::query::Expression,
};

// TODO - This is temporary and introduced for consistency, we need to introduce actual IDs for
//  links, should be revisited as part of https://app.asana.com/0/0/1203157172269853/f
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkId {
    pub source_entity_id: EntityId,
    pub target_entity_id: EntityId,
    #[schema(value_type = String)]
    pub link_type_id: VersionedUri,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase", untagged)]
pub enum GraphElementIdentifier {
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
            ("dataType", PersistedDataType::schema()),
            ("propertyType", PersistedPropertyType::schema()),
            ("linkType", PersistedLinkType::schema()),
            ("entityType", PersistedEntityType::schema()),
            ("entity", PersistedEntity::schema()),
            ("link", PersistedLink::schema()),
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

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EdgeKind {
    /// An entity has a link
    HasLink,
    /// A link has an entity as its destination
    HasDestination,
    /// A link or entity has a link type or entity type as its type, respectively
    HasType,
    /// A type can reference another type
    References,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OutwardEdge {
    pub edge_kind: EdgeKind,
    pub destination: GraphElementIdentifier,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
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
    pub link_resolve_depth: KnowledgeGraphQueryDepth,
    // TODO: what is this?
    #[schema(value_type = number)]
    pub link_target_entity_resolve_depth: KnowledgeGraphQueryDepth,
}

impl GraphResolveDepths {
    #[must_use]
    pub const fn zeroed() -> Self {
        Self {
            data_type_resolve_depth: 0,
            property_type_resolve_depth: 0,
            entity_type_resolve_depth: 0,
            link_type_resolve_depth: 0,
            link_resolve_depth: 0,
            link_target_entity_resolve_depth: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    pub roots: Vec<GraphElementIdentifier>,
    pub vertices: HashMap<GraphElementIdentifier, Vertex>,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}

/// An [`Expression`] to query the datastore, recursively resolving according to the
/// [`GraphResolveDepths`]
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StructuralQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
    pub graph_resolve_depths: GraphResolveDepths,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct Edges(HashMap<GraphElementIdentifier, HashSet<OutwardEdge>>);

impl Edges {
    #[must_use]
    pub fn new() -> Self {
        Self(HashMap::new())
    }

    pub fn insert(&mut self, identifier: GraphElementIdentifier, edge: OutwardEdge) -> bool {
        match self.0.raw_entry_mut().from_key(&identifier) {
            RawEntryMut::Vacant(entry) => {
                entry.insert(identifier, HashSet::from([edge]));
                true
            }
            RawEntryMut::Occupied(entry) => {
                let set = entry.into_mut();
                set.insert(edge)
            }
        }
    }
}

// Necessary because utoipa can't handle HashSet
impl ToSchema for Edges {
    fn schema() -> Schema {
        openapi::ObjectBuilder::new()
            .additional_properties(Some(openapi::schema::Array::new(OutwardEdge::schema())))
            .into()
    }
}

impl IntoIterator for Edges {
    type IntoIter = IntoIter<GraphElementIdentifier, HashSet<OutwardEdge>>;
    type Item = (GraphElementIdentifier, HashSet<OutwardEdge>);

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl Extend<(GraphElementIdentifier, HashSet<OutwardEdge>)> for Edges {
    fn extend<T: IntoIterator<Item = (GraphElementIdentifier, HashSet<OutwardEdge>)>>(
        &mut self,
        other: T,
    ) {
        self.0.extend(other);
    }
}
