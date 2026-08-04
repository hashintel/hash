//! A [`Dataset`] over the live HASH graph store.
//!
//! [`PostgresDataset::new`] opens one read-only repeatable-read transaction under Postgres snapshot
//! isolation, and every stream the trait serves queries through it, so the nodes, the links, the
//! type table, and the cards all describe one committed state even though they are separate queries
//! issued at separate times. The [`TemporalAxes`] select which graph that state describes. The
//! queries admit only the editions whose transaction time and decision time contain the axes, so
//! axes in the past read the graph as it stood then, and the axes a fit records make its input
//! addressable after the fact.
//!
//! Node row ids are positions, minted by the [`SCOPE`] CTE: `row_number()` over canonical
//! `(web_id, entity_uuid)` order, zero-based. The ordering key is the entity's immutable identity,
//! not its content, and under the frozen snapshot every query sees the same visible set, so every
//! query that interpolates [`SCOPE`] re-derives the identical numbering. An endpoint row id names
//! the node the node stream delivered only because of that agreement: [`LINKS`] densifies endpoints
//! through `scope` in a different query execution than the node stream that delivers those rows,
//! and the two coincide because of the snapshot, not by luck.
//!
//! Delivery order rides the same contract - the node stream orders by `scope.row`, so the
//! consumer's arrival index is the row id; the link stream orders by link identity - already a
//! total order, since the store admits exactly one attachment pair per link entity, and the
//! endpoint-row keys ride behind it as inert tiebreakers. The request-shaped streams (canonical
//! embeddings, node types) carry no `ORDER BY` at all, because the returned identity keys each
//! item. Order is therefore deterministic exactly where identity is positional and unconstrained
//! where it is not.
//!
//! The corpus has one definition. Every corpus query interpolates [`SCOPE`] verbatim (non-draft,
//! non-archived, non-link, holding a whole-entity embedding, current at both axes), so the
//! universe cannot drift between the type bootstrap, the node stream, and the link stream. The
//! embedding join is the scope gate rather than an enrichment: an entity without a whole-entity
//! embedding has no position to fit. One row per identity is the embedding table's unique index
//! promise (`(web_id, entity_uuid, property)` `NULLS NOT DISTINCT`), so `row_number` cannot mint
//! twice. `entity_temporal_metadata.draft_id` alone decides the draft axis.
//!
//! [`LINKS`] composes after [`SCOPE`]: a link entity's outgoing `has-left-entity` and
//! `has-right-entity` edges self-join into the link's single `(source, target)` pair - the graph
//! admits no hypergraphs - and both
//! endpoints resolve through `scope` - densification and admission in one motion, so a link whose
//! endpoint falls outside the corpus drops with its endpoint, and the delivered `source_row` and
//! `target_row` are exactly the node stream's positions. The link entity itself passes the same
//! temporal and archival gates as any node.
//!
//! The type table is the ontology universe. It lists every type reachable from the corpus at any
//! inheritance depth in uuid byte order, and each position is the ontology row id. The table
//! round-trips into later queries as the `$3` array, where `unnest WITH ORDINALITY` re-derives the
//! same numbering store-side - both ends share one map by construction rather than by convention.
//! Per-edition type lists take `inheritance_depth = 0` (the direct types); ancestry re-enters once
//! through the ontology stream's depth-0 `inherits_from` rows, which stay inside the table because
//! the store materializes inheritance closures - a reachable type's parents are themselves
//! reachable.
//!
//! The store also does the geometry's data preparation: `subvector` truncates each embedding to
//! the projector's prefix and `l2_normalize` renormalizes it inside the query, so the connection
//! carries dense rows and unit-norm prefixes and nothing wider. The canonical-embedding stream is
//! the one full-width path - audit-time exactness over fit-time throughput.

use core::{error::Error, fmt};
use std::io;

use futures::{FutureExt as _, Stream, TryStreamExt as _, stream};
use smallvec::SmallVec;
use tokio::sync::OnceCell;
use tokio_postgres::{
    IsolationLevel, Row, Transaction,
    types::{FromSql, ToSql, Type},
};
use uuid::Uuid;

pub(crate) use self::card::CardParameters;
use self::id::{ArchivedEntityId, ArchivedOntologyTypeUuid};
use super::{
    CANONICAL_DIMENSIONS, Dataset, Edge, Node, NodeRowId, Ontology, OntologyRowId,
    PROJECTOR_DIMENSIONS, TemporalAxes,
    card::{
        Card, CardContext, Cl100kTokenizer, UnicodeSegmenter, build_card, hash::build_contents,
    },
};
use crate::math::BoxedVecN;

mod card;
pub(crate) mod id;

/// The node universe shared by every corpus query.
///
/// `$1` is the transaction-time point and `$2` the decision-time point of the dataset's
/// [`TemporalAxes`].
///
/// `scope` is every non-draft, non-archived, non-link entity holding a whole-entity embedding whose
/// edition is current at the dataset's temporal axes, with its dense row assigned by canonical
/// `(web_id, entity_uuid)` order. Link entities render as edges only. The point universe excludes
/// every edition typed by the link entity type unconditionally, resolving the type through the
/// store's materialized type closure and anchoring on the type's base URL rather than a
/// version-pinned ontology id. The exclusion keys on the edition's own type rather than on the
/// edges it has, so a link with a missing left attachment is still no point glyph.
//
// The queries do not consult the embeddings table's own `draft_id` column:
// the unique index `(web_id, entity_uuid, property)` NULLS NOT DISTINCT
// already guarantees one whole-entity row per identity, and
// `entity_temporal_metadata.draft_id IS NULL` decides the draft axis.
const SCOPE: &str = "
    scope AS (
        SELECT
            meta.web_id,
            meta.entity_uuid,
            meta.entity_edition_id,
            row_number() OVER (ORDER BY meta.web_id, meta.entity_uuid) - 1 AS row
        FROM entity_embeddings AS embedding
        JOIN entity_temporal_metadata AS meta
          ON meta.web_id = embedding.web_id
         AND meta.entity_uuid = embedding.entity_uuid
         AND meta.draft_id IS NULL
         AND meta.transaction_time @> $1::timestamptz
         AND meta.decision_time @> $2::timestamptz
        JOIN entity_editions AS edition
          ON edition.entity_edition_id = meta.entity_edition_id
         AND NOT edition.archived
        WHERE embedding.property IS NULL
          AND NOT EXISTS (
              SELECT FROM entity_is_of_type AS is_link
              JOIN ontology_ids AS link_type
                ON link_type.ontology_id = is_link.entity_type_ontology_id
               AND link_type.base_url = 'https://blockprotocol.org/@blockprotocol/types/entity-type/link/'
              WHERE is_link.entity_edition_id = meta.entity_edition_id
          )
    )";

/// The link universe, composed after [`SCOPE`].
///
/// `links` pairs each link entity's left and right attachments and densifies both endpoints through
/// `scope`, so links with out-of-scope endpoints drop out here.
const LINKS: &str = "
    links AS (
        SELECT
            left_edge.source_web_id AS web_id,
            left_edge.source_entity_uuid AS entity_uuid,
            meta.entity_edition_id,
            source.row AS source_row,
            target.row AS target_row,
            left_edge.confidence AS source_confidence,
            right_edge.confidence AS target_confidence
        FROM entity_edge AS left_edge
        JOIN entity_edge AS right_edge
          ON right_edge.source_web_id = left_edge.source_web_id
         AND right_edge.source_entity_uuid = left_edge.source_entity_uuid
         AND right_edge.kind = 'has-right-entity'
         AND right_edge.direction = 'outgoing'
        JOIN scope AS source
          ON source.web_id = left_edge.target_web_id
         AND source.entity_uuid = left_edge.target_entity_uuid
        JOIN scope AS target
          ON target.web_id = right_edge.target_web_id
         AND target.entity_uuid = right_edge.target_entity_uuid
        JOIN entity_temporal_metadata AS meta
          ON meta.web_id = left_edge.source_web_id
         AND meta.entity_uuid = left_edge.source_entity_uuid
         AND meta.draft_id IS NULL
         AND meta.transaction_time @> $1::timestamptz
         AND meta.decision_time @> $2::timestamptz
        JOIN entity_editions AS edition
          ON edition.entity_edition_id = meta.entity_edition_id
         AND NOT edition.archived
        WHERE left_edge.kind = 'has-left-entity'
          AND left_edge.direction = 'outgoing'
    )";

/// The `type_rows` CTE: per-edition ordinal arrays over the type table.
///
/// `$3` is the ordinal-ordered type table and `editions` names the CTE whose rows receive their
/// direct-type ordinals. The aggregation works over sets in one hash join, so its cost scales with
/// the edition count, not with rendered output rows.
fn type_rows_cte(editions: &str) -> String {
    format!(
        "
    type_rows AS (
        SELECT
            is_of_type.entity_edition_id,
            array_agg(mapping.ordinal ORDER BY mapping.ordinal) AS ordinals
        FROM entity_is_of_type AS is_of_type
        JOIN (
            SELECT ontology_id, ordinality - 1 AS ordinal
            FROM unnest($3::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
        ) AS mapping
          ON mapping.ontology_id = is_of_type.entity_type_ontology_id
        WHERE is_of_type.inheritance_depth = 0
          AND is_of_type.entity_edition_id IN (SELECT entity_edition_id FROM {editions})
        GROUP BY is_of_type.entity_edition_id
    )"
    )
}

/// A failure while reading from the graph store.
#[derive(Debug)]
pub enum PostgresDatasetError {
    /// The store rejected or aborted a query.
    Query(tokio_postgres::Error),
    /// A row referenced more type ordinals than the type table holds.
    Ordinal { value: i64 },
    /// Requested canonical embeddings that the store does not hold.
    MissingCanonicalEmbeddings { missing: usize },
}

impl fmt::Display for PostgresDatasetError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Query(_) => fmt.write_str("graph store query failed"),
            Self::Ordinal { value } => {
                write!(fmt, "type ordinal {value} is not a valid row")
            }
            Self::MissingCanonicalEmbeddings { missing } => write!(
                fmt,
                "{missing} requested canonical embeddings are absent from the store"
            ),
        }
    }
}

impl Error for PostgresDatasetError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::Ordinal { .. } | Self::MissingCanonicalEmbeddings { .. } => None,
        }
    }
}

impl From<tokio_postgres::Error> for PostgresDatasetError {
    #[inline]
    fn from(error: tokio_postgres::Error) -> Self {
        Self::Query(error)
    }
}

/// An `N`-component pgvector value decoded from the binary wire format.
struct PgVector<const N: usize>(BoxedVecN<N>);

impl<'value, const N: usize> FromSql<'value> for PgVector<N> {
    #[expect(
        clippy::big_endian_bytes,
        reason = "pgvector's binary protocol uses network byte order"
    )]
    fn from_sql(_ty: &Type, raw: &'value [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let &[
            dimension_high,
            dimension_low,
            unused_high,
            unused_low,
            ref components @ ..,
        ] = raw
        else {
            return Err(Box::new(VectorDecodeError::Header));
        };

        let dimensions = usize::from(u16::from_be_bytes([dimension_high, dimension_low]));
        if dimensions != N
            || u16::from_be_bytes([unused_high, unused_low]) != 0
            || components.len() != dimensions * size_of::<f32>()
        {
            return Err(Box::new(VectorDecodeError::Shape {
                expected: N,
                dimensions,
                bytes: components.len(),
            }));
        }

        // The components decode straight into the aligned buffer; the
        // shape check above pinned their count to exactly `N`.
        let mut decoded = BoxedVecN::<N>::zero();
        for (slot, &bytes) in decoded
            .as_array_mut()
            .iter_mut()
            .zip(components.as_chunks::<{ size_of::<f32>() }>().0)
        {
            *slot = f32::from_be_bytes(bytes);
        }

        Ok(Self(decoded))
    }

    fn accepts(ty: &Type) -> bool {
        ty.name() == "vector"
    }
}

#[derive(Debug, Copy, Clone)]
enum VectorDecodeError {
    Header,
    Shape {
        expected: usize,
        dimensions: usize,
        bytes: usize,
    },
}

impl fmt::Display for VectorDecodeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header => fmt.write_str("pgvector header is truncated"),
            Self::Shape {
                expected,
                dimensions,
                bytes,
            } => write!(
                fmt,
                "expected a {expected}-dimensional pgvector, got {dimensions} dimensions and \
                 {bytes} payload bytes"
            ),
        }
    }
}

impl Error for VectorDecodeError {}

/// Converts a column of SQL ordinals into ontology row references.
fn ontology_rows(ordinals: Vec<i64>) -> Result<SmallVec<OntologyRowId, 2>, PostgresDatasetError> {
    ordinals
        .into_iter()
        .map(|ordinal| {
            u64::try_from(ordinal)
                .map(OntologyRowId::new)
                .map_err(|_error| PostgresDatasetError::Ordinal { value: ordinal })
        })
        .collect()
}

fn decode_node(row: &Row) -> Result<Node<ArchivedEntityId>, PostgresDatasetError> {
    let web_id: Uuid = row.try_get(0)?;
    let entity_uuid: Uuid = row.try_get(1)?;
    let embedding: PgVector<PROJECTOR_DIMENSIONS> = row.try_get(2)?;
    let confidence: Option<f64> = row.try_get(3)?;
    let ordinals: Vec<i64> = row.try_get(4)?;

    Ok(Node {
        id: ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        ontology: ontology_rows(ordinals)?,
        embedding: embedding.0,
        confidence,
    })
}

fn decode_node_types(
    row: &Row,
) -> Result<(ArchivedEntityId, SmallVec<OntologyRowId, 2>), PostgresDatasetError> {
    let web_id: Uuid = row.try_get(0)?;
    let entity_uuid: Uuid = row.try_get(1)?;
    let ordinals: Vec<i64> = row.try_get(2)?;

    Ok((
        ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        ontology_rows(ordinals)?,
    ))
}

fn decode_edge(row: &Row) -> Result<Edge<ArchivedEntityId>, PostgresDatasetError> {
    let web_id: Uuid = row.try_get(0)?;
    let entity_uuid: Uuid = row.try_get(1)?;
    let source: i64 = row.try_get(2)?;
    let target: i64 = row.try_get(3)?;
    let ordinals: Vec<i64> = row.try_get(4)?;
    let embedding: Option<PgVector<PROJECTOR_DIMENSIONS>> = row.try_get(5)?;
    let confidence: Option<f64> = row.try_get(6)?;
    let source_confidence: Option<f64> = row.try_get(7)?;
    let target_confidence: Option<f64> = row.try_get(8)?;

    let row_id = |value: i64| {
        u64::try_from(value)
            .map(NodeRowId::new)
            .map_err(|_error| PostgresDatasetError::Ordinal { value })
    };

    Ok(Edge {
        id: ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        source: row_id(source)?,
        target: row_id(target)?,
        ontology: ontology_rows(ordinals)?,
        embedding: embedding.map(|vector| vector.0),
        confidence,
        source_confidence,
        target_confidence,
    })
}

/// Renders one type's gathered facts into its finished card.
fn render_card(
    id: Uuid,
    facts: &card::RelationFacts,
    parameters: CardParameters,
) -> io::Result<(ArchivedOntologyTypeUuid, Card)> {
    let context = CardContext {
        language: "en",
        segmenter: UnicodeSegmenter,
        tokenizer: Cl100kTokenizer,
    };

    let (type_facts, associations, examples) = facts.contents_inputs();
    let Ok(contents) = build_contents(
        type_facts,
        associations,
        examples,
        parameters.example_count,
        &context,
    );
    let Some(contents) = contents else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("the stored constraints on {id} violate the card contract"),
        ));
    };

    let card = build_card(
        contents,
        parameters.budgets,
        &context.tokenizer,
        &facts.forbidden_identifiers(),
    )
    .map_err(io::Error::other)?;

    Ok((id.into(), card))
}

/// A [`Dataset`] reading one frozen view of the HASH graph store.
///
/// The dataset's scope is every non-draft, non-archived, non-link entity that holds a whole-entity
/// embedding and is current at the dataset's [`TemporalAxes`], plus every link whose endpoints
/// both fall inside that scope; link entities render as edges only, never as points. Prefix
/// truncation, l2 normalization, and endpoint densification all happen inside the store's queries;
/// the connection transfers dense rows and normalized prefixes only.
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
    /// bitemporal inputs: record them in the generation metadata, and pass axes in the past to read
    /// the graph as it stood then. Card extraction starts from the default [`CardParameters`];
    /// assign [`cards`](Self::cards) to change them.
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
    /// Every type reachable from the corpus at any inheritance depth, in ordinal (uuid byte) order.
    ///
    /// The table bootstraps on first use by any stream and stays cached for the dataset's lifetime;
    /// the frozen transaction guarantees every later query observes the types the bootstrap saw.
    /// The store materializes closures, so all-depth rows are exactly the closure.
    async fn type_table(&self) -> Result<&[Uuid], PostgresDatasetError> {
        self.type_table
            .get_or_try_init(|| async {
                let sql = format!(
                    "WITH {SCOPE}, {LINKS}
                    SELECT DISTINCT is_of_type.entity_type_ontology_id
                    FROM (
                        SELECT entity_edition_id FROM scope
                        UNION ALL
                        SELECT entity_edition_id FROM links
                    ) AS editions
                    JOIN entity_is_of_type AS is_of_type
                      ON is_of_type.entity_edition_id = editions.entity_edition_id
                    ORDER BY is_of_type.entity_type_ontology_id"
                );

                let rows = self
                    .transaction
                    .query(
                        &sql,
                        &[&self.axes.transaction_time, &self.axes.decision_time],
                    )
                    .await?;

                rows.iter()
                    .map(|row| row.try_get(0))
                    .collect::<Result<Vec<Uuid>, _>>()
                    .map_err(PostgresDatasetError::from)
            })
            .await
            .map(Vec::as_slice)
    }

    /// Issues `sql` with the dataset's temporal axes as `$1`/`$2` and the type table as `$3`.
    ///
    /// Adapts the row stream through `decode`.
    fn stream_query<'this, T>(
        &'this self,
        sql: String,
        decode: fn(&Row) -> Result<T, PostgresDatasetError>,
    ) -> impl Stream<Item = Result<T, PostgresDatasetError>> + 'this
    where
        T: 'this,
    {
        // The `async move` matters here: `sql` must live long enough for the stream to exist, and
        // moving it in releases the borrow.
        async move {
            let types = self.type_table().await?;

            self.transaction
                .query_raw(
                    &sql,
                    [
                        &self.axes.transaction_time as &(dyn ToSql + Sync),
                        &self.axes.decision_time as &(dyn ToSql + Sync),
                        &types as &(dyn ToSql + Sync),
                    ],
                )
                .await
                .map(|rows| rows.map_err(PostgresDatasetError::from))
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
        .and_then(move |row| core::future::ready(decode(&row)))
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
    type EdgeStream<'this>
        = impl Stream<Item = Result<Edge<ArchivedEntityId>, PostgresDatasetError>> + 'this
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
    type OntologyStream<'this>
        =
        impl Stream<Item = Result<Ontology<ArchivedOntologyTypeUuid>, PostgresDatasetError>> + 'this
    where
        Self: 'this;

    fn axes(&self) -> Option<TemporalAxes> {
        Some(self.axes)
    }

    fn nodes(&self) -> Self::NodeStream<'_> {
        let type_rows = type_rows_cte("scope");
        let sql = format!(
            "WITH {SCOPE}, {type_rows}
            SELECT
                scope.web_id,
                scope.entity_uuid,
                l2_normalize(
                    subvector(embedding.embedding, 1, {PROJECTOR_DIMENSIONS})
                )::vector({PROJECTOR_DIMENSIONS}),
                edition.confidence,
                COALESCE(type_rows.ordinals, '{{}}')
            FROM scope
            JOIN entity_embeddings AS embedding
              ON embedding.web_id = scope.web_id
             AND embedding.entity_uuid = scope.entity_uuid
             AND embedding.property IS NULL
            JOIN entity_editions AS edition
              ON edition.entity_edition_id = scope.entity_edition_id
            LEFT JOIN type_rows
              ON type_rows.entity_edition_id = scope.entity_edition_id
            ORDER BY scope.row"
        );

        self.stream_query(sql, decode_node)
    }

    fn edges(&self) -> Self::EdgeStream<'_> {
        let type_rows = type_rows_cte("links");
        let sql = format!(
            "WITH {SCOPE}, {LINKS}, {type_rows}
            SELECT
                links.web_id,
                links.entity_uuid,
                links.source_row,
                links.target_row,
                COALESCE(type_rows.ordinals, '{{}}'),
                l2_normalize(
                    subvector(embedding.embedding, 1, {PROJECTOR_DIMENSIONS})
                )::vector({PROJECTOR_DIMENSIONS}),
                edition.confidence,
                links.source_confidence,
                links.target_confidence
            FROM links
            JOIN entity_editions AS edition
              ON edition.entity_edition_id = links.entity_edition_id
            LEFT JOIN entity_embeddings AS embedding
              ON embedding.web_id = links.web_id
             AND embedding.entity_uuid = links.entity_uuid
             AND embedding.property IS NULL
            LEFT JOIN type_rows
              ON type_rows.entity_edition_id = links.entity_edition_id
            ORDER BY links.web_id, links.entity_uuid, links.source_row, links.target_row"
        );

        self.stream_query(sql, decode_edge)
    }

    fn ontology(&self) -> Self::OntologyStream<'_> {
        async move {
            let types = self.type_table().await?;

            // Parents outside the type table cannot occur: the store
            // materializes closures per edition, so every depth-0 parent
            // of a reachable type is itself reachable.
            let rows = self
                .transaction
                .query(
                    "SELECT
                         inherits.source_entity_type_ontology_id,
                         inherits.target_entity_type_ontology_id
                     FROM entity_type_inherits_from AS inherits
                     WHERE inherits.depth = 0
                       AND inherits.source_entity_type_ontology_id = ANY($1::uuid[])
                     ORDER BY
                         inherits.source_entity_type_ontology_id,
                         inherits.target_entity_type_ontology_id",
                    &[&types],
                )
                .await
                .map_err(PostgresDatasetError::from)?;

            let mut parents = vec![SmallVec::<OntologyRowId, 2>::new(); types.len()];
            for row in &rows {
                let source: Uuid = row.try_get(0)?;
                let target: Uuid = row.try_get(1)?;

                let node = types
                    .binary_search(&source)
                    .expect("the parent query filters sources to the type table");
                if let Ok(parent) = types.binary_search(&target) {
                    let ordinal = u64::try_from(parent)
                        .expect("the type table is shorter than u64::MAX rows");
                    parents[node].push(OntologyRowId::new(ordinal));
                }
            }

            Ok::<_, PostgresDatasetError>(stream::iter(types.iter().zip(parents).map(
                |(id, parents)| {
                    Ok(Ontology {
                        id: (*id).into(),
                        parents,
                    })
                },
            )))
        }
        .into_stream()
        .try_flatten()
    }

    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        let (entity_uuids, web_ids): (Vec<_>, Vec<_>) = nodes
            .into_iter()
            .map(|id| {
                (
                    Uuid::from_bytes(id.entity_uuid.to_bytes()),
                    Uuid::from_bytes(id.web_id.to_bytes()),
                )
            })
            .collect();

        self.transaction
            .query_raw(
                "SELECT
                        embedding.web_id,
                        embedding.entity_uuid,
                        embedding.embedding
                    FROM unnest($1::uuid[], $2::uuid[])
                        AS request(web_id, entity_uuid)
                    JOIN entity_embeddings AS embedding
                    ON embedding.web_id = request.web_id
                    AND embedding.entity_uuid = request.entity_uuid
                    WHERE embedding.property IS NULL",
                [web_ids, entity_uuids],
            )
            .into_stream()
            .try_flatten()
            .and_then(|row| async move {
                let web_id: Uuid = row.try_get(0)?;
                let entity_uuid: Uuid = row.try_get(1)?;
                let embedding: PgVector<CANONICAL_DIMENSIONS> = row.try_get(2)?;
                let id = ArchivedEntityId {
                    web_id: web_id.into(),
                    entity_uuid: entity_uuid.into(),
                };

                Ok((id, embedding.0))
            })
            .map_err(PostgresDatasetError::Query)
    }

    fn node_types<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I> {
        let (entity_uuids, web_ids): (Vec<_>, Vec<_>) = nodes
            .into_iter()
            .map(|id| {
                (
                    Uuid::from_bytes(id.entity_uuid.to_bytes()),
                    Uuid::from_bytes(id.web_id.to_bytes()),
                )
            })
            .collect();

        // The requests CTE densifies nothing: it resolves each requested
        // identity to its current edition at the dataset's axes, exactly
        // the edition whose depth-0 type rows the node stream carries.
        let type_rows = type_rows_cte("requests");
        let sql = format!(
            "WITH requests AS (
                SELECT
                    meta.web_id,
                    meta.entity_uuid,
                    meta.entity_edition_id
                FROM unnest($4::uuid[], $5::uuid[]) AS request(web_id, entity_uuid)
                JOIN entity_temporal_metadata AS meta
                  ON meta.web_id = request.web_id
                 AND meta.entity_uuid = request.entity_uuid
                 AND meta.draft_id IS NULL
                 AND meta.transaction_time @> $1::timestamptz
                 AND meta.decision_time @> $2::timestamptz
                JOIN entity_editions AS edition
                  ON edition.entity_edition_id = meta.entity_edition_id
                 AND NOT edition.archived
            ),
            {type_rows}
            SELECT
                requests.web_id,
                requests.entity_uuid,
                COALESCE(type_rows.ordinals, '{{}}')
            FROM requests
            LEFT JOIN type_rows
              ON type_rows.entity_edition_id = requests.entity_edition_id"
        );

        async move {
            let types = self.type_table().await?;

            self.transaction
                .query_raw(
                    &sql,
                    [
                        &self.axes.transaction_time as &(dyn ToSql + Sync),
                        &self.axes.decision_time as &(dyn ToSql + Sync),
                        &types as &(dyn ToSql + Sync),
                        &web_ids as &(dyn ToSql + Sync),
                        &entity_uuids as &(dyn ToSql + Sync),
                    ],
                )
                .await
                .map(|rows| rows.map_err(PostgresDatasetError::from))
                .map_err(PostgresDatasetError::from)
        }
        .into_stream()
        .try_flatten()
        .and_then(|row| core::future::ready(decode_node_types(&row)))
    }

    /// Opens the stream of canonical relation cards, in ontology row order.
    ///
    /// Each card renders the store facts observed at the dataset's temporal axes. The facts are the
    /// type's prose and ancestor chain, the source types constraining it as a link, and pooled live
    /// link instances as examples. A type that nothing constrains and nothing instantiates as a
    /// link - every non-link entity type - renders prose and ancestry alone. All facts arrive
    /// in one pass over the store before the first card renders, so the per-card cost is
    /// rendering alone. [`cards`](Self::cards) controls example selection and the token
    /// budgets, and the rendered bytes are deterministic in the dataset and those parameters.
    ///
    /// Items carry [`io::ErrorKind::InvalidData`] when a type's stored constraints violate the card
    /// contract, and `io::Error::other` when a query fails, the tokenizer rejects a rendered text,
    /// or a final text leaks a source identifier.
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
                    .map(|(id, facts)| render_card(*id, &facts, self.cards)),
            ))
        }
        .into_stream()
        .try_flatten()
    }
}
