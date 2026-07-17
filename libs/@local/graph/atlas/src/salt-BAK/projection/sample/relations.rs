//! Relational preprocessing inside the sample's PostgreSQL snapshot.
//!
//! PostgreSQL owns every set operation that benefits from the sampled
//! identity index: endpoint mapping, self-relation removal, undirected
//! canonicalization, deduplication, degree statistics, hub selection, and
//! hub-edge removal. Rust receives only stable hub identities and a stream of
//! `u32` row pairs, keeping identity resolution out of the numeric pipeline.
//!
//! [`prepare_relations`] runs the stages in order:
//!
//! 1. [`materialize_relations`] builds the deduplicated undirected relation table and its degree
//!    table.
//! 2. [`select_hubs`] computes the degree threshold, records the hub identities, and deletes every
//!    relation touching a hub.
//! 3. [`stream_adjacency`] streams the surviving adjacency, symmetrized and ordered.
//!
//! All tables are temporary and dropped when the sample's transaction ends.

use core::{
    iter,
    marker::PhantomData,
    pin::Pin,
    task::{self, Context, Poll},
};

use futures::Stream;
use hash_graph_postgres_store::store::postgres::query::Table;
use tokio_postgres::{GenericClient, RowStream, types::ToSql};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};

use super::{HUB_TABLE, RELATION_DEGREE_TABLE, RELATION_TABLE, SAMPLE_TABLE, SampleError};

/// The relational inputs extracted from one sample snapshot.
pub struct Relations<'sample> {
    /// Stable identities of the removed hub rows, in sample-index order.
    pub hubs: Vec<EntityId>,
    /// The symmetric hub-free adjacency, streamed in strict `(source,
    /// target)` order.
    pub edges: QueryEdges<'sample>,
}

pin_project_lite::pin_project! {
    /// A stream of undirected adjacency entries as `u32` sampled row pairs.
    ///
    /// Each undirected relation appears twice, once per direction, and the
    /// stream is strictly ordered by `(source, target)`, which is exactly the
    /// order a CSR adjacency is assembled in. The lifetime ties the stream to
    /// the sample's open transaction.
    pub struct QueryEdges<'sample> {
        #[pin]
        stream: RowStream,
        marker: PhantomData<&'sample ()>,
    }
}

impl Stream for QueryEdges<'_> {
    type Item = Result<(u32, u32), SampleError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();
        let Some(row) = task::ready!(this.stream.poll_next(cx)?) else {
            return Poll::Ready(None);
        };

        let source: i64 = row.try_get(0)?;
        let source = u32::try_from(source).map_err(|_error| SampleError::InvalidIndex(source))?;
        let target: i64 = row.try_get(1)?;
        let target = u32::try_from(target).map_err(|_error| SampleError::InvalidIndex(target))?;

        Poll::Ready(Some(Ok((source, target))))
    }
}

/// Builds the deduplicated undirected relation table and its degree table.
///
/// A link entity connects its left endpoint to its right endpoint; joining
/// the two edge kinds through the shared link entity and mapping both
/// endpoints through the sample table yields one candidate row per sampled
/// link. Self-relations are dropped, endpoints are canonicalized so `source <
/// target`, and `SELECT DISTINCT` collapses parallel links and directional
/// duplicates into one undirected pair. Relation multiplicity is deliberately
/// not a layout signal.
///
/// The primary key on `(source, target)` relies on that `DISTINCT`: it cannot
/// fail on the deduplicated rows and doubles as a loud assertion that the
/// deduplication stays in place, while providing the index the hub-removal
/// deletes and the final ordered scan need. Degrees are computed after
/// deduplication, so a vertex's degree counts distinct sampled partners.
async fn materialize_relations(client: &(impl GenericClient + Sync)) -> Result<(), SampleError> {
    client
        .batch_execute(&format!(
            "CREATE TEMPORARY TABLE {RELATION_TABLE} ON COMMIT DROP AS
                 SELECT DISTINCT
                     LEAST(source_sample.sample_index, target_sample.sample_index) AS source,
                     GREATEST(source_sample.sample_index, target_sample.sample_index) AS target
                 FROM {entity_edge} left_edge
                 JOIN {entity_edge} right_edge
                   ON left_edge.source_web_id = right_edge.source_web_id
                  AND left_edge.source_entity_uuid = right_edge.source_entity_uuid
                 JOIN {SAMPLE_TABLE} source_sample
                   ON left_edge.target_web_id = source_sample.web_id
                  AND left_edge.target_entity_uuid = source_sample.entity_uuid
                 JOIN {SAMPLE_TABLE} target_sample
                   ON right_edge.target_web_id = target_sample.web_id
                  AND right_edge.target_entity_uuid = target_sample.entity_uuid
                 WHERE left_edge.kind = 'has-left-entity'
                   AND left_edge.direction = 'outgoing'
                   AND right_edge.kind = 'has-right-entity'
                   AND right_edge.direction = 'outgoing'
                   AND source_sample.sample_index <> target_sample.sample_index;
             ALTER TABLE {RELATION_TABLE} ADD PRIMARY KEY (source, target);

             CREATE TEMPORARY TABLE {RELATION_DEGREE_TABLE} ON COMMIT DROP AS
                 SELECT sample_index, COUNT(*) AS degree
                 FROM (
                     SELECT source AS sample_index FROM {RELATION_TABLE}
                     UNION ALL
                     SELECT target AS sample_index FROM {RELATION_TABLE}
                 ) endpoints
                 GROUP BY sample_index;
             ALTER TABLE {RELATION_DEGREE_TABLE} ADD PRIMARY KEY (sample_index);
             ANALYZE {RELATION_TABLE};
             ANALYZE {RELATION_DEGREE_TABLE};",
            entity_edge = Table::EntityEdge.as_str(),
        ))
        .await
        .map_err(From::from)
}

/// Selects hub rows, removes their relations, and returns their identities.
///
/// A row is a hub when its post-deduplication degree exceeds both the
/// `hub_quantile` of the positive degree distribution and `hub_min_ratio`
/// times its median; requiring both keeps moderate-degree rows out of the hub
/// set when the distribution is flat. When no relations exist the threshold
/// is infinite and no rows qualify.
///
/// Hubs distort layouts by pulling unrelated regions together, so every
/// relation touching one is deleted. The removed rows keep their sample
/// indices and embeddings; only their relational influence disappears. The
/// returned identities are stable [`EntityId`]s in sample-index order, since
/// sample-local row indices mean nothing across refits.
async fn select_hubs(
    client: &(impl GenericClient + Sync),
    hub_quantile: f64,
    hub_min_ratio: f64,
) -> Result<Vec<EntityId>, SampleError> {
    let hub_cut = client
        .query_one(
            &format!(
                "SELECT GREATEST(
                     percentile_cont($1::DOUBLE PRECISION) WITHIN GROUP (ORDER BY degree),
                     $2::DOUBLE PRECISION * percentile_cont(0.5) WITHIN GROUP (ORDER BY degree)
                 )::DOUBLE PRECISION
                 FROM {RELATION_DEGREE_TABLE}"
            ),
            &[&hub_quantile, &hub_min_ratio],
        )
        .await?
        .try_get::<_, Option<f64>>(0)?
        .unwrap_or(f64::INFINITY);

    client
        .execute(
            &format!(
                "CREATE TEMPORARY TABLE {HUB_TABLE} ON COMMIT DROP AS
                     SELECT degree.sample_index, sample.web_id, sample.entity_uuid
                     FROM {RELATION_DEGREE_TABLE} degree
                     JOIN {SAMPLE_TABLE} sample USING (sample_index)
                     WHERE degree.degree > $1::DOUBLE PRECISION"
            ),
            &[&hub_cut],
        )
        .await?;
    client
        .batch_execute(&format!(
            "ALTER TABLE {HUB_TABLE} ADD PRIMARY KEY (sample_index);
             DELETE FROM {RELATION_TABLE} relation
                 USING {HUB_TABLE} hub
                 WHERE relation.source = hub.sample_index;
             DELETE FROM {RELATION_TABLE} relation
                 USING {HUB_TABLE} hub
                 WHERE relation.target = hub.sample_index;
             ANALYZE {RELATION_TABLE};"
        ))
        .await?;

    client
        .query(
            &format!(
                "SELECT web_id, entity_uuid
                 FROM {HUB_TABLE}
                 ORDER BY sample_index"
            ),
            &[],
        )
        .await?
        .into_iter()
        .map(|row| {
            Ok(EntityId {
                web_id: row.try_get::<_, WebId>(0)?,
                entity_uuid: row.try_get::<_, EntityUuid>(1)?,
                draft_id: None,
            })
        })
        .collect::<Result<Vec<_>, tokio_postgres::Error>>()
        .map_err(From::from)
}

/// Streams the hub-free adjacency, symmetrized and strictly ordered.
///
/// The canonical `source < target` rows are unioned with their mirror image
/// and sorted, so consumers can assemble a symmetric CSR adjacency in one
/// pass without buffering the edge list.
async fn stream_adjacency(
    client: &(impl GenericClient + Sync),
) -> Result<QueryEdges<'_>, SampleError> {
    let stream = client
        .query_raw(
            &format!(
                "SELECT source, target
                 FROM (
                     SELECT source, target FROM {RELATION_TABLE}
                     UNION ALL
                     SELECT target AS source, source AS target FROM {RELATION_TABLE}
                 ) adjacency
                 ORDER BY source, target"
            ),
            iter::empty::<&(dyn ToSql + Sync)>(),
        )
        .await?;

    Ok(QueryEdges {
        stream,
        marker: PhantomData,
    })
}

/// Runs the full relational preprocessing pipeline for one sample snapshot.
///
/// See the module documentation for the stage breakdown. The hub thresholds
/// are documented on [`select_hubs`].
pub(super) async fn prepare_relations(
    client: &(impl GenericClient + Sync),
    hub_quantile: f64,
    hub_min_ratio: f64,
) -> Result<Relations<'_>, SampleError> {
    materialize_relations(client).await?;
    let hubs = select_hubs(client, hub_quantile, hub_min_ratio).await?;
    let edges = stream_adjacency(client).await?;

    Ok(Relations { hubs, edges })
}
