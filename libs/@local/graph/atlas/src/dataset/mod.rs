//! Data sources for fitting a semantic map.
//!
//! A [`Dataset`] supplies graph entities, embeddings and type descriptions to the fit. The
//! [`postgres`] and [`offline`] implementations let the same fitting algorithm read a live store
//! snapshot or a saved dump.
//!
//! # Rows and source identifiers
//!
//! The [`nodes`], [`edges`] and [`ontology`] streams each enumerate a separate table. The `n`-th
//! item occupies row `n` in that table. Row ids are dense, starting at zero: [`NodeRowId`],
//! [`EdgeRowId`](crate::identity::EdgeRowId) and [`OntologyRowId`] distinguish the tables. An edge
//! refers to its endpoints by node row, and an entity's type list refers to ontology rows.
//!
//! Source identifiers ([`Dataset::NodeId`], [`Dataset::EdgeId`] and [`Dataset::OntologyId`])
//! identify records in the original graph. The fit indexes data by row id, while identity files
//! preserve source identifiers for translation during serving. [`Key`] defines their persisted
//! representation and associated display payload.
//!
//! A graph entity occupies a node row or an edge row, never both. If both streams use the same
//! source-identifier space, their identifier sets must be disjoint.
//!
//! # Consistent snapshots
//!
//! All streams and lookups from one [`Dataset`] must describe the same snapshot. The [`postgres`]
//! implementation uses one repeatable-read transaction to keep that view stable for the dataset's
//! lifetime.
//!
//! Drain each stream before opening the next, since implementations may share a connection. The fit
//! reads nodes, then edges, then ontology.
//!
//! # Type inheritance
//!
//! [`Node`] and [`Edge`] list only the types assigned directly to each entity. The [`ontology`]
//! stream records each type's direct supertypes in [`Ontology::parents`]. Traversing these parent
//! relationships determines inherited types without repeating an ancestor list for every entity.
//!
//! # Type descriptions and display values
//!
//! [`render_cards`] supplies a [`Card`] for each ontology row: a text description for embedding
//! that includes inherited type information. Card rendering follows the same snapshot as the graph
//! streams.
//!
//! The [`node_auxiliary_payload`], [`edge_auxiliary_payload`] and [`ontology_auxiliary_payload`]
//! streams supply display values in the order of their corresponding graph streams. Each row has
//! one owned value of its identifier's [`Key::Payload`] type. A row without display information
//! uses that type's empty value instead of omitting the row.
//!
//! The [`postgres`] and [`offline`] datasets use [`Legend`] for node and edge display values,
//! pairing a representative type with a label. Ontology rows use [`Icon`]. Identity files preserve
//! these values from the dataset's snapshot alongside the source identifiers.
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
    integrity::Sha256Digest,
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

/// The dimension of a full canonical entity embedding.
pub(crate) const CANONICAL_DIMENSIONS: usize = 3072;

/// The dimension of the canonical embedding prefix used for fitting.
///
/// The source L2-normalizes this prefix before supplying it as [`Node::embedding`].
pub(crate) const PROJECTOR_DIMENSIONS: usize = 512;

/// The transaction and decision times selecting a graph snapshot.
///
/// A fit records these timestamps in generation metadata. Reusing them selects the same historical
/// graph when the stored history is unchanged.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct TemporalAxes {
    /// The transaction time selecting the store's recorded history.
    pub transaction_time: Timestamp<TransactionTime>,
    /// The decision time selecting the facts in effect.
    pub decision_time: Timestamp<DecisionTime>,
}

impl TemporalAxes {
    /// Captures the current time for both temporal axes.
    #[must_use]
    pub(crate) fn now() -> Self {
        Self {
            transaction_time: Timestamp::now(),
            decision_time: Timestamp::now(),
        }
    }
}

/// An entity type and its direct supertypes.
#[derive(Debug, Clone)]
pub(crate) struct Ontology<O> {
    /// The type's identifier in the data source.
    pub id: O,

    /// Direct supertype rows, sorted in ascending order without duplicates.
    ///
    /// Parents may occur later in [`Dataset::ontology`] than their children. Resolve parent
    /// references only after reading the complete type table.
    pub parents: SmallVec<OntologyRowId, 2>,
}

/// An entity with an embedding, represented as a point in the fitted map.
///
/// The node stream includes only entities with embeddings.
#[derive(Debug, Clone)]
pub(crate) struct Node<'data, N> {
    /// The entity's identifier in the data source.
    pub id: N,

    /// Direct types, sorted in ascending ontology-row order without duplicates.
    pub ontology: SmallVec<OntologyRowId, 2>,

    /// The normalized embedding used for fitting and projection.
    ///
    /// The source L2-normalizes the canonical embedding's leading [`PROJECTOR_DIMENSIONS`]
    /// components. Every component must be finite and the vector's norm must be 1 up to [`f32`]
    /// rounding. The fit checks a sample of vectors for this condition.
    pub embedding: Cow<'data, AlignedVecN<PROJECTOR_DIMENSIONS>>,

    /// Confidence in the entity, in `0.0..=1.0`.
    ///
    /// `None` records an unscored entity and contributes the neutral factor 1 to weighted
    /// calculations.
    pub confidence: Option<UnitFraction>,
}

/// A directed link between two [`Node`]s.
///
/// A link is itself an entity, with its own identifier and direct types. It may have an embedding
/// of its own, independently of its endpoints' embeddings.
#[derive(Debug, Clone)]
pub(crate) struct Edge<'data, E> {
    /// The link entity's identifier in the data source.
    pub id: E,

    /// The row of the source node.
    pub source: NodeRowId,

    /// The row of the target node.
    pub target: NodeRowId,

    /// Direct types of the link, sorted in ascending ontology-row order without duplicates.
    pub ontology: SmallVec<OntologyRowId, 2>,

    /// The link's optional normalized embedding.
    ///
    /// When present, it satisfies the same requirements as [`Node::embedding`].
    pub embedding: Option<Cow<'data, AlignedVecN<PROJECTOR_DIMENSIONS>>>,

    /// Confidence in the link, in `0.0..=1.0`.
    ///
    /// `None` records an unscored link and contributes the neutral factor 1 to weighted
    /// calculations. The same interpretation applies to
    /// [`source_confidence`](Self::source_confidence) and
    /// [`target_confidence`](Self::target_confidence).
    pub confidence: Option<UnitFraction>,

    /// Confidence in the link's attachment to [`source`](Self::source).
    ///
    /// The value lies in `0.0..=1.0`.
    pub source_confidence: Option<UnitFraction>,

    /// Confidence in the link's attachment to [`target`](Self::target).
    ///
    /// The value lies in `0.0..=1.0`.
    pub target_confidence: Option<UnitFraction>,
}

/// The data source recorded in a fitted generation's metadata.
///
/// The origin records where the run read its inputs, separately from the input identity used to
/// derive salts. A store snapshot and its saved dump can provide identical inputs while reporting
/// different origins.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub(crate) enum DatasetOrigin {
    /// The live store supplies graph rows, and the embedding provider computes card embeddings.
    Store,
    /// A saved dump supplies graph rows and embeddings.
    Dump {
        /// The digest of the dump manifest.
        ///
        /// The manifest records a length and digest for every stream file. Opening the dump
        /// verifies those files against the manifest.
        manifest: Sha256Digest,
    },
    /// An in-memory dataset, such as a synthetic fixture.
    Memory,
}

/// Graph data and embeddings for one fit.
///
/// See the [module documentation](self) for row ordering, identifiers and snapshot consistency.
pub(crate) trait Dataset {
    /// A node's identifier in the source graph.
    type NodeId: Key + Send + 'static;

    /// A link entity's identifier in the source graph.
    type EdgeId: Key;

    /// An entity type's identifier in the source graph.
    ///
    /// [`OntologyIdentity`] supplies the conversion from versioned type URLs.
    type OntologyId: Key + OntologyIdentity + Eq + core::hash::Hash;

    /// A failure to read or decode the source data.
    type Error: core::error::Error + Send + Sync + 'static;

    /// Nodes in their assigned row order.
    type NodeStream<'this>: Stream<Item = Result<Node<'this, Self::NodeId>, Self::Error>>
    where
        Self: 'this;

    /// Links in their assigned row order.
    type EdgeStream<'this>: Stream<Item = Result<Edge<'this, Self::EdgeId>, Self::Error>>
    where
        Self: 'this;

    /// Entity types in their assigned row order.
    type OntologyStream<'this>: Stream<Item = Result<Ontology<Self::OntologyId>, Self::Error>>
    where
        Self: 'this;

    /// Requested nodes paired with their full canonical embeddings.
    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>>: Stream<
        Item = Result<(Self::NodeId, Cow<'this, AlignedVecN<CANONICAL_DIMENSIONS>>), Self::Error>,
    >
    where
        Self: 'this;

    /// Requested nodes paired with their direct-type rows.
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>>: Stream<
        Item = Result<(Self::NodeId, SmallVec<OntologyRowId, 2>), Self::Error>,
    >
    where
        Self: 'this;

    /// Type descriptions for embedding, in ontology row order.
    type CardStream<'this>: Stream<Item = io::Result<(Self::OntologyId, Card)>>
    where
        Self: 'this;

    /// Owned display values in node row order.
    type NodeAuxiliaryPayloadStream<'this>: Stream<
        Item = Result<<<Self::NodeId as Key>::Payload as ToOwned>::Owned, Self::Error>,
    >
    where
        Self: 'this;

    /// Owned display values in edge row order.
    type EdgeAuxiliaryPayloadStream<'this>: Stream<
        Item = Result<<<Self::EdgeId as Key>::Payload as ToOwned>::Owned, Self::Error>,
    >
    where
        Self: 'this;

    /// Owned display values in ontology row order.
    type OntologyAuxiliaryPayloadStream<'this>: Stream<
        Item = Result<<<Self::OntologyId as Key>::Payload as ToOwned>::Owned, Self::Error>,
    >
    where
        Self: 'this;

    /// Returns the timestamps selecting this dataset's graph snapshot.
    ///
    /// Sources without temporal history return `None`. A fit records the returned [`TemporalAxes`]
    /// in generation metadata.
    #[must_use]
    fn axes(&self) -> Option<TemporalAxes>;

    /// Returns the data source to record in generation metadata.
    #[must_use]
    fn origin(&self) -> DatasetOrigin;

    /// Streams the entities to place on the map.
    ///
    /// The `n`-th item occupies node row `n`. Every [`NodeRowId`] in the dataset must identify a
    /// row returned by this stream.
    fn nodes(&self) -> Self::NodeStream<'_>;

    /// Streams the links between dataset nodes.
    ///
    /// The `n`-th item occupies edge row `n`. Both endpoints of every edge must belong to
    /// [`nodes`](Self::nodes). Links with an endpoint outside that stream never appear.
    fn edges(&self) -> Self::EdgeStream<'_>;

    /// Streams the entity types referenced by the dataset.
    ///
    /// The `n`-th item occupies ontology row `n`. Resolve [`Ontology::parents`] only after reading
    /// the entire stream, since a parent can occur after its child.
    fn ontology(&self) -> Self::OntologyStream<'_>;

    /// Fetches full canonical embeddings for selected nodes.
    ///
    /// Each result pairs a source identifier with its stored [`CANONICAL_DIMENSIONS`]-component
    /// embedding, with every component finite. Match results by identifier rather than request
    /// position.
    ///
    /// Use this for bounded samples when evaluating the fitted map against exact neighbourhoods in
    /// the canonical embedding space. [`Node::embedding`] provides the reduced representation for
    /// fitting the full dataset.
    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I>;

    /// Fetches direct types for selected nodes without their embeddings.
    ///
    /// Each result pairs a source identifier with the direct types from [`Node::ontology`], sorted
    /// in ascending ontology-row order without duplicates. Match results by identifier rather than
    /// request position.
    ///
    /// Use this for bounded samples when grouping quality measurements by type.
    fn node_types<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I>;

    /// Produces text descriptions for embedding each entity type.
    ///
    /// The `n`-th item pairs the type's source identifier with the [`Card`] for ontology row `n`.
    /// The text describes the type's title, description and constraints, including inherited
    /// information. Token counts and truncation diagnostics accompany the text for recording in
    /// generation metadata.
    ///
    /// Rendering every type in one pass lets implementations gather shared facts once for the whole
    /// type table. Rendering the same dataset with the same settings produces equal bytes.
    ///
    /// # Errors
    ///
    /// Stream items report source failures with [`io::ErrorKind::Other`]. Stored facts that violate
    /// the card's rendering requirements produce [`io::ErrorKind::InvalidData`].
    fn render_cards(&self) -> Self::CardStream<'_>;

    /// Streams the node display values.
    ///
    /// Yields exactly one owned payload per row from [`nodes`](Self::nodes), in matching order and
    /// from the same snapshot. A row without display information uses the payload type's empty
    /// value.
    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_>;

    /// Streams the edge display values.
    ///
    /// Yields exactly one owned payload per row from [`edges`](Self::edges), in matching order and
    /// from the same snapshot. A row without display information uses the payload type's empty
    /// value.
    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_>;

    /// Streams the entity-type display values.
    ///
    /// Yields exactly one owned payload per row from [`ontology`](Self::ontology), in matching
    /// order and from the same snapshot. A type without display information uses the payload type's
    /// empty value.
    fn ontology_auxiliary_payload(&self) -> Self::OntologyAuxiliaryPayloadStream<'_>;
}
