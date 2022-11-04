use std::{
    cmp::Ordering,
    collections::{btree_map::Entry, BTreeMap, BTreeSet},
};

use serde::Serialize;
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

use crate::identifier::{
    EntityAndTimestamp, EntityIdentifier, GraphElementEditionIdentifier, OntologyTypeVersion,
    Timestamp,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OntologyEdgeKind {
    /// An [`OntologyType`] can inherit from another [`OntologyType`]
    InheritsFrom,
    /// A [`PropertyType`] or [`DataType`] can reference a [`DataType`] to constrain values
    ConstrainsValuesOn,
    /// An [`EntityType`] or [`PropertyType`] can reference a [`PropertyType`] to constrain
    /// properties
    ConstrainsPropertiesOn,
    /// An [`EntityType`] can reference a [`Link`] [`EntityType`] to constrain the existence of
    /// certain kinds of [`Link`]s
    ConstrainsLinksOn,
    /// An [`EntityType`] can reference an [`EntityType`] to constrain the target entities of
    /// certain kinds of [`Link`]s
    ConstrainsLinkDestinationsOn,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KnowledgeGraphEdgeKind {
    /// This [`Entity`] has an outgoing [`Link`] [`Entity`]
    HasLink,
    /// This [`Link`] [`Entity`] has another [`Entity`] at its end
    HasEndpoint,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedEdgeKind {
    /// An [`Entity`] is of an [`EntityType`]
    IsOfType,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GenericOutwardEdge<E, V>
where
    E: Serialize,
    V: Serialize,
{
    kind: E,
    /// If true, interpret this as a reversed mapping and the endpoint as the source, that is,
    /// instead of Source-Edge-Target, interpret it as Target-Edge-Source
    reversed: bool,
    endpoint: V,
}

impl<E, V> PartialOrd for GenericOutwardEdge<E, V>
where
    E: Serialize + PartialEq,
    V: Serialize + PartialOrd + PartialEq,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.endpoint.partial_cmp(&other.endpoint)
    }
}

impl<E, V> Ord for GenericOutwardEdge<E, V>
where
    E: Serialize + Eq,
    V: Serialize + Ord + Eq,
{
    fn cmp(&self, other: &Self) -> Ordering {
        self.endpoint.cmp(&other.endpoint)
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
#[serde(untagged)]
pub enum OntologyOutwardEdges {
    ToOntology(GenericOutwardEdge<OntologyEdgeKind, VersionedUri>),
    ToKnowledgeGraph(GenericOutwardEdge<SharedEdgeKind, EntityIdentifier>),
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdges {
    ToKnowledgeGraph(GenericOutwardEdge<KnowledgeGraphEdgeKind, EntityAndTimestamp>),
    ToOntology(GenericOutwardEdge<SharedEdgeKind, VersionedUri>),
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
#[serde(untagged)]
pub enum OutwardEdge {
    Ontology(OntologyOutwardEdges),
    KnowledgeGraph(KnowledgeGraphOutwardEdges),
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub BTreeMap<BaseUri, BTreeMap<OntologyTypeVersion, BTreeSet<OntologyOutwardEdges>>>,
);

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    pub BTreeMap<EntityIdentifier, BTreeMap<Timestamp, BTreeSet<KnowledgeGraphOutwardEdges>>>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
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

    pub fn insert(
        &mut self,
        identifier: GraphElementEditionIdentifier,
        outward_edge: OutwardEdge,
    ) -> bool {
        match identifier {
            GraphElementEditionIdentifier::OntologyElementEditionId(versioned_uri) => {
                let OutwardEdge::Ontology(outward_edge) = outward_edge else {
                    panic!("tried to insert a knowledge-graph edge from an ontology element");
                };

                let map = self
                    .ontology
                    .0
                    .entry(versioned_uri.base_uri().clone())
                    .or_insert(BTreeMap::new());

                match map.entry(versioned_uri.version()) {
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
            GraphElementEditionIdentifier::KnowledgeGraphElementEditionId(
                entity_edition_identifier,
            ) => {
                let OutwardEdge::KnowledgeGraph(outward_edge) = outward_edge else {
                    panic!("tried to insert an ontology edge from a knowledge-graph element");
                };

                let map = self
                    .knowledge_graph
                    .0
                    .entry(entity_edition_identifier.entity_identifier())
                    .or_insert(BTreeMap::new());

                match map.entry(entity_edition_identifier.version().clone()) {
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
