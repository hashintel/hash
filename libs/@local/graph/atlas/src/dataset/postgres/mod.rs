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
//! # Row identity
//!
//! Node row ids are positions, assigned by the [`corpus::scope`] fragment: `row_number()` over
//! canonical `(web_id, entity_uuid)` order, zero-based. The ordering key is the entity's
//! immutable identity rather than its content, and under the frozen snapshot every query sees
//! the same visible set, so every statement that attaches the fragment re-derives the
//! identical numbering. An endpoint row id names the node the node stream delivered only because
//! of that agreement: [`corpus::links`] densifies endpoints through `scope` in a different query
//! execution than the node stream that delivers those rows, and the two coincide because of the
//! snapshot rather than by luck.
//!
//! Delivery order rides the same contract. The node stream orders by the scope row, and the link
//! stream orders by link identity - already a total order, since the store admits exactly one
//! attachment pair per link entity. The request-shaped streams (canonical embeddings, node
//! types) carry no `ORDER BY` at all, because the returned identity keys each item. Order is
//! therefore deterministic exactly where identity is positional and unconstrained where it is
//! not.
//!
//! # The statement discipline
//!
//! Every statement is a value of the store's statement AST
//! ([`SelectStatement`](hash_graph_postgres_store::store::postgres::query::SelectStatement)),
//! composed from shared fragments and rendered to SQL once when it leaves the builder. The
//! cross-boundary agreements travel as structure:
//!
//! - The shared fragments - [`corpus::scope`], [`corpus::links`], the type-ordinal mapping - are
//!   themselves statement values, so a statement composes them by attaching them to its WITH clause
//!   instead of splicing rendered text, and a fragment's shape is one declaration however many
//!   statements share it.
//! - Schema tables and columns come from the store's own vocabulary
//!   ([`Table`](hash_graph_postgres_store::store::postgres::query::Table) and its column enums), so
//!   a rename upstream fails compilation here instead of failing at query time.
//! - The corpus's own virtual tables carry the same discipline through [`vocabulary`]: the fragment
//!   that creates a table aliases its outputs through the enum its consumers cite.
//! - Parameters exist only as parameter expressions returned by a bind
//!   ([`Binder`](hash_graph_postgres_store::store::postgres::query::Binder)), so a statement cannot
//!   cite a parameter its bind list does not carry and the indices cannot drift from the values.
//! - Output columns exist only as indices returned by the select list
//!   ([`SelectList`](hash_graph_postgres_store::store::postgres::query::SelectList)), which also
//!   builds the select clause, so the decoder reads exactly the positions the statement selected.
//! - The link-attachment discriminants bind as the store's own enums, type-checked on the wire,
//!   rather than as quoted literals.
//! - Names whose agreement never leaves one statement - a join alias such as `meta`, a CTE chain's
//!   stage-local columns - are named constants beside the statement that introduces them
//!   ([`Aliased`](hash_graph_postgres_store::store::postgres::query::Aliased)), so every mention
//!   moves in one edit.
//!
//! The store's `SelectCompiler` stays out of this module: the compiler translates a
//! caller-supplied filter into a statement at runtime, as in the serving side's visibility
//! proofs. Everything here is a fixed statement composed from shared fragments, and the AST
//! expresses such a statement directly.
//!
//! # The corpus
//!
//! The corpus has one definition. Every corpus statement attaches [`corpus::scope`] verbatim
//! (non-draft, non-archived, non-link, holding a whole-entity embedding, current at both axes),
//! so the universe cannot drift between the type bootstrap, the node stream, and the link
//! stream. The type table is the ontology universe: every type reachable from the corpus at any
//! inheritance depth in uuid byte order, each position an ontology row id. The table round-trips
//! into later statements as a bound array, where `unnest WITH ORDINALITY` re-derives the same
//! numbering store-side, so both ends share one map by construction.
//!
//! The store also does the geometry's data preparation: `subvector` truncates each embedding to
//! the projector's prefix and `l2_normalize` renormalizes it inside the statement, so the
//! connection carries dense rows and unit-norm prefixes and nothing wider. The
//! canonical-embedding stream is the one full-width path - audit-time exactness over fit-time
//! throughput.

mod card;
mod corpus;
mod error;
pub(crate) mod id;
mod lookup;
mod sql;
mod streams;
mod vector;
mod vocabulary;

use std::io;

use futures::{FutureExt as _, Stream, TryStreamExt as _, stream};
use hash_graph_postgres_store::store::postgres::query::BoundStatement;
use smallvec::SmallVec;
use tokio::sync::OnceCell;
use tokio_postgres::{IsolationLevel, Transaction};
use uuid::Uuid;

use self::id::{ArchivedEntityId, ArchivedOntologyTypeUuid};
pub(crate) use self::{card::CardParameters, error::PostgresDatasetError};
use super::{
    CANONICAL_DIMENSIONS, Dataset, Edge, Node, Ontology, OntologyRowId, TemporalAxes,
    auxiliary::{OwnedIcon, OwnedLabel},
    card::Card,
};
use crate::math::BoxedVecN;

/// The type every link entity type descends from.
const LINK_ROOT_BASE_URL: &str = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/";

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
        = impl Stream<Item = Result<OwnedLabel, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type EdgeStream<'this>
        = impl Stream<Item = Result<Edge<ArchivedEntityId>, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type NodeAuxiliaryPayloadStream<'this>
        = impl Stream<Item = Result<OwnedLabel, PostgresDatasetError>> + 'this
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
            lookup::ontology(&self.transaction, types).await
        }
        .into_stream()
        .try_flatten()
    }

    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        let (web_ids, entity_uuids) = lookup::request_arrays(nodes);

        async move {
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = lookup::canonical_embedding_statement(&web_ids, &entity_uuids);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(lookup::decode_canonical_embedding(&row, &columns))
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
        let (web_ids, entity_uuids) = lookup::request_arrays(nodes);

        async move {
            let types = self.type_table().await?;
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = lookup::node_type_statement(&self.axes, &types, &web_ids, &entity_uuids);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(lookup::decode_node_types(&row, &columns))
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

    /// Opens the stream of node display labels, in row order.
    ///
    /// Each label reads the store's derived display label for the node's edition, and a row
    /// without one delivers the empty label. The statement attaches the corpus scope and
    /// orders by the scope row, so positions agree with [`nodes`](Dataset::nodes) under the
    /// frozen snapshot.
    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_> {
        async move {
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = lookup::node_label_statement(&self.axes);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(lookup::decode_label(&row, &columns))
                    })
                })
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
    }

    /// Opens the stream of edge display labels, in row order.
    ///
    /// Each label reads the store's derived display label for the link entity's edition, and a
    /// link without one delivers the empty label. The statement attaches the corpus scope
    /// and links and orders by link identity, the same total order as [`edges`](Dataset::edges),
    /// so positions agree under the frozen snapshot.
    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_> {
        async move {
            let BoundStatement {
                sql,
                parameters,
                columns,
            } = lookup::edge_label_statement(&self.axes);

            self.transaction
                .query_raw(&sql, parameters)
                .await
                .map(move |rows| {
                    rows.map_err(From::from).and_then(move |row| {
                        core::future::ready(lookup::decode_label(&row, &columns))
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
            lookup::ontology_icons(&self.transaction, types).await
        }
        .into_stream()
        .try_flatten()
    }
}

#[cfg(test)]
mod prepare_probe {
    use tokio_postgres::NoTls;
    use uuid::Uuid;

    use super::{corpus, lookup, streams};
    use crate::dataset::TemporalAxes;

    #[tokio::test]
    async fn statements_prepare_against_the_live_store() {
        let (client, connection) = tokio_postgres::connect(
            "host=localhost user=postgres password=postgres dbname=graph",
            NoTls,
        )
        .await
        .expect("the graph store is reachable");
        tokio::spawn(connection);

        let axes = TemporalAxes::now();
        let types: Vec<Uuid> = Vec::new();
        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();

        for (name, sql) in [
            ("type table", corpus::type_table_statement(&axes).sql),
            ("node stream", streams::node_statement(&axes, &types).sql),
            ("edge stream", streams::edge_statement(&axes, &types).sql),
            (
                "canonical embedding",
                lookup::canonical_embedding_statement(&web_ids, &entity_uuids).sql,
            ),
            (
                "node type",
                lookup::node_type_statement(&axes, &types, &web_ids, &entity_uuids).sql,
            ),
            ("node label", lookup::node_label_statement(&axes).sql),
            ("edge label", lookup::edge_label_statement(&axes).sql),
        ] {
            if let Err(error) = client.prepare(&sql).await {
                panic!("{name}: {error}");
            }
        }
    }
}
