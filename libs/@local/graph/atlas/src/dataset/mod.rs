//! Fit inputs behind one trait.
//!
//! A [`Dataset`] is the pipeline's only window onto the graph it maps. It exposes row-ordered
//! streams - [`nodes`], [`edges`], [`ontology`], and [`render_cards`], plus the auxiliary
//! payload streams [`node_auxiliary_payload`], [`edge_auxiliary_payload`], and
//! [`ontology_auxiliary_payload`] - and a probe fetch for canonical
//! embeddings. Everything the fit learns about the graph arrives through these methods. Where the
//! data physically lives (a live Postgres store, a synthetic fixture) is an implementation concern
//! the pipeline cannot observe.
//!
//! # Rows and identity
//!
//! Every stream assigns dense ids by position: the `n`-th item of a stream occupies row `n`. There
//! is no row field to keep consistent - position is the assignment. Cross-references use the typed
//! row ids ([`NodeRowId`], [`EdgeRowId`](crate::identity::EdgeRowId), [`OntologyRowId`]), so an
//! edge names its endpoints by node row and a node names its types by ontology row.
//!
//! Source identifiers ([`Dataset::NodeId`], [`Dataset::EdgeId`], [`Dataset::OntologyId`]) stay
//! opaque to the pipeline. Byte-level stability (the zerocopy bounds) is exactly enough to persist
//! them into the identity artifacts that let serving translate rows back to graph identities. The
//! pipeline itself computes on rows alone.
//!
//! The node and edge streams cover disjoint entities. Each entity occupies a node row or an edge
//! row but never both. An implementation that draws both streams' source identifiers from one id
//! space therefore yields disjoint identifier sets, so an identifier resolves to at most one row
//! domain.
//!
//! # Auxiliary payloads
//!
//! Every row carries one auxiliary payload beside its id, typed per id type through
//! [`Key::Payload`] and persisted in the identity file's
//! payload region. The auxiliary streams deliver those values in owned form
//! ([`ToOwned::Owned`] of the payload) in row order, the empty value standing for a row that
//! carries none. What a payload means is the id type's contract. The datasets in this module
//! declare [`Legend`] for node and edge rows - the row's representative type beside its
//! display label - and [`Icon`] for ontology-type rows, each resolved by its source at the
//! same frozen view as every other stream, so the identity artifacts persist the display the
//! graph showed at fit time.
//!
//! # Snapshot semantics
//!
//! All streams of one dataset observe a single frozen view of the graph: two streams never disagree
//! about which entities exist or what they contain. Implementations that read from a live store
//! hold one repeatable-read transaction open for the dataset's lifetime.
//!
//! Streams from one dataset may share a connection and therefore serialize; consumers drain one
//! stream to completion before starting the next. The pipeline ingests nodes, then edges, then
//! ontology.
//!
//! # Types travel direct, closure follows from reachability
//!
//! Nodes and edges carry their **direct** types only. The ontology stream carries each type's
//! direct supertypes, so the full inheritance structure is available as a small graph and
//! reachability over that graph answers every closure question (admission checks, card rendering,
//! serving-side filter expansion) without materialized per-node closures. One structure is the
//! authority for inheritance. Per-node closure data that could disagree with it never exists.
//!
//! [`nodes`]: Dataset::nodes
//! [`edges`]: Dataset::edges
//! [`ontology`]: Dataset::ontology
//! [`render_cards`]: Dataset::render_cards
//! [`node_auxiliary_payload`]: Dataset::node_auxiliary_payload
//! [`edge_auxiliary_payload`]: Dataset::edge_auxiliary_payload
//! [`ontology_auxiliary_payload`]: Dataset::ontology_auxiliary_payload
//! [`Legend`]: auxiliary::Legend
//! [`Icon`]: auxiliary::Icon
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use alloc::borrow::Cow;
use std::io;

use futures::Stream;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use smallvec::SmallVec;

use self::card::Card;
pub(crate) use self::ontology::OntologyIdentity;
use crate::{
    file::identity::Key,
    identity::{NodeRowId, OntologyRowId},
    math::{AlignedVecN, UnitFraction},
};

pub(crate) mod auxiliary;
pub(crate) mod card;
#[cfg(test)]
pub(crate) mod memory;
pub(crate) mod offline;
pub(crate) mod ontology;
pub(crate) mod postgres;
#[cfg(test)]
mod tests;

/// Components in a canonical entity embedding as the store persists it.
pub(crate) const CANONICAL_DIMENSIONS: usize = 3072;

/// Components in the projector representation.
///
/// The l2-normalized leading slice of the canonical embedding.
pub(crate) const PROJECTOR_DIMENSIONS: usize = 512;

/// The bitemporal point one dataset observes.
///
/// The axes are inputs a fit declares: a generation records them, and a rerun with equal axes over
/// unchanged history reads equal data. Axes in the past read the graph as it stood then; the
/// store's temporal tables retain that history.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct TemporalAxes {
    /// The transaction-time point that selects the visible writes.
    pub transaction_time: Timestamp<TransactionTime>,
    /// The decision-time point that selects the decisions in effect.
    pub decision_time: Timestamp<DecisionTime>,
}

impl TemporalAxes {
    /// The current moment on both axes.
    #[must_use]
    pub(crate) fn now() -> Self {
        Self {
            transaction_time: Timestamp::now(),
            decision_time: Timestamp::now(),
        }
    }
}

/// One type in the generation's type table.
#[derive(Debug, Clone)]
pub(crate) struct Ontology<O> {
    /// The source identifier.
    ///
    /// Persisted so serving can translate ontology rows back to graph type ids.
    pub id: O,

    /// Direct supertypes, ascending by ontology row and deduplicated.
    ///
    /// Only depth-one edges appear. Walking the type graph reaches ancestors beyond the direct
    /// parents. A parent may occupy a later stream position than its child, so references resolve
    /// only once the ontology stream is fully ingested.
    pub parents: SmallVec<OntologyRowId, 2>,
}

/// One entity of the graph, which the fit places as a point on the map.
///
/// `N` is the dataset's node identifier. `'data` is the source borrow behind the embedding's
/// [`Cow`], so a node borrows or owns its vector as its source dictates.
#[derive(Debug, Clone)]
pub(crate) struct Node<'data, N> {
    /// The source identifier.
    ///
    /// Persisted so serving can translate node rows back to graph identities.
    pub id: N,

    /// Direct types, ascending by ontology row and deduplicated.
    pub ontology: SmallVec<OntologyRowId, 2>,

    /// The projector representation.
    ///
    /// The entity embedding's leading [`PROJECTOR_DIMENSIONS`] components, l2-normalized at the
    /// source.
    ///
    /// The norm is 1 up to `f32` rounding and every component is finite. The pipeline spot-checks
    /// this contract statistically. Every node carries an embedding: entities without one are
    /// outside every dataset's scope, and the row domain equals the placeable domain.
    pub embedding: Cow<'data, AlignedVecN<PROJECTOR_DIMENSIONS>>,

    /// The store's confidence in the entity, in `0.0..=1.0`.
    ///
    /// `None` means unscored. Consumers treat it as the neutral factor 1 while retaining the
    /// scored/unscored distinction.
    pub confidence: Option<UnitFraction>,
}

/// One link between two nodes.
///
/// Links are entities in the graph, so an edge has its own identity, its own types (which identify
/// the relation), and, when the store holds one, own embedding. `E` is the dataset's edge
/// identifier, and `'data` carries the embedding borrow, as for [`Node`].
#[derive(Debug, Clone)]
pub(crate) struct Edge<'data, E> {
    /// The source identifier.
    ///
    /// Persisted so serving can translate edge rows back to graph identities.
    pub id: E,

    /// The node the link points from.
    pub source: NodeRowId,

    /// The node the link points to.
    pub target: NodeRowId,

    /// Direct types of the link entity, ascending by ontology row and deduplicated.
    pub ontology: SmallVec<OntologyRowId, 2>,

    /// The link entity's own embedding prefix.
    ///
    /// Under the same contract as [`Node::embedding`], when the store holds one.
    pub embedding: Option<Cow<'data, AlignedVecN<PROJECTOR_DIMENSIONS>>>,

    /// The store's confidence in the link itself, in `0.0..=1.0`.
    ///
    /// `None` means unscored. Consumers treat it as the neutral factor 1 while retaining the
    /// scored/unscored distinction. The same reading applies to
    /// [`source_confidence`](Self::source_confidence) and
    /// [`target_confidence`](Self::target_confidence).
    pub confidence: Option<UnitFraction>,

    /// The store's confidence in the link's attachment to [`source`](Self::source).
    ///
    /// The value lies in `0.0..=1.0`.
    pub source_confidence: Option<UnitFraction>,

    /// The store's confidence in the link's attachment to [`target`](Self::target).
    ///
    /// The value lies in `0.0..=1.0`.
    pub target_confidence: Option<UnitFraction>,
}

/// The data one fit runs over, wherever it lives.
///
/// See the [module documentation](self) for the row, snapshot, and type contracts every
/// implementation upholds. Streams assign dense ids by position, all streams observe one frozen
/// view of the graph, and types travel as direct types plus a parent graph.
pub(crate) trait Dataset {
    /// The source identifier of a node.
    ///
    /// A [`Key`], so the identity file persists the id column as raw bytes under the id's
    /// declared key kind and reopens only under the id type that wrote it. Opaque to the
    /// pipeline otherwise. `Send + Sync + 'static` because id columns cross onto compute-pool
    /// workers that read them concurrently (the fit offloads its stage tail to rayon; the ranking
    /// tiebreak hashes id columns in parallel), which every plain-bytes id satisfies.
    type NodeId: Key + Send + 'static;

    /// The source identifier of an edge.
    ///
    /// A [`Key`], persisted as raw bytes under its declared key kind. Opaque to the pipeline
    /// otherwise.
    type EdgeId: Key;

    /// The source identifier of an ontology type.
    ///
    /// A [`Key`], persisted as raw bytes under its declared key kind. Opaque to the pipeline
    /// otherwise, except for the declared [`OntologyIdentity`] capability verdict resolution
    /// consumes.
    type OntologyId: Key + OntologyIdentity + Eq + core::hash::Hash;

    /// The failure produced when the underlying source cannot deliver.
    type Error: core::error::Error + Send + Sync + 'static;

    /// The stream of nodes, in row order.
    type NodeStream<'this>: Stream<Item = Result<Node<'this, Self::NodeId>, Self::Error>>
    where
        Self: 'this;

    /// The stream of edges, in row order.
    type EdgeStream<'this>: Stream<Item = Result<Edge<'this, Self::EdgeId>, Self::Error>>
    where
        Self: 'this;

    /// The stream of ontology types, in row order.
    type OntologyStream<'this>: Stream<Item = Result<Ontology<Self::OntologyId>, Self::Error>>
    where
        Self: 'this;

    /// The stream of requested canonical embeddings.
    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>>: Stream<
        Item = Result<(Self::NodeId, Cow<'this, AlignedVecN<CANONICAL_DIMENSIONS>>), Self::Error>,
    >
    where
        Self: 'this;

    /// The stream of requested direct-type lists.
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>>: Stream<
        Item = Result<(Self::NodeId, SmallVec<OntologyRowId, 2>), Self::Error>,
    >
    where
        Self: 'this;

    /// The stream of finished cards, in ontology row order.
    type CardStream<'this>: Stream<Item = io::Result<(Self::OntologyId, Card)>>
    where
        Self: 'this;

    /// The stream of node auxiliary payloads, in row order.
    type NodeAuxiliaryPayloadStream<'this>: Stream<
        Item = Result<<<Self::NodeId as Key>::Payload as ToOwned>::Owned, Self::Error>,
    >
    where
        Self: 'this;

    /// The stream of edge auxiliary payloads, in row order.
    type EdgeAuxiliaryPayloadStream<'this>: Stream<
        Item = Result<<<Self::EdgeId as Key>::Payload as ToOwned>::Owned, Self::Error>,
    >
    where
        Self: 'this;

    /// The stream of ontology-type auxiliary payloads, in row order.
    type OntologyAuxiliaryPayloadStream<'this>: Stream<
        Item = Result<<<Self::OntologyId as Key>::Payload as ToOwned>::Owned, Self::Error>,
    >
    where
        Self: 'this;

    /// Returns the bitemporal point this dataset observes, when its source has temporal axes.
    ///
    /// A generation's metadata records the value as part of its input snapshot. Sources without
    /// temporal history, such as synthetic fixtures, return [`None`].
    #[must_use]
    fn axes(&self) -> Option<TemporalAxes>;

    /// Opens the node stream.
    ///
    /// The `n`-th item occupies node row `n`. Every [`NodeRowId`] emitted anywhere in this dataset
    /// references a position this stream yields.
    #[must_use]
    fn nodes(&self) -> Self::NodeStream<'_>;

    /// Opens the edge stream.
    ///
    /// The `n`-th item occupies edge row `n`. Both endpoints of every edge are in scope: the source
    /// filters out links whose endpoints fall outside the dataset's scope, so those links never
    /// appear.
    #[must_use]
    fn edges(&self) -> Self::EdgeStream<'_>;

    /// Opens the ontology stream.
    ///
    /// The `n`-th item occupies ontology row `n`. The stream is self-referential through
    /// [`Ontology::parents`] and resolves only once fully ingested.
    #[must_use]
    fn ontology(&self) -> Self::OntologyStream<'_>;

    /// Opens a stream of full canonical embeddings for the given nodes.
    ///
    /// Each requested node yields its complete [`CANONICAL_DIMENSIONS`]-component embedding as
    /// stored, with every component finite. Requests are probe-scoped: bounded anchor and
    /// comparison sets for evaluating the fitted map against exact canonical-space neighbourhoods.
    /// The corpus-scale representation is [`Node::embedding`].
    #[must_use]
    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I>;

    /// Opens a stream of direct-type lists for the given nodes.
    ///
    /// Each requested node yields its direct types, ascending by ontology row and deduplicated: the
    /// same lists the node stream carries, without the embeddings that make a corpus pass heavy.
    /// Requests are probe-scoped: bounded anchor sets for grouping quality readings by subgroup.
    /// The corpus-scale source is [`Node::ontology`].
    #[must_use]
    fn node_types<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I>;

    /// Opens the card stream.
    ///
    /// The `n`-th item is the finished [`Card`] for ontology row `n`, paired with the type's source
    /// identifier. The card text is what an embedding model consumes to represent the type - title,
    /// description, and constraints, resolved through the type's full inheritance chain - and the
    /// card carries its budget diagnostics (token count, truncation passes) for artifact metadata.
    /// One pass renders every card, so implementations amortize fact gathering across the whole
    /// type table. Rendering is deterministic for a given dataset, so equal datasets produce equal
    /// bytes.
    ///
    /// Items carry `io::Error`: source failures surface through `io::Error::other`, and a type
    /// whose stored facts cannot render under the card contract surfaces as
    /// [`io::ErrorKind::InvalidData`].
    #[must_use]
    fn render_cards(&self) -> Self::CardStream<'_>;

    /// Opens the node auxiliary-payload stream.
    ///
    /// The `n`-th item is node row `n`'s payload in owned form, the empty value standing for a
    /// row that carries none. The stream covers exactly the rows [`nodes`](Self::nodes) yields,
    /// in the same order, observing the same frozen view.
    #[must_use]
    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_>;

    /// Opens the edge auxiliary-payload stream.
    ///
    /// The `n`-th item is edge row `n`'s payload in owned form, the empty value standing for a
    /// row that carries none. The stream covers exactly the rows [`edges`](Self::edges) yields,
    /// in the same order, observing the same frozen view.
    #[must_use]
    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_>;

    /// Opens the ontology-type auxiliary-payload stream.
    ///
    /// The `n`-th item is ontology row `n`'s payload in owned form, the empty value standing
    /// for a type that carries none. The stream covers exactly the rows
    /// [`ontology`](Self::ontology) yields, in the same order, observing the same frozen view.
    #[must_use]
    fn ontology_auxiliary_payload(&self) -> Self::OntologyAuxiliaryPayloadStream<'_>;
}
