//! An in-memory [`Dataset`] for tests and synthetic corpora.

use core::pin::Pin;
use std::{collections::HashMap, io};

use futures::{Stream, StreamExt as _, future::poll_fn, stream};
use tokio::io::AsyncWrite;
use zerocopy::{LE, U64};

use super::{CANONICAL_DIMENSIONS, Dataset, Edge, Node, Ontology};
use crate::math::BoxedVecN;

/// Writes all of `bytes` into a pinned, possibly unsized writer.
pub(super) async fn write_all<W>(mut write: Pin<&mut W>, mut bytes: &[u8]) -> io::Result<()>
where
    W: AsyncWrite + ?Sized,
{
    while !bytes.is_empty() {
        let written = poll_fn(|context| write.as_mut().poll_write(context, bytes)).await?;
        if written == 0 {
            return Err(io::ErrorKind::WriteZero.into());
        }
        bytes = &bytes[written..];
    }

    Ok(())
}

/// A [`Dataset`] held entirely in memory.
///
/// The dataset is a fixture: it serves whatever rows it was constructed
/// with, and [`new`](Self::new) validates the structural contracts once so
/// every stream is consistent by construction. Ids in all three domains
/// are plain little-endian integers chosen by the caller.
///
/// Malformed lookups are programmer errors and panic, so the streams are
/// infallible and [`Dataset::Error`] is `!`.
pub(crate) struct MemoryDataset {
    nodes: Vec<Node<U64<LE>>>,
    edges: Vec<Edge<U64<LE>>>,
    ontology: Vec<Ontology<U64<LE>>>,
    canonical: HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
    cards: HashMap<u64, String>,
}

impl MemoryDataset {
    /// Creates a dataset serving exactly the given rows.
    ///
    /// `canonical` maps node ids to their full canonical embeddings and
    /// `cards` maps ontology ids to their rendered card text; both may
    /// cover any subset of the rows, and lookups outside the covered
    /// subset panic when the corresponding method is called.
    ///
    /// # Panics
    ///
    /// Panics when the rows violate the dataset contracts: an edge
    /// endpoint or a type reference names a row outside its stream, or a
    /// type list is not strictly ascending.
    pub(crate) fn new(
        nodes: Vec<Node<U64<LE>>>,
        edges: Vec<Edge<U64<LE>>>,
        ontology: Vec<Ontology<U64<LE>>>,
        canonical: HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
        cards: HashMap<u64, String>,
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
                edge.source.get() < points && edge.target.get() < points,
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
    type EdgeStream<'this> = impl Stream<Item = Result<Edge<U64<LE>>, !>> + 'this;
    type NodeStream<'this> = impl Stream<Item = Result<Node<U64<LE>>, !>> + 'this;
    type OntologyStream<'this> = impl Stream<Item = Result<Ontology<U64<LE>>, !>> + 'this;

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
    /// The stream panics when a requested node has no canonical embedding
    /// in the fixture.
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

    /// Renders the fixture's card text for one ontology type into `write`.
    ///
    /// # Panics
    ///
    /// Panics when the fixture holds no card for `id`.
    ///
    /// # Errors
    ///
    /// Returns an error when the writer fails.
    async fn render_card<W>(&self, id: U64<LE>, write: Pin<&mut W>) -> io::Result<()>
    where
        W: AsyncWrite + ?Sized,
    {
        let card = self
            .cards
            .get(&id.get())
            .unwrap_or_else(|| panic!("ontology type {} has no card", id.get()));

        write_all(write, card.as_bytes()).await
    }
}
