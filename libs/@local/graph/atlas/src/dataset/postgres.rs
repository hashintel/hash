//! A [`Dataset`] over the live HASH graph store.

use core::{error::Error, fmt, pin::Pin};
use std::io;

use futures::{FutureExt as _, Stream, TryStreamExt as _};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use smallvec::SmallVec;
use tokio::io::AsyncWrite;
use tokio_postgres::{
    IsolationLevel, Row, Transaction,
    types::{FromSql, ToSql, Type},
};
use uuid::Uuid;

use super::{
    ArchivedEntityId, ArchivedOntologyTypeUuid, CANONICAL_DIMENSIONS, Dataset, Edge, Node,
    NodeRowId, Ontology, OntologyRowId, PROJECTOR_DIMENSIONS, memory::write_all,
};
use crate::math::BoxedVecN;

/// The bitemporal point one dataset observes.
///
/// The axes are declared inputs of a fit: a generation records them, and
/// a rerun with equal axes over unchanged history reads equal data. Axes
/// in the past read the graph as it stood then; the store's temporal
/// tables retain that history.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TemporalAxes {
    /// The transaction-time point: which writes are visible.
    pub transaction_time: Timestamp<TransactionTime>,
    /// The decision-time point: which decisions are in effect.
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

/// The scope and type-table derivation shared by every query.
///
/// `$1` is the transaction-time point and `$2` the decision-time point of
/// the dataset's [`TemporalAxes`].
///
/// `scope` is the node universe: every non-draft, non-archived entity
/// holding a whole-entity embedding whose edition is current at the
/// dataset's temporal axes, with its dense row assigned by canonical
/// `(web_id, entity_uuid)` order. `links` pairs each link
/// entity's left and right attachments and densifies both endpoints
/// through `scope`, so links with out-of-scope endpoints drop out here.
/// `type_set` collects every type reachable from scope or links at any
/// inheritance depth (the store materializes closures, so all-depth rows
/// are exactly the closure), and `ordinals` assigns dense type rows by
/// uuid byte order.
//
// The embeddings table's own `draft_id` column is deliberately not
// consulted: the unique index `(web_id, entity_uuid, property)` NULLS NOT
// DISTINCT already guarantees one whole-entity row per identity, and the
// draft axis is decided by `entity_temporal_metadata.draft_id IS NULL`.
const COMMON_TABLE_EXPRESSIONS: &str = "
    WITH scope AS (
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
    ),
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
    ),
    type_set AS (
        SELECT DISTINCT is_of_type.entity_type_ontology_id AS ontology_id
        FROM (
            SELECT entity_edition_id FROM scope
            UNION ALL
            SELECT entity_edition_id FROM links
        ) AS editions
        JOIN entity_is_of_type AS is_of_type
          ON is_of_type.entity_edition_id = editions.entity_edition_id
    ),
    ordinals AS (
        SELECT
            ontology_id,
            row_number() OVER (ORDER BY ontology_id) - 1 AS ordinal
        FROM type_set
    )
";

/// A failure while reading from the graph store.
#[derive(Debug)]
pub(crate) enum PostgresDatasetError {
    /// The store rejected or aborted a query.
    Query(tokio_postgres::Error),
    /// A row referenced more type ordinals than the type table holds.
    Ordinal { value: i64 },
    /// Requested canonical embeddings that the store does not hold.
    MissingCanonicalEmbeddings { missing: usize },
}

impl fmt::Display for PostgresDatasetError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Query(_) => formatter.write_str("graph store query failed"),
            Self::Ordinal { value } => {
                write!(formatter, "type ordinal {value} is not a valid row")
            }
            Self::MissingCanonicalEmbeddings { missing } => write!(
                formatter,
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
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header => formatter.write_str("pgvector header is truncated"),
            Self::Shape {
                expected,
                dimensions,
                bytes,
            } => write!(
                formatter,
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

fn decode_ontology(row: &Row) -> Result<Ontology<ArchivedOntologyTypeUuid>, PostgresDatasetError> {
    let ontology_id: Uuid = row.try_get(0)?;
    let parents: Vec<i64> = row.try_get(1)?;

    Ok(Ontology {
        id: ontology_id.into(),
        parents: ontology_rows(parents)?,
    })
}

/// A [`Dataset`] reading one frozen view of the HASH graph store.
///
/// The dataset's scope is every non-draft, non-archived entity that holds
/// a whole-entity embedding and is current at the dataset's
/// [`TemporalAxes`], plus every link whose endpoints both fall inside
/// that scope. Prefix truncation, l2 normalization, and endpoint
/// densification all happen inside the store's queries; the connection
/// ships dense rows and normalized prefixes only.
pub(crate) struct PostgresDataset<'client> {
    transaction: Transaction<'client>,
    axes: TemporalAxes,
}

impl<'client> PostgresDataset<'client> {
    /// Freezes one view of the store at `axes` and serves a dataset from
    /// it.
    ///
    /// The view stays frozen until the dataset is dropped. The axes are
    /// the fit's declared bitemporal inputs: record them in the
    /// generation metadata, and pass axes in the past to read the graph
    /// as it stood then.
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

        // The scope CTE materializes once per query and feeds two hash
        // joins in the edge query; the default 4 MiB work_mem would spill
        // both to disk at realistic corpus sizes.
        transaction
            .batch_execute("SET LOCAL work_mem = '256MB'")
            .await?;

        Ok(Self { transaction, axes })
    }

    /// Issues `sql` with the dataset's temporal axes as `$1`/`$2` and
    /// adapts the row stream through `decode`.
    fn stream_query<'this, T>(
        &'this self,
        sql: String,
        decode: fn(&Row) -> Result<T, PostgresDatasetError>,
    ) -> impl Stream<Item = Result<T, PostgresDatasetError>> + 'this
    where
        T: 'this,
    {
        // The `async move` here is required, so that `sql` lives just enough for the stream to be
        // born, releasing the borrow.
        async move {
            self.transaction
                .query_raw(
                    &sql,
                    [
                        &self.axes.transaction_time as &(dyn ToSql + Sync),
                        &self.axes.decision_time as &(dyn ToSql + Sync),
                    ],
                )
                .await
        }
        .into_stream()
        .try_flatten()
        .map_err(PostgresDatasetError::from)
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
    type EdgeStream<'this>
        = impl Stream<Item = Result<Edge<ArchivedEntityId>, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type NodeStream<'this>
        = impl Stream<Item = Result<Node<ArchivedEntityId>, PostgresDatasetError>> + 'this
    where
        Self: 'this;
    type OntologyStream<'this>
        =
        impl Stream<Item = Result<Ontology<ArchivedOntologyTypeUuid>, PostgresDatasetError>> + 'this
    where
        Self: 'this;

    fn nodes(&self) -> Self::NodeStream<'_> {
        let sql = format!(
            "{COMMON_TABLE_EXPRESSIONS}
            SELECT
                scope.web_id,
                scope.entity_uuid,
                l2_normalize(
                    subvector(embedding.embedding, 1, {PROJECTOR_DIMENSIONS})
                )::vector({PROJECTOR_DIMENSIONS}),
                edition.confidence,
                COALESCE(types.ordinals, '{{}}')
            FROM scope
            JOIN entity_embeddings AS embedding
              ON embedding.web_id = scope.web_id
             AND embedding.entity_uuid = scope.entity_uuid
             AND embedding.property IS NULL
            JOIN entity_editions AS edition
              ON edition.entity_edition_id = scope.entity_edition_id
            LEFT JOIN LATERAL (
                SELECT array_agg(ordinals.ordinal ORDER BY ordinals.ordinal) AS ordinals
                FROM entity_is_of_type AS is_of_type
                JOIN ordinals
                  ON ordinals.ontology_id = is_of_type.entity_type_ontology_id
                WHERE is_of_type.entity_edition_id = scope.entity_edition_id
                  AND is_of_type.inheritance_depth = 0
            ) AS types ON TRUE
            ORDER BY scope.row"
        );

        self.stream_query(sql, decode_node)
    }

    fn edges(&self) -> Self::EdgeStream<'_> {
        let sql = format!(
            "{COMMON_TABLE_EXPRESSIONS}
            SELECT
                links.web_id,
                links.entity_uuid,
                links.source_row,
                links.target_row,
                COALESCE(types.ordinals, '{{}}'),
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
            LEFT JOIN LATERAL (
                SELECT array_agg(ordinals.ordinal ORDER BY ordinals.ordinal) AS ordinals
                FROM entity_is_of_type AS is_of_type
                JOIN ordinals
                  ON ordinals.ontology_id = is_of_type.entity_type_ontology_id
                WHERE is_of_type.entity_edition_id = links.entity_edition_id
                  AND is_of_type.inheritance_depth = 0
            ) AS types ON TRUE
            ORDER BY links.web_id, links.entity_uuid, links.source_row, links.target_row"
        );

        self.stream_query(sql, decode_edge)
    }

    fn ontology(&self) -> Self::OntologyStream<'_> {
        let sql = format!(
            "{COMMON_TABLE_EXPRESSIONS}
            SELECT
                ordinals.ontology_id,
                COALESCE(parents.ordinals, '{{}}')
            FROM ordinals
            LEFT JOIN LATERAL (
                SELECT array_agg(parent.ordinal ORDER BY parent.ordinal) AS ordinals
                FROM entity_type_inherits_from AS inherits
                JOIN ordinals AS parent
                  ON parent.ontology_id = inherits.target_entity_type_ontology_id
                WHERE inherits.source_entity_type_ontology_id = ordinals.ontology_id
                  AND inherits.depth = 0
            ) AS parents ON TRUE
            ORDER BY ordinals.ordinal"
        );

        self.stream_query(sql, decode_ontology)
    }

    fn canonical_node_embeddings<I: Iterator<Item = Self::NodeId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        let (entity_uuids, web_ids): (Vec<_>, Vec<_>) = nodes
            .into_iter()
            .map(|id| {
                (
                    Uuid::from_bytes(id.entity_uuid.0),
                    Uuid::from_bytes(id.web_id.0),
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

    /// Renders the card for one ontology type into `write`.
    ///
    /// The card lists the type's title and description, then the titles
    /// and descriptions of its ancestors in ascending inheritance depth,
    /// ties broken by type id, so equal ids produce equal bytes.
    ///
    /// # Errors
    ///
    /// Returns an error when the writer fails, when the store fails, or -
    /// as [`io::ErrorKind::NotFound`] - when `id` names no type the store
    /// holds.
    async fn render_card<W>(
        &self,
        id: ArchivedOntologyTypeUuid,
        mut write: Pin<&mut W>,
    ) -> io::Result<()>
    where
        W: AsyncWrite + ?Sized,
    {
        let id = Uuid::from_bytes(id.0);

        let rows = self
            .transaction
            .query(
                "SELECT
                     types.schema ->> 'title',
                     types.schema ->> 'description',
                     chain.depth
                 FROM (
                     SELECT $1::uuid AS ontology_id, -1 AS depth
                     UNION ALL
                     SELECT inherits.target_entity_type_ontology_id, inherits.depth
                     FROM entity_type_inherits_from AS inherits
                     WHERE inherits.source_entity_type_ontology_id = $1::uuid
                 ) AS chain
                 JOIN entity_types AS types
                   ON types.ontology_id = chain.ontology_id
                 ORDER BY chain.depth, chain.ontology_id",
                &[&id],
            )
            .await
            .map_err(io::Error::other)?;

        if rows.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("ontology type {id} is not in the store"),
            ));
        }

        let mut card = String::new();
        for row in &rows {
            let title: Option<&str> = row.try_get(0).map_err(io::Error::other)?;
            let description: Option<&str> = row.try_get(1).map_err(io::Error::other)?;
            let depth: i32 = row.try_get(2).map_err(io::Error::other)?;

            if depth >= 0 {
                card.push_str("\nInherits: ");
            }
            card.push_str(title.unwrap_or("(untitled)"));
            if let Some(description) = description {
                card.push('\n');
                card.push_str(description);
            }
            card.push('\n');
        }

        write_all(write.as_mut(), card.as_bytes()).await
    }
}
