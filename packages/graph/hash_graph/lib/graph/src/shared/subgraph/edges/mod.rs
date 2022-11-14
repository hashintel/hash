use std::collections::{btree_map::Entry, BTreeMap, BTreeSet};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{openapi, ToSchema};

use crate::identifier::{
    knowledge::{EntityId, EntityVersion},
    ontology::OntologyTypeVersion,
    GraphElementEditionId,
};

mod edge;
mod kind;

pub use self::{
    edge::{GenericOutwardEdge, KnowledgeGraphOutwardEdges, OntologyOutwardEdges, OutwardEdge},
    kind::{KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
};

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub BTreeMap<BaseUri, BTreeMap<OntologyTypeVersion, BTreeSet<OntologyOutwardEdges>>>,
);

// This is needed because Utoipa doesn't know how to handle the BTreeMaps
impl ToSchema for OntologyRootedEdges {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .additional_properties(Some(openapi::Schema::from(
                openapi::ObjectBuilder::new().additional_properties(Some(openapi::Array::new(
                    openapi::Ref::from_schema_name("OntologyOutwardEdges"),
                ))),
            )))
            .into()
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    pub BTreeMap<EntityId, BTreeMap<EntityVersion, BTreeSet<KnowledgeGraphOutwardEdges>>>,
);

// This is needed because Utoipa doesn't know how to handle the BTreeMaps
impl ToSchema for KnowledgeGraphRootedEdges {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .additional_properties(Some(openapi::Schema::from(
                openapi::ObjectBuilder::new().additional_properties(Some(openapi::Array::new(
                    openapi::Ref::from_schema_name("KnowledgeGraphOutwardEdges"),
                ))),
            )))
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Edges {
    #[serde(flatten)]
    ontology: OntologyRootedEdges,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphRootedEdges,
}

impl Edges {
    pub fn new() -> Self {
        Self {
            ontology: OntologyRootedEdges(BTreeMap::new()),
            knowledge_graph: KnowledgeGraphRootedEdges(BTreeMap::new()),
        }
    }

    pub fn insert(&mut self, identifier: GraphElementEditionId, outward_edge: OutwardEdge) -> bool {
        match identifier {
            GraphElementEditionId::Ontology(ontology_edition_id) => {
                let OutwardEdge::Ontology(outward_edge) = outward_edge else {
                    panic!("tried to insert a knowledge-graph edge from an ontology element");
                };

                let map = self
                    .ontology
                    .0
                    .entry(ontology_edition_id.base_id().clone())
                    .or_insert(BTreeMap::new());

                match map.entry(ontology_edition_id.version()) {
                    Entry::Occupied(entry) => {
                        let set = entry.into_mut();
                        set.insert(outward_edge)
                    }
                    Entry::Vacant(entry) => {
                        entry.insert(BTreeSet::from([outward_edge]));
                        true
                    }
                }
            }
            GraphElementEditionId::KnowledgeGraph(entity_edition_id) => {
                let OutwardEdge::KnowledgeGraph(outward_edge) = outward_edge else {
                    panic!("tried to insert an ontology edge from a knowledge-graph element");
                };

                let map = self
                    .knowledge_graph
                    .0
                    .entry(entity_edition_id.base_id())
                    .or_insert(BTreeMap::new());

                match map.entry(entity_edition_id.version().clone()) {
                    Entry::Occupied(entry) => {
                        let set = entry.into_mut();
                        set.insert(outward_edge)
                    }
                    Entry::Vacant(entry) => {
                        entry.insert(BTreeSet::from([outward_edge]));
                        true
                    }
                }
            }
        }
    }

    pub fn extend(&mut self, other: Self) {
        self.ontology.0.extend(other.ontology.0.into_iter());
        self.knowledge_graph
            .0
            .extend(other.knowledge_graph.0.into_iter());
    }
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema for Edges {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .additional_properties(Some(openapi::Schema::from(
                openapi::ObjectBuilder::new().additional_properties(Some(openapi::Array::new(
                    openapi::OneOfBuilder::new()
                        .item(openapi::Ref::from_schema_name("OntologyOutwardEdges"))
                        .item(openapi::Ref::from_schema_name("KnowledgeGraphOutwardEdges")),
                ))),
            )))
            .into()
    }
}
