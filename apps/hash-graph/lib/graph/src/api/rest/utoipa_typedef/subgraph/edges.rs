use std::{
    collections::{hash_map::Entry, BTreeMap, HashMap},
    hash::Hash,
};

use serde::Serialize;
use type_system::url::BaseUrl;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, RefOr, Schema},
    ToSchema,
};

use crate::{
    api::rest::utoipa_typedef::subgraph::vertices::OntologyTypeVertexId,
    identifier::{knowledge::EntityId, ontology::OntologyTypeVersion, time::Timestamp},
    subgraph::{
        edges::{KnowledgeGraphEdgeKind, OntologyEdgeKind, OutwardEdge, SharedEdgeKind},
        identifier::{
            DataTypeVertexId, EntityIdWithInterval, EntityTypeVertexId, PropertyTypeVertexId,
        },
        temporal_axes::VariableAxis,
    },
};

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum OntologyOutwardEdge {
    ToOntology(OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>),
    ToKnowledgeGraph(OutwardEdge<SharedEdgeKind, EntityIdWithInterval>),
}

impl From<OutwardEdge<OntologyEdgeKind, EntityTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, EntityTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::EntityType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<OntologyEdgeKind, PropertyTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, PropertyTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::PropertyType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<OntologyEdgeKind, DataTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, DataTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::DataType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<SharedEdgeKind, EntityIdWithInterval>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, EntityIdWithInterval>) -> Self {
        Self::ToKnowledgeGraph(edge)
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema<'_> for OntologyOutwardEdge {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "OntologyOutwardEdge",
            OneOfBuilder::new()
                .item(
                    <OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>>::generate_schema(
                        "OntologyToOntologyOutwardEdge",
                    ),
                )
                .item(
                    <OutwardEdge<SharedEdgeKind, EntityIdWithInterval>>::generate_schema(
                        "OntologyToKnowledgeGraphOutwardEdge",
                    ),
                )
                .into(),
        )
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdge {
    ToKnowledgeGraph(OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>),
    ToOntology(OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>),
}

impl From<OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>> for KnowledgeGraphOutwardEdge {
    fn from(edge: OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>) -> Self {
        Self::ToKnowledgeGraph(edge)
    }
}

impl From<OutwardEdge<SharedEdgeKind, EntityTypeVertexId>> for KnowledgeGraphOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, EntityTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::EntityType(edge.right_endpoint),
        })
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   Utoipa is not able to derive the correct schema for this as it has problems with generic
//   parameters.
impl ToSchema<'_> for KnowledgeGraphOutwardEdge {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "KnowledgeGraphOutwardEdge",
            OneOfBuilder::new()
                .item(
                    <OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>>::generate_schema(
                        "KnowledgeGraphToKnowledgeGraphOutwardEdge",
                    ),
                )
                .item(
                    <OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>>::generate_schema(
                        "KnowledgeGraphToOntologyOutwardEdge",
                    ),
                )
                .into(),
        )
    }
}

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    pub HashMap<EntityId, BTreeMap<Timestamp<VariableAxis>, Vec<KnowledgeGraphOutwardEdge>>>,
);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub HashMap<BaseUrl, BTreeMap<OntologyTypeVersion, Vec<OntologyOutwardEdge>>>,
);

#[derive(Serialize)]
pub struct Edges {
    #[serde(flatten)]
    pub ontology: OntologyRootedEdges,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphRootedEdges,
}

fn collect_merge<T: Hash + Eq, U: Ord, V>(
    mut accumulator: HashMap<T, BTreeMap<U, Vec<V>>>,
    (key, value): (T, BTreeMap<U, Vec<V>>),
) -> HashMap<T, BTreeMap<U, Vec<V>>> {
    match accumulator.entry(key) {
        Entry::Occupied(mut occupied) => {
            let entry = occupied.get_mut();

            for (revision, mut edges) in value {
                let buffer = entry.entry(revision).or_default();
                buffer.append(&mut edges);
            }
        }
        Entry::Vacant(vacant) => {
            // hot path, instead of merging one by one, just replace
            vacant.insert(value);
        }
    }

    accumulator
}

impl From<crate::subgraph::edges::Edges> for Edges {
    fn from(edges: crate::subgraph::edges::Edges) -> Self {
        Self {
            ontology: OntologyRootedEdges(
                edges
                    .entity_type_to_entity_type
                    .into_flattened::<OntologyOutwardEdge>()
                    .chain(
                        edges
                            .entity_type_to_property_type
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .chain(
                        edges
                            .property_type_to_property_type
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .chain(
                        edges
                            .property_type_to_data_type
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .fold(HashMap::new(), collect_merge),
            ),
            knowledge_graph: KnowledgeGraphRootedEdges(
                edges
                    .entity_to_entity
                    .into_flattened::<KnowledgeGraphOutwardEdge>()
                    .chain(
                        edges
                            .entity_to_entity_type
                            .into_flattened::<KnowledgeGraphOutwardEdge>(),
                    )
                    .fold(HashMap::new(), collect_merge),
            ),
        }
    }
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema<'_> for Edges {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "Edges",
            ObjectBuilder::new()
                .additional_properties(Some(Schema::from(
                    ObjectBuilder::new().additional_properties(Some(Array::new(
                        OneOfBuilder::new()
                            .item(Ref::from_schema_name(OntologyOutwardEdge::schema().0))
                            .item(Ref::from_schema_name(KnowledgeGraphOutwardEdge::schema().0)),
                    ))),
                )))
                .into(),
        )
    }
}

#[cfg(test)]
mod tests {
    use type_system::url::BaseUrl;
    use uuid::Uuid;

    use crate::{
        api::rest::utoipa_typedef::subgraph::Edges,
        identifier::{
            account::AccountId,
            knowledge::EntityId,
            ontology::OntologyTypeVersion,
            time::{ClosedTemporalBound, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp},
        },
        knowledge::EntityUuid,
        provenance::OwnedById,
        subgraph::{
            edges::{KnowledgeGraphEdgeKind, SharedEdgeKind},
            identifier::{EntityIdWithInterval, EntityTypeVertexId, EntityVertexId},
        },
    };

    #[test]
    fn merge_ontology() {
        let vertex_id = EntityVertexId {
            base_id: EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            },
            revision_id: Timestamp::now(),
        };

        let mut edges = crate::subgraph::edges::Edges::default();

        // the data used does not matter, what only matters is that we actually merged the data
        edges.entity_to_entity.insert(
            &vertex_id,
            KnowledgeGraphEdgeKind::HasRightEntity,
            false,
            EntityIdWithInterval {
                entity_id: EntityId {
                    owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                    entity_uuid: EntityUuid::new(Uuid::new_v4()),
                },
                interval: LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(Timestamp::now()),
                    OpenTemporalBound::Unbounded,
                ),
            },
        );

        edges.entity_to_entity_type.insert(
            &vertex_id,
            SharedEdgeKind::IsOfType,
            false,
            EntityTypeVertexId {
                base_id: BaseUrl::new("https://example.com/".to_owned())
                    .expect("should be valid URL"),
                revision_id: OntologyTypeVersion::new(0),
            },
        );

        let edges = Edges::from(edges);
        assert_eq!(edges.knowledge_graph.0.len(), 1);

        let (_, values) = edges
            .knowledge_graph
            .0
            .iter()
            .next()
            .expect("should have at least a single entry");
        assert_eq!(values.len(), 1);

        let (_, edges) = values
            .first_key_value()
            .expect("should have at least a single entry");
        assert_eq!(edges.len(), 2);
    }
}
