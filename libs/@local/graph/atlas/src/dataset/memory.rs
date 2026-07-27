//! An in-memory [`Dataset`] for tests and synthetic corpora.

use std::{collections::HashMap, io};

use futures::{Stream, StreamExt as _, stream};
use hashql_core::id::Id;
use smallvec::SmallVec;
use zerocopy::{LE, U64};

use super::{
    CANONICAL_DIMENSIONS, Dataset, Edge, Node, Ontology, OntologyRowId, TemporalAxes, card::Card,
};
use crate::{identity::Identity as _, math::BoxedVecN};

/// A [`Dataset`] held entirely in memory.
///
/// The dataset is a fixture: it serves whatever rows it was constructed with, and
/// [`new`](Self::new) validates the structural contracts once so every stream is consistent by
/// construction. Ids in all three domains are plain little-endian integers chosen by the caller.
///
/// Malformed lookups are programmer errors and panic, so the streams are infallible and
/// [`Dataset::Error`] is `!`.
pub(crate) struct MemoryDataset {
    nodes: Vec<Node<U64<LE>>>,
    edges: Vec<Edge<U64<LE>>>,
    ontology: Vec<Ontology<U64<LE>>>,
    canonical: HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
    cards: HashMap<u64, Card>,
}

impl MemoryDataset {
    /// Creates a dataset serving exactly the given rows.
    ///
    /// `canonical` maps node ids to their full canonical embeddings and may cover any subset of the
    /// nodes; requests outside the covered subset panic. `cards` maps ontology ids to their
    /// finished cards and must cover every ontology row once
    /// [`render_cards`](Dataset::render_cards) streams; uncovered rows panic there.
    ///
    /// # Panics
    ///
    /// Panics when the rows violate the dataset contracts: an edge endpoint or a type reference
    /// names a row outside its stream, or a type list is not strictly ascending.
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
                node.ontology
                    .array_windows::<2>()
                    .all(|[lhs, rhs]| lhs.get() < rhs.get()),
                "node row {row} carries a type list that is not strictly ascending",
            );
            assert!(
                node.ontology.last().is_none_or(|last| last.get() < types),
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
                edge.ontology
                    .array_windows::<2>()
                    .all(|[lhs, rhs]| lhs.get() < rhs.get()),
                "edge row {row} carries a type list that is not strictly ascending",
            );
            assert!(
                edge.ontology.last().is_none_or(|last| last.get() < types),
                "edge row {row} references a type row outside the ontology stream",
            );
        }

        for (row, entry) in ontology.iter().enumerate() {
            assert!(
                entry
                    .parents
                    .array_windows::<2>()
                    .all(|[lhs, rhs]| lhs.get() < rhs.get()),
                "ontology row {row} carries a parent list that is not strictly ascending",
            );
            assert!(
                entry.parents.last().is_none_or(|last| last.get() < types),
                "ontology row {row} references a parent row outside the ontology stream",
            );
        }

        Self {
            nodes,
            edges,
            ontology,
            canonical,
            cards,
        }
    }
}

impl Dataset for MemoryDataset {
    type EdgeId = U64<LE>;
    type Error = !;
    type NodeId = U64<LE>;
    type OntologyId = U64<LE>;

    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>> =
        impl Stream<Item = Result<(U64<LE>, BoxedVecN<CANONICAL_DIMENSIONS>), !>> + use<'this, I>;
    type CardStream<'this> = impl Stream<Item = io::Result<(U64<LE>, Card)>> + 'this;
    type EdgeStream<'this> = impl Stream<Item = Result<Edge<U64<LE>>, !>> + 'this;
    type NodeStream<'this> = impl Stream<Item = Result<Node<U64<LE>>, !>> + 'this;
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>> =
        impl Stream<Item = Result<(U64<LE>, SmallVec<OntologyRowId, 2>), !>> + use<'this, I>;
    type OntologyStream<'this> = impl Stream<Item = Result<Ontology<U64<LE>>, !>> + 'this;

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
    fn canonical_node_embeddings<I: Iterator<Item = U64<LE>>>(
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
    fn node_types<I: Iterator<Item = U64<LE>>>(&self, nodes: I) -> Self::NodeTypesStream<'_, I> {
        stream::iter(nodes).map(|id| {
            let node = self
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap_or_else(|| panic!("node {} is not in the fixture", id.get()));

            Ok::<_, !>((id, node.ontology.clone()))
        })
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
