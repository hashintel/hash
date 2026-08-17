//! A [`Dataset`] over the live HASH graph store, with every cross-statement agreement typed.
//!
//! [`PostgresDataset::new`] opens one read-only repeatable-read transaction under Postgres
//! snapshot isolation, and every stream the trait serves queries through it, so the nodes, the
//! links, the type table, and the cards all describe one committed state even though they are
//! separate queries issued at separate times. The [`TemporalAxes`] select which graph that state
//! describes. The queries admit only the editions whose transaction time and decision time
//! contain the axes, so axes in the past read the graph as it stood then, and the axes a fit
//! records make its input addressable after the fact.
//!
//! The statements themselves live in [`crate::postgres`] and run here under its frozen-snapshot
//! regime: the transaction is what turns the fragment-level numbering agreement documented at
//! [`corpus::scope`] into stream-level row identity.
//!
//! # Row identity
//!
//! Node row ids are positions: [`corpus::scope`] numbers the corpus, and under the frozen
//! snapshot every statement that attaches the fragment re-derives the identical numbering, so
//! an endpoint row id densified by [`corpus::links`] in one query execution names the node the
//! node stream delivered in another.
//!
//! Delivery order rides the same contract. The node stream orders by the scope row, and the link
//! stream orders by link identity - already a total order, since the store admits exactly one
//! attachment pair per link entity. The request-shaped streams (canonical embeddings, node
//! types) carry no `ORDER BY` at all, because the returned identity keys each item. Order is
//! therefore deterministic exactly where identity is positional and unconstrained where it is
//! not.

mod error;
mod streams;

use std::io;

use futures::{FutureExt as _, Stream, TryStreamExt as _, stream};
use hash_graph_postgres_store::store::postgres::query::BoundStatement;
use smallvec::SmallVec;
use tokio::sync::OnceCell;
use tokio_postgres::{IsolationLevel, Transaction};
use uuid::Uuid;

pub(crate) use self::error::PostgresDatasetError;
use super::{
    CANONICAL_DIMENSIONS, Dataset, Edge, Node, Ontology, OntologyRowId, TemporalAxes,
    auxiliary::{OwnedIcon, OwnedLegend},
    card::Card,
};
use crate::{
    math::BoxedVecN,
    postgres::{
        CardParameters, card, corpus, embeddings,
        id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
        legends, node_types, ontology, requests,
    },
};

/// A [`Dataset`] reading one frozen view of the HASH graph store.
///
/// The dataset's scope is every non-draft, non-archived, non-link entity that holds a
/// whole-entity embedding and is current at the dataset's [`TemporalAxes`], plus every link
/// whose endpoints both fall inside that scope; link entities render as edges only, never as
/// points. Prefix truncation, l2 normalization, and endpoint densification all happen inside the
/// store's queries. The connection transfers dense rows and normalized prefixes only.
pub(crate) struct PostgresDataset<'client> {
    transaction: Transaction<'client>,
    axes: TemporalAxes,
    type_table: OnceCell<Vec<Uuid>>,
    /// Content-affecting card extraction controls.
    ///
    /// Consumed by [`render_cards`](Dataset::render_cards).
    pub cards: CardParameters,
}

impl<'client> PostgresDataset<'client> {
    /// Freezes one view of the store at `axes` and serves a dataset from it.
    ///
    /// The view stays frozen until the caller drops the dataset. The axes are the fit's declared
    /// bitemporal inputs: record them in the generation metadata, and pass axes in the past to
    /// read the graph as it stood then. Card extraction starts from the default
    /// [`CardParameters`]. Assign [`cards`](Self::cards) to change them.
    ///
    /// # Errors
    ///
    /// Returns an error when the store cannot open the transaction.
    pub(crate) async fn new(
        client: &'client mut tokio_postgres::Client,
        axes: TemporalAxes,
    ) -> Result<Self, PostgresDatasetError> {
        // Repeatable read is Postgres snapshot isolation: every query in
        // the transaction sees the same committed state, which is the
        // whole snapshot contract of the trait.
        let transaction = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .read_only(true)
            .start()
            .await?;

        Ok(Self {
            transaction,
            axes,
            type_table: OnceCell::new(),
            cards: CardParameters::default(),
        })
    }

    /// Returns the type table.
    ///
    /// Every type reachable from the corpus at any inheritance depth, in ordinal (uuid byte)
    /// order.
    ///
    /// The table bootstraps on first use by any stream and stays cached for the dataset's
    /// lifetime; the frozen transaction guarantees every later query observes the types the
    /// bootstrap saw. The store materializes closures, so all-depth rows are exactly the
    /// closure.
    async fn type_table(&self) -> Result<&[Uuid], PostgresDatasetError> {
        self.type_table
            .get_or_try_init(async || {
                let statement = corpus::type_table_statement(&self.axes);
                let rows = self
                    .transaction
                    .query(&statement.sql, &statement.parameters)
                    .await?;

                rows.iter()
                    .map(|row| row.try_get(statement.columns.ontology_id))
                    .try_collect()
                    .map_err(From::from)
            })
            .await
            .map(Vec::as_slice)
    }
}

impl Dataset for PostgresDataset<'_> {
    type EdgeId = ArchivedEntityId;
    type Error = PostgresDatasetError;
    type NodeId = ArchivedEntityId;
    type OntologyId = ArchivedOntologyTypeUuid;

    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>>
        = impl Stream<
            Item = Result<
                (ArchivedEntityId, BoxedVecN<CANONICAL_DIMENSIONS>),
                PostgresDatasetError,
            >,
        > + use<'this, I>
    where
        Self: 'this;
    type CardStream<'this>
        = impl Stream<Item = io::Result<(ArchivedOntologyTypeUuid, Card)>> + 'this
    where
        Self: 'this;
    type EdgeAuxiliaryPayloadStream<'this>
        = impl Stream<Item = Result<OwnedLegend, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type EdgeStream<'this>
        = impl Stream<Item = Result<Edge<ArchivedEntityId>, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type NodeAuxiliaryPayloadStream<'this>
        = impl Stream<Item = Result<OwnedLegend, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type NodeStream<'this>
        = impl Stream<Item = Result<Node<ArchivedEntityId>, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>>
        = impl Stream<Item = Result<(ArchivedEntityId, SmallVec<OntologyRowId, 2>), PostgresDatasetError>>
        + use<'this, I>
    where
        Self: 'this;
    type OntologyAuxiliaryPayloadStream<'this>
        = impl Stream<Item = Result<OwnedIcon, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type OntologyStream<'this>
        =
        impl Stream<Item = Result<Ontology<ArchivedOntologyTypeUuid>, PostgresDatasetError>> + 'this
    where
        Self: 'this;

    fn axes(&self) -> Option<TemporalAxes> {
        Some(self.axes)
    }

    fn nodes(&self) -> Self::NodeStream<'_> {
        async move {
            let types = self.type_table().await?;
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = streams::node_statement(&self.axes, &types);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(streams::decode_node(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    fn edges(&self) -> Self::EdgeStream<'_> {
        async move {
            let types = self.type_table().await?;
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = streams::edge_statement(&self.axes, &types);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(streams::decode_edge(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    fn ontology(&self) -> Self::OntologyStream<'_> {
        async move {
            let types = self.type_table().await?;
            ontology::ontology(&self.transaction, types).await
        }
        .into_stream()
        .try_flatten()
    }

    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        let (web_ids, entity_uuids) = requests::request_arrays(nodes);

        async move {
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = embeddings::canonical_embedding_statement(&web_ids, &entity_uuids);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(embeddings::decode_canonical_embedding(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    fn node_types<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I> {
        let (web_ids, entity_uuids) = requests::request_arrays(nodes);

        async move {
            let types = self.type_table().await?;
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = node_types::node_type_statement(&self.axes, &types, &web_ids, &entity_uuids);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(node_types::decode_node_types(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    /// Opens the stream of canonical relation cards, in ontology row order.
    ///
    /// Each card renders the store facts observed at the dataset's temporal axes. The facts are
    /// the type's prose and ancestor chain, the source types constraining it as a link, and
    /// pooled live link instances as examples. A type that nothing constrains and nothing
    /// instantiates as a link - every non-link entity type - renders prose and ancestry alone.
    /// All facts arrive in one pass over the store before the first card renders, so the
    /// per-card cost is rendering alone. [`cards`](Self::cards) controls example selection and
    /// the token budgets, and the rendered bytes are deterministic in the dataset and those
    /// parameters.
    ///
    /// Items carry [`io::ErrorKind::InvalidData`] when a type's stored constraints violate the
    /// card contract, and `io::Error::other` when a query fails, the tokenizer rejects a
    /// rendered text, or a final text leaks a source identifier.
    fn render_cards(&self) -> Self::CardStream<'_> {
        async move {
            let types = self.type_table().await.map_err(io::Error::other)?;
            let facts = card::corpus_facts(&self.transaction, self.axes, self.cards, types)
                .await
                .map_err(io::Error::other)?;

            Ok::<_, io::Error>(stream::iter(
                types
                    .iter()
                    .zip(facts)
                    .map(|(id, facts)| card::render_card(*id, &facts, self.cards)),
            ))
        }
        .into_stream()
        .try_flatten()
    }

    /// Opens the stream of node display legends, in row order.
    ///
    /// Each legend pairs the entity's representative type - its edition cache's canonically
    /// representative type, resolved to its type-table row - with the store's derived display
    /// label, and a row without a cached label delivers the empty label. The statement
    /// attaches the corpus scope and orders by the scope row, so positions agree with
    /// [`nodes`](Dataset::nodes) under the frozen snapshot.
    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_> {
        async move {
            let types = self.type_table().await?;
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = legends::node_legend_statement(&self.axes, &types);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(legends::decode_legend(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    /// Opens the stream of edge display legends, in row order.
    ///
    /// Each legend pairs the link entity's representative type - read from its edition cache
    /// and resolved to its type-table row - with the store's derived display label, and a link
    /// without a cached label delivers the empty label. The statement attaches the corpus scope
    /// and links and orders by link identity, the same total order as [`edges`](Dataset::edges), so
    /// positions agree under the frozen snapshot.
    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_> {
        async move {
            let types = self.type_table().await?;
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = legends::edge_legend_statement(&self.axes, &types);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(legends::decode_legend(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    /// Opens the stream of ontology-type display icons, in row order.
    ///
    /// A type's icon is the first icon among its closed schema's `allOf` entries ordered by
    /// inheritance depth, with the array position breaking depth ties, so a type without an own
    /// icon inherits its nearest ancestor's and the selection is deterministic. A type whose
    /// chain carries no icon delivers the empty icon. The rows follow the type table's ordinal
    /// order, so positions agree with [`ontology`](Dataset::ontology).
    fn ontology_auxiliary_payload(&self) -> Self::OntologyAuxiliaryPayloadStream<'_> {
        async move {
            let types = self.type_table().await?;
            ontology::ontology_icons(&self.transaction, types).await
        }
        .into_stream()
        .try_flatten()
    }
}
