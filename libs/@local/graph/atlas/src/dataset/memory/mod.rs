//! An in-memory [`Dataset`] for tests and synthetic corpora.

mod id;

use std::{collections::HashMap, io};

use futures::{Stream, StreamExt as _, stream};
use hashql_core::id::Id as _;
use smallvec::SmallVec;
use zerocopy::{LE, U64};

pub(crate) use self::id::{MemoryEdgeId, MemoryNodeId, MemoryOntologyId};
use super::{
    CANONICAL_DIMENSIONS, Dataset, Edge, Node, Ontology, OntologyRowId, TemporalAxes,
    auxiliary::{OwnedIcon, OwnedLegend},
    card::Card,
};
use crate::math::BoxedVecN;

/// The construction-time legend of a row: its first direct type under the empty label.
///
/// A typeless row's legend names ontology row 0.
fn default_legend(ontology: &[OntologyRowId]) -> OwnedLegend {
    OwnedLegend::new(
        ontology.first().copied().unwrap_or(OntologyRowId::new(0)),
        "",
    )
}

/// A [`Dataset`] held entirely in memory.
///
/// The dataset is a fixture. It serves exactly the rows the caller supplies, and [`new`](Self::new)
/// validates the structural contracts once, so every stream is consistent by construction. Ids in
/// all three domains are plain little-endian integers chosen by the caller, and the streams serve
/// them as the typed memory ids.
///
/// Malformed lookups are programmer errors and panic, so the streams are infallible and
/// [`Dataset::Error`] is `!`.
pub(crate) struct MemoryDataset {
    nodes: Vec<Node<MemoryNodeId>>,
    edges: Vec<Edge<MemoryEdgeId>>,
    ontology: Vec<Ontology<MemoryOntologyId>>,
    canonical: HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
    cards: HashMap<u64, Card>,
    /// Display legends by node row, one entry per node.
    ///
    /// [`new`](Self::new) fills the column with each node's first direct type under the empty
    /// label, and a typeless node's entry names ontology row 0. Assigning a replacement column
    /// gives the fixture display text and representatives of its own choosing. Its length must
    /// stay one entry per node row.
    pub node_legends: Vec<OwnedLegend>,
    /// Display legends by edge row, one entry per edge.
    ///
    /// Filled by construction, replaceable, and one entry per edge row, as for
    /// [`node_legends`](Self::node_legends).
    pub edge_legends: Vec<OwnedLegend>,
    /// Display icons by ontology row, one entry per type.
    ///
    /// Empty by construction, replaceable, and one entry per ontology row, as for
    /// [`node_legends`](Self::node_legends).
    pub ontology_icons: Vec<OwnedIcon>,
}

impl MemoryDataset {
    /// Creates a dataset serving exactly the given rows.
    ///
    /// `canonical` maps node ids to their full canonical embeddings and may cover any subset of the
    /// nodes. Requests outside the covered subset panic. `cards` maps ontology ids to their
    /// finished cards and must cover every ontology row once
    /// [`render_cards`](Dataset::render_cards) streams. Uncovered rows panic there.
    ///
    /// # Panics
    ///
    /// This panics when an edge endpoint or a type reference names a row outside its stream, or
    /// when a type list is not strictly ascending.
    pub(crate) fn new(
        nodes: Vec<Node<U64<LE>>>,
        edges: Vec<Edge<U64<LE>>>,
        ontology: Vec<Ontology<U64<LE>>>,
        canonical: HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
        cards: HashMap<u64, Card>,
    ) -> Self {
        let types = ontology.len() as u64;

        for (row, node) in nodes.iter().enumerate() {
            assert!(
                node.ontology.is_sorted_by(|previous, next| previous < next),
                "node row {row} carries a type list that is not strictly ascending",
            );
            assert!(
                node.ontology
                    .last()
                    .is_none_or(|last| last.as_u64() < types),
                "node row {row} references a type row outside the ontology stream",
            );
        }

        for (row, edge) in edges.iter().enumerate() {
            let points = nodes.len() as u64;
            assert!(
                edge.source.as_u64() < points && edge.target.as_u64() < points,
                "edge row {row} references a node row outside the node stream",
            );
            assert!(
                edge.ontology.is_sorted_by(|previous, next| previous < next),
                "edge row {row} carries a type list that is not strictly ascending",
            );
            assert!(
                edge.ontology
                    .last()
                    .is_none_or(|last| last.as_u64() < types),
                "edge row {row} references a type row outside the ontology stream",
            );
        }

        for (row, entry) in ontology.iter().enumerate() {
            assert!(
                entry.parents.is_sorted_by(|previous, next| previous < next),
                "ontology row {row} carries a parent list that is not strictly ascending",
            );
            assert!(
                entry
                    .parents
                    .last()
                    .is_none_or(|last| last.as_u64() < types),
                "ontology row {row} references a parent row outside the ontology stream",
            );
        }

        Self {
            node_legends: nodes
                .iter()
                .map(|node| default_legend(&node.ontology))
                .collect(),
            edge_legends: edges
                .iter()
                .map(|edge| default_legend(&edge.ontology))
                .collect(),
            ontology_icons: vec![OwnedIcon::default(); ontology.len()],
            nodes: nodes
                .into_iter()
                .map(|node| Node {
                    id: MemoryNodeId::new(node.id.get()),
                    ontology: node.ontology,
                    embedding: node.embedding,
                    confidence: node.confidence,
                })
                .collect(),
            edges: edges
                .into_iter()
                .map(|edge| Edge {
                    id: MemoryEdgeId::new(edge.id.get()),
                    source: edge.source,
                    target: edge.target,
                    ontology: edge.ontology,
                    embedding: edge.embedding,
                    confidence: edge.confidence,
                    source_confidence: edge.source_confidence,
                    target_confidence: edge.target_confidence,
                })
                .collect(),
            ontology: ontology
                .into_iter()
                .map(|entry| Ontology {
                    id: MemoryOntologyId::new(entry.id.get()),
                    parents: entry.parents,
                })
                .collect(),
            canonical,
            cards,
        }
    }
}

impl Dataset for MemoryDataset {
    type EdgeId = MemoryEdgeId;
    type Error = !;
    type NodeId = MemoryNodeId;
    type OntologyId = MemoryOntologyId;

    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>> = impl Stream<Item = Result<(MemoryNodeId, BoxedVecN<CANONICAL_DIMENSIONS>), !>>
        + use<'this, I>;
    type CardStream<'this> = impl Stream<Item = io::Result<(MemoryOntologyId, Card)>> + 'this;
    type EdgeAuxiliaryPayloadStream<'this> = impl Stream<Item = Result<OwnedLegend, !>> + 'this;
    type EdgeStream<'this> = impl Stream<Item = Result<Edge<MemoryEdgeId>, !>> + 'this;
    type NodeAuxiliaryPayloadStream<'this> = impl Stream<Item = Result<OwnedLegend, !>> + 'this;
    type NodeStream<'this> = impl Stream<Item = Result<Node<MemoryNodeId>, !>> + 'this;
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>> =
        impl Stream<Item = Result<(MemoryNodeId, SmallVec<OntologyRowId, 2>), !>> + use<'this, I>;
    type OntologyAuxiliaryPayloadStream<'this> = impl Stream<Item = Result<OwnedIcon, !>> + 'this;
    type OntologyStream<'this> = impl Stream<Item = Result<Ontology<MemoryOntologyId>, !>> + 'this;

    fn axes(&self) -> Option<TemporalAxes> {
        None
    }

    fn nodes(&self) -> Self::NodeStream<'_> {
        stream::iter(self.nodes.iter().cloned().map(Ok::<_, !>))
    }

    fn edges(&self) -> Self::EdgeStream<'_> {
        stream::iter(self.edges.iter().cloned().map(Ok::<_, !>))
    }

    fn ontology(&self) -> Self::OntologyStream<'_> {
        stream::iter(self.ontology.iter().cloned().map(Ok::<_, !>))
    }

    /// Opens a stream of canonical embeddings for the given nodes.
    ///
    /// # Panics
    ///
    /// The stream panics when a requested node has no canonical embedding in the fixture.
    fn canonical_node_embeddings<I: Iterator<Item = MemoryNodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        stream::iter(nodes).map(|id| {
            let embedding = self
                .canonical
                .get(&id.get())
                .unwrap_or_else(|| panic!("node {} has no canonical embedding", id.get()));

            Ok::<_, !>((id, embedding.clone()))
        })
    }

    /// Opens a stream of direct-type lists for the given nodes.
    ///
    /// # Panics
    ///
    /// The stream panics when a requested node is not in the fixture.
    fn node_types<I: Iterator<Item = MemoryNodeId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I> {
        stream::iter(nodes).map(|id| {
            let node = self
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap_or_else(|| panic!("node {} is not in the fixture", id.get()));

            Ok::<_, !>((id, node.ontology.clone()))
        })
    }

    /// Opens the stream of fixture node legends, in row order.
    ///
    /// # Panics
    ///
    /// The stream panics when [`node_legends`](Self::node_legends) does not hold exactly one
    /// entry per node row.
    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_> {
        assert_eq!(
            self.node_legends.len(),
            self.nodes.len(),
            "the fixture carries one legend per node row",
        );
        stream::iter(self.node_legends.iter().cloned().map(Ok::<_, !>))
    }

    /// Opens the stream of fixture edge legends, in row order.
    ///
    /// # Panics
    ///
    /// The stream panics when [`edge_legends`](Self::edge_legends) does not hold exactly one
    /// entry per edge row.
    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_> {
        assert_eq!(
            self.edge_legends.len(),
            self.edges.len(),
            "the fixture carries one legend per edge row",
        );
        stream::iter(self.edge_legends.iter().cloned().map(Ok::<_, !>))
    }

    /// Opens the stream of fixture ontology icons, in row order.
    ///
    /// # Panics
    ///
    /// The stream panics when [`ontology_icons`](Self::ontology_icons) does not hold exactly
    /// one entry per ontology row.
    fn ontology_auxiliary_payload(&self) -> Self::OntologyAuxiliaryPayloadStream<'_> {
        assert_eq!(
            self.ontology_icons.len(),
            self.ontology.len(),
            "the fixture carries one icon per ontology row",
        );
        stream::iter(self.ontology_icons.iter().cloned().map(Ok::<_, !>))
    }

    /// Opens the stream of fixture cards, in ontology row order.
    ///
    /// # Panics
    ///
    /// The stream panics when the fixture holds no card for an ontology row's type.
    fn render_cards(&self) -> Self::CardStream<'_> {
        stream::iter(self.ontology.iter().map(|entry| {
            let card = self
                .cards
                .get(&entry.id.get())
                .unwrap_or_else(|| panic!("ontology type {} has no card", entry.id.get()));

            Ok((entry.id, card.clone()))
        }))
    }
}
