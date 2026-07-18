//! Fit inputs behind one trait.
//!
//! A [`Dataset`] is the pipeline's only window onto the graph it maps. It
//! exposes four row-ordered streams - [`nodes`], [`edges`], [`ontology`],
//! and [`render_cards`] - plus a probe fetch for canonical embeddings.
//! Everything the fit learns about the graph arrives through these five
//! methods; where the data physically lives (a live Postgres store, a
//! synthetic fixture) is an implementation concern the pipeline cannot
//! observe.
//!
//! # Rows and identity
//!
//! Every stream assigns dense ids by position: the `n`-th item of a stream
//! occupies row `n`. There is no row field to keep consistent - position
//! is the assignment. Cross-references use the typed row ids
//! ([`NodeRowId`], [`EdgeRowId`], [`OntologyRowId`]), so an edge names its
//! endpoints by node row and a node names its types by ontology row.
//!
//! Source identifiers ([`Dataset::NodeId`], [`Dataset::EdgeId`],
//! [`Dataset::OntologyId`]) are opaque to the pipeline: they are byte-level
//! stable (the zerocopy bounds), which is exactly enough to persist them
//! into the identity artifacts that let serving translate rows back to
//! graph identities. The pipeline itself computes on rows alone.
//!
//! # Snapshot semantics
//!
//! All streams of one dataset observe a single frozen view of the graph:
//! two streams never disagree about which entities exist or what they
//! contain. Implementations that read from a live store hold one
//! repeatable-read transaction open for the dataset's lifetime.
//!
//! Streams from one dataset may share a connection and therefore
//! serialize; consumers drain one stream to completion before starting the
//! next. The pipeline ingests nodes, then edges, then ontology.
//!
//! # Types travel direct, closure is derived
//!
//! Nodes and edges carry their **direct** types only. The ontology stream
//! carries each type's direct supertypes, so the full inheritance
//! structure is available as a small graph and every closure question
//! (admission checks, card rendering, serving-side filter expansion) is
//! answered by reachability over it rather than by materialized per-node
//! closures. One structure is the authority for inheritance; per-node
//! closure data that could disagree with it never exists.
//!
//! [`nodes`]: Dataset::nodes
//! [`edges`]: Dataset::edges
//! [`ontology`]: Dataset::ontology
//! [`render_cards`]: Dataset::render_cards
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::ops::Deref;
use std::io;

use futures::Stream;
use smallvec::SmallVec;
use type_system::{
    knowledge::entity::id::EntityUuid, ontology::id::OntologyTypeUuid,
    principal::actor_group::WebId,
};
use zerocopy::{LE, U64};

use self::card::Card;
use crate::math::BoxedVecN;

pub(crate) mod card;
pub(crate) mod memory;
pub(crate) mod postgres;

#[cfg(test)]
mod tests;

/// Components in a canonical entity embedding as the store persists it.
pub(crate) const CANONICAL_DIMENSIONS: usize = 3072;

/// Components in the projector representation: the l2-normalized leading
/// slice of the canonical embedding.
pub(crate) const PROJECTOR_DIMENSIONS: usize = 512;

/// The byte-level form of an [`EntityUuid`].
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct ArchivedEntityUuid([u8; 16]);

impl From<uuid::Uuid> for ArchivedEntityUuid {
    #[inline]
    fn from(id: uuid::Uuid) -> Self {
        Self(id.into_bytes())
    }
}

impl Deref for ArchivedEntityUuid {
    type Target = EntityUuid;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<EntityUuid>());
            assert!(align_of::<Self>() == align_of::<EntityUuid>());
        }

        let ptr = &raw const *self;
        // SAFETY: `Self` is `repr(transparent)` over `[u8; 16]`, and the
        // target chain `EntityUuid(Uuid)`, `Uuid([u8; 16])` is
        // `repr(transparent)` at every link.
        unsafe { &*ptr.cast::<EntityUuid>() }
    }
}

/// The byte-level form of a [`WebId`].
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct ArchivedWebId([u8; 16]);

impl From<uuid::Uuid> for ArchivedWebId {
    #[inline]
    fn from(id: uuid::Uuid) -> Self {
        Self(id.into_bytes())
    }
}

impl Deref for ArchivedWebId {
    type Target = WebId;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<WebId>());
            assert!(align_of::<Self>() == align_of::<WebId>());
        }

        let ptr = &raw const *self;
        // SAFETY: as for `ArchivedEntityUuid`; the chain here is
        // `WebId(ActorGroupEntityUuid)`, `ActorGroupEntityUuid(EntityUuid)`,
        // `EntityUuid(Uuid)`, `Uuid([u8; 16])`, transparent at every link.
        unsafe { &*ptr.cast::<WebId>() }
    }
}

/// The byte-level form of an [`OntologyTypeUuid`].
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct ArchivedOntologyTypeUuid([u8; 16]);

impl From<uuid::Uuid> for ArchivedOntologyTypeUuid {
    #[inline]
    fn from(id: uuid::Uuid) -> Self {
        Self(id.into_bytes())
    }
}

impl Deref for ArchivedOntologyTypeUuid {
    type Target = OntologyTypeUuid;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<OntologyTypeUuid>());
            assert!(align_of::<Self>() == align_of::<OntologyTypeUuid>());
        }

        let ptr = &raw const *self;
        // SAFETY: as for `ArchivedEntityUuid`; the chain here is
        // `OntologyTypeUuid(Uuid)`, `Uuid([u8; 16])`, transparent at every
        // link.
        unsafe { &*ptr.cast::<OntologyTypeUuid>() }
    }
}

/// A reference to a node by its position in [`Dataset::nodes`].
///
/// Rows are dense and zero-based: the value is the position of the
/// referenced node in the stream. The little-endian representation is the
/// persisted form, so a column of these ids is written to and read from
/// artifact files without conversion.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct NodeRowId(U64<LE>);

impl NodeRowId {
    /// Creates an id referencing the node at `row`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(row: u64) -> Self {
        Self(U64::new(row))
    }

    /// Returns the referenced stream position.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }
}

/// A reference to an edge by its position in [`Dataset::edges`].
///
/// Rows are dense and zero-based: the value is the position of the
/// referenced edge in the stream. The little-endian representation is the
/// persisted form, so a column of these ids is written to and read from
/// artifact files without conversion.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct EdgeRowId(U64<LE>);

impl EdgeRowId {
    /// Creates an id referencing the edge at `row`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(row: u64) -> Self {
        Self(U64::new(row))
    }

    /// Returns the referenced stream position.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }
}

/// A reference to a type by its position in [`Dataset::ontology`].
///
/// Rows are dense and zero-based: the value is the position of the
/// referenced type in the stream. The little-endian representation is the
/// persisted form, so a column of these ids is written to and read from
/// artifact files without conversion.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct OntologyRowId(U64<LE>);

impl OntologyRowId {
    /// Creates an id referencing the type at `row`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(row: u64) -> Self {
        Self(U64::new(row))
    }

    /// Returns the referenced stream position.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }

    /// Returns the row as an index into a row-aligned column.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "row ids index in-memory columns, which cannot outgrow the address space"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn index(self) -> usize {
        self.0.get() as usize
    }
}

/// The byte-level form of a non-draft entity identity.
///
/// Drafts never enter a dataset's scope; the identity is the web and
/// entity components alone.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct ArchivedEntityId {
    /// The web the entity belongs to.
    pub web_id: ArchivedWebId,
    /// The entity's identity within its web.
    pub entity_uuid: ArchivedEntityUuid,
}

/// One type in the generation's type table.
#[derive(Debug, Clone)]
pub(crate) struct Ontology<O> {
    /// The source identifier, persisted so serving can translate ontology
    /// rows back to graph type ids.
    pub id: O,

    /// Direct supertypes, ascending by ontology row and deduplicated.
    ///
    /// Only depth-one edges appear; ancestors beyond the direct parents
    /// are reached by walking the type graph. A parent may occupy a later
    /// stream position than its child, so references resolve only once
    /// the ontology stream is fully ingested.
    pub parents: SmallVec<OntologyRowId, 2>,
}

/// One entity of the graph: a point the fit places on the map.
#[derive(Debug, Clone)]
pub(crate) struct Node<N> {
    /// The source identifier, persisted so serving can translate node rows
    /// back to graph identities.
    pub id: N,

    /// Direct types, ascending by ontology row and deduplicated.
    pub ontology: SmallVec<OntologyRowId, 2>,

    /// The projector representation: the entity embedding's leading
    /// [`PROJECTOR_DIMENSIONS`] components, l2-normalized at the source.
    ///
    /// The norm is 1 up to `f32` rounding and every component is finite.
    /// The pipeline spot-checks this contract statistically. Every node
    /// carries an embedding: entities without one are outside every
    /// dataset's scope, and the row domain equals the placeable domain.
    pub embedding: BoxedVecN<PROJECTOR_DIMENSIONS>,

    /// The store's confidence in the entity, in `0.0..=1.0`.
    ///
    /// `None` is unscored, which consumers treat as the neutral factor 1
    /// while retaining the scored/unscored distinction.
    // f64 mirrors the store schema (DOUBLE PRECISION); working precision
    // narrows to f32 at the point of use.
    pub confidence: Option<f64>,
}

/// One link between two nodes.
///
/// Links are entities in the graph, so an edge has its own identity, its
/// own types (which identify the relation), and, when the store holds one,
/// own embedding.
#[derive(Debug, Clone)]
pub(crate) struct Edge<E> {
    /// The source identifier, persisted so serving can translate edge rows
    /// back to graph identities.
    pub id: E,

    /// The node the link points from.
    pub source: NodeRowId,

    /// The node the link points to.
    pub target: NodeRowId,

    /// Direct types of the link entity, ascending by ontology row and
    /// deduplicated.
    pub ontology: SmallVec<OntologyRowId, 2>,

    /// The link entity's own embedding prefix, under the same contract as
    /// [`Node::embedding`], when the store holds one.
    pub embedding: Option<BoxedVecN<PROJECTOR_DIMENSIONS>>,

    /// The store's confidence in the link itself, in `0.0..=1.0`.
    ///
    /// `None` is unscored, which consumers treat as the neutral factor 1
    /// while retaining the scored/unscored distinction. The same reading
    /// applies to [`source_confidence`](Self::source_confidence) and
    /// [`target_confidence`](Self::target_confidence).
    pub confidence: Option<f64>,

    /// The store's confidence in the link's attachment to
    /// [`source`](Self::source), in `0.0..=1.0`.
    pub source_confidence: Option<f64>,

    /// The store's confidence in the link's attachment to
    /// [`target`](Self::target), in `0.0..=1.0`.
    pub target_confidence: Option<f64>,
}

/// The data one fit runs over, wherever it lives.
///
/// See the [module documentation](self) for the row, snapshot, and type
/// contracts every implementation upholds. In short: streams assign dense
/// ids by position, all streams observe one frozen view of the graph, and
/// types travel as direct types plus a parent graph.
pub(crate) trait Dataset {
    /// The source identifier of a node.
    ///
    /// Byte-level stable so identity columns persist as raw bytes; opaque
    /// to the pipeline otherwise.
    type NodeId: Copy
        + zerocopy::IntoBytes
        + zerocopy::FromBytes
        + zerocopy::Immutable
        + zerocopy::Unaligned
        + zerocopy::KnownLayout;

    /// The source identifier of an edge.
    ///
    /// Byte-level stable so identity columns persist as raw bytes; opaque
    /// to the pipeline otherwise.
    type EdgeId: Copy
        + zerocopy::IntoBytes
        + zerocopy::FromBytes
        + zerocopy::Immutable
        + zerocopy::Unaligned
        + zerocopy::KnownLayout;

    /// The source identifier of an ontology type.
    ///
    /// Byte-level stable so the type table persists as raw bytes; opaque
    /// to the pipeline otherwise.
    type OntologyId: Copy
        + zerocopy::IntoBytes
        + zerocopy::FromBytes
        + zerocopy::Immutable
        + zerocopy::Unaligned
        + zerocopy::KnownLayout;

    /// The failure produced when the underlying source cannot deliver.
    type Error: core::error::Error + Send + Sync + 'static;

    /// The stream of nodes, in row order.
    type NodeStream<'this>: Stream<Item = Result<Node<Self::NodeId>, Self::Error>>
    where
        Self: 'this;

    /// The stream of edges, in row order.
    type EdgeStream<'this>: Stream<Item = Result<Edge<Self::EdgeId>, Self::Error>>
    where
        Self: 'this;

    /// The stream of ontology types, in row order.
    type OntologyStream<'this>: Stream<Item = Result<Ontology<Self::OntologyId>, Self::Error>>
    where
        Self: 'this;

    /// The stream of requested canonical embeddings.
    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>>: Stream<
        Item = Result<(Self::NodeId, BoxedVecN<CANONICAL_DIMENSIONS>), Self::Error>,
    >
    where
        Self: 'this;

    /// The stream of finished cards, in ontology row order.
    type CardStream<'this>: Stream<Item = io::Result<(Self::OntologyId, Card)>>
    where
        Self: 'this;

    /// Opens the node stream.
    ///
    /// The `n`-th item occupies node row `n`. Every [`NodeRowId`] emitted
    /// anywhere in this dataset references a position this stream yields.
    #[must_use]
    fn nodes(&self) -> Self::NodeStream<'_>;

    /// Opens the edge stream.
    ///
    /// The `n`-th item occupies edge row `n`. Both endpoints of every edge
    /// are in scope: links whose endpoints fall outside the dataset's
    /// scope are filtered at the source and never appear.
    #[must_use]
    fn edges(&self) -> Self::EdgeStream<'_>;

    /// Opens the ontology stream.
    ///
    /// The `n`-th item occupies ontology row `n`. The stream is
    /// self-referential through [`Ontology::parents`] and resolves only
    /// once fully ingested.
    #[must_use]
    fn ontology(&self) -> Self::OntologyStream<'_>;

    /// Opens a stream of full canonical embeddings for the given nodes.
    ///
    /// Each requested node yields its complete
    /// [`CANONICAL_DIMENSIONS`]-component embedding as stored, with every
    /// component finite. Requests are probe-scoped: bounded anchor and
    /// comparison sets for evaluating the fitted map against exact
    /// canonical-space neighborhoods. The corpus-scale representation is
    /// [`Node::embedding`].
    #[must_use]
    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I>;

    /// Opens the card stream.
    ///
    /// The `n`-th item is the finished [`Card`] for ontology row `n`,
    /// paired with the type's source identifier. The card text is what
    /// an embedding model consumes to represent the type - title,
    /// description, and constraints, resolved through the type's full
    /// inheritance chain - and the card carries its budget diagnostics
    /// (token count, truncation passes) for artifact metadata. One pass
    /// renders every card, so implementations amortize fact gathering
    /// across the whole type table. Rendering is deterministic for a
    /// given dataset, so equal datasets produce equal bytes.
    ///
    /// Items carry `io::Error`: source failures surface through
    /// `io::Error::other`, and a type whose stored facts cannot render
    /// under the card contract surfaces as [`io::ErrorKind::InvalidData`].
    #[must_use]
    fn render_cards(&self) -> Self::CardStream<'_>;
}
