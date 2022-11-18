use std::collections::{hash_map::Entry, HashMap, HashSet};

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

#[derive(Default, Debug, Serialize)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    // TODO: expose it through methods instead of making this field `pub`
    //   see https://app.asana.com/0/1202805690238892/1203358665695491/f
    pub HashMap<BaseUri, HashMap<OntologyTypeVersion, HashSet<OntologyOutwardEdges>>>,
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

#[derive(Default, Debug, Serialize)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    // TODO: expose it through methods instead of making this field `pub`
    //   see https://app.asana.com/0/1202805690238892/1203358665695491/f
    pub HashMap<EntityId, HashMap<EntityVersion, HashSet<KnowledgeGraphOutwardEdges>>>,
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

#[derive(Default, Debug, Serialize)]
pub struct Edges {
    #[serde(flatten)]
    ontology: OntologyRootedEdges,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphRootedEdges,
}

impl Edges {
    #[must_use]
    pub fn new() -> Self {
        Self {
            ontology: OntologyRootedEdges(HashMap::new()),
            knowledge_graph: KnowledgeGraphRootedEdges(HashMap::new()),
        }
    }

    /// Inserts an edge identified by `identifier` to the edge set.
    ///
    /// Returns whether the value was newly inserted. That is:
    ///
    /// - If the set did not previously contain this value, `true` is returned.
    /// - If the set already contained this value, `false` is returned.
    ///
    /// # Panics
    ///
    /// - if the `identifier` and `outward_edge` parameters are incompatible
    pub fn insert(&mut self, identifier: GraphElementEditionId, outward_edge: OutwardEdge) -> bool {
        match (identifier, outward_edge) {
            (
                GraphElementEditionId::Ontology(ontology_edition_id),
                OutwardEdge::Ontology(outward_edge),
            ) => {
                let map = self
                    .ontology
                    .0
                    .entry(ontology_edition_id.base_id().clone())
                    .or_default();

                match map.entry(ontology_edition_id.version()) {
                    Entry::Occupied(entry) => entry.into_mut().insert(outward_edge),
                    Entry::Vacant(entry) => {
                        entry.insert(HashSet::from([outward_edge]));
                        true
                    }
                }
            }
            (
                GraphElementEditionId::KnowledgeGraph(entity_edition_id),
                OutwardEdge::KnowledgeGraph(outward_edge),
            ) => {
                let map = self
                    .knowledge_graph
                    .0
                    .entry(entity_edition_id.base_id())
                    .or_default();

                match map.entry(entity_edition_id.version()) {
                    Entry::Occupied(entry) => entry.into_mut().insert(outward_edge),
                    Entry::Vacant(entry) => {
                        entry.insert(HashSet::from([outward_edge]));
                        true
                    }
                }
            }
            (GraphElementEditionId::Ontology(_), OutwardEdge::KnowledgeGraph(_)) => {
                panic!("tried to insert an knowledge edge from a ontology-graph element")
            }
            (GraphElementEditionId::KnowledgeGraph(_), OutwardEdge::Ontology(_)) => {
                panic!("tried to insert an ontology edge from a knowledge-graph element")
            }
        }
    }

    pub fn extend(&mut self, other: Self) {
        for (key, value) in other.ontology.0.into_iter() {
            match self.ontology.0.entry(key) {
                Entry::Occupied(entry) => {
                    entry.into_mut().extend(value);
                }
                Entry::Vacant(entry) => {
                    entry.insert(value);
                }
            }
        }
        for (key, value) in other.knowledge_graph.0.into_iter() {
            match self.knowledge_graph.0.entry(key) {
                Entry::Occupied(entry) => {
                    entry.into_mut().extend(value);
                }
                Entry::Vacant(entry) => {
                    entry.insert(value);
                }
            }
        }
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
