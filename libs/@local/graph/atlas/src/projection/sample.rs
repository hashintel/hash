use core::{
    error::Error,
    fmt, future, iter,
    marker::PhantomData,
    pin::{Pin, pin},
    task::{self, Context, Poll},
};
use std::io;

use bytes::{Bytes, BytesMut};
use camino::{Utf8Path, Utf8PathBuf};
use futures::{SinkExt as _, Stream, TryStreamExt as _, sink};
use hash_graph_embeddings::{D512, Dimension};
use hash_graph_postgres_store::store::postgres::query::{
    Table,
    table::{DatabaseColumn as _, EntityEmbeddings},
};
use tempfile::NamedTempFile;
use tokio::{
    fs,
    io::{AsyncReadExt as _, AsyncWrite, AsyncWriteExt as _, BufWriter},
};
use tokio_postgres::{
    Client, GenericClient, IsolationLevel, Row, RowStream, Transaction,
    types::{FromSql, ToSql, Type},
};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};

use crate::float::FloatBytes;

#[derive(Debug)]
pub(super) enum SampleError {
    CacheRowCount { embeddings: usize, mappings: u64 },
    InvalidIndex(i64),
    Io(io::Error),
    Join(tokio::task::JoinError),
    Persist(tempfile::PersistError),
    Postgres(tokio_postgres::Error),
}

impl fmt::Display for SampleError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CacheRowCount {
                embeddings,
                mappings,
            } => write!(
                fmt,
                "sample cache is inconsistent: {embeddings} embedding rows but {mappings} mapping \
                 rows"
            ),
            Self::InvalidIndex(index) => {
                write!(fmt, "database returned invalid sample index {index}")
            }
            Self::Io(_) => fmt.write_str("failed to access sampled data"),
            Self::Join(_) => fmt.write_str("sample cache persistence task failed"),
            Self::Persist(_) => fmt.write_str("failed to persist sampled data"),
            Self::Postgres(_) => fmt.write_str("failed to query sampled data"),
        }
    }
}

impl Error for SampleError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::CacheRowCount { .. } | Self::InvalidIndex(_) => None,
            Self::Io(error) => Some(error),
            Self::Join(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::Postgres(error) => Some(error),
        }
    }
}

impl From<io::Error> for SampleError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<tokio::task::JoinError> for SampleError {
    fn from(error: tokio::task::JoinError) -> Self {
        Self::Join(error)
    }
}

impl From<tempfile::PersistError> for SampleError {
    fn from(error: tempfile::PersistError) -> Self {
        Self::Persist(error)
    }
}

impl From<tokio_postgres::Error> for SampleError {
    fn from(error: tokio_postgres::Error) -> Self {
        Self::Postgres(error)
    }
}

#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct SampleOptions {
    pub dim: Dimension = D512,
    pub size: usize = 1_500_000,
}

/// A prepared sample whose relational view is backed by a temporary PostgreSQL table.
///
/// The repeatable-read transaction remains open so callers can build relational inputs through
/// [`Self::visit_edges`]. Call [`Self::finish`] before long-running fitting or training to release
/// the database snapshot and connection while retaining the mmap-backed embeddings.
pub(crate) struct Sample<'client> {
    embeddings: FloatBytes,
    transaction: Transaction<'client>,
}

impl<'client> Sample<'client> {
    pub(crate) async fn load(
        client: &'client mut Client,
        out: impl AsRef<Utf8Path>,
        seed: u64,
        options: SampleOptions,
    ) -> Result<Self, SampleError> {
        let out = out.as_ref();
        let embeddings_path = embeddings_path(out);
        let mappings_path = mappings_path(out);

        let (embeddings_exists, mappings_exists) = future::join!(
            fs::try_exists(&embeddings_path),
            fs::try_exists(&mappings_path),
        )
        .await;
        let cache_exists = embeddings_exists? && mappings_exists?;

        let transaction = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .start()
            .await?;

        let mapping_rows = if cache_exists {
            let mut file = fs::File::open(&mappings_path).await?;
            load_mapping(&transaction, &mut file).await?
        } else {
            write_sample(&transaction, out, seed, options).await?
        };

        let embeddings_file = fs::File::open(embeddings_path).await?.into_std().await;
        let embeddings = FloatBytes::from_file(embeddings_file, options.dim.value().into())?;

        if usize::try_from(mapping_rows).ok() != Some(embeddings.len()) {
            return Err(SampleError::CacheRowCount {
                embeddings: embeddings.len(),
                mappings: mapping_rows,
            });
        }

        Ok(Self {
            embeddings,
            transaction,
        })
    }

    pub(super) const fn embeddings(&self) -> &FloatBytes {
        &self.embeddings
    }

    /// Preprocesses sampled relations in PostgreSQL and returns their stable hubs and adjacency.
    pub(super) async fn relations(
        &self,
        hub_quantile: f64,
        hub_min_ratio: f64,
    ) -> Result<Relations<'_>, SampleError> {
        prepare_relations(&self.transaction, hub_quantile, hub_min_ratio).await
    }

    /// Commits the short-lived database snapshot and returns the embeddings used for training.
    pub(super) async fn finish(self) -> Result<FloatBytes, SampleError> {
        let Self {
            embeddings,
            transaction,
        } = self;

        transaction.commit().await?;
        Ok(embeddings)
    }
}

const SAMPLE_TABLE: &str = "atlas_sample";
const RELATION_TABLE: &str = "atlas_relation";
const RELATION_DEGREE_TABLE: &str = "atlas_relation_degree";
const HUB_TABLE: &str = "atlas_relation_hub";
const OUTPUT_BUFFER_SIZE: usize = 1024 * 1024;

async fn create_sample_table(client: &(impl GenericClient + Sync)) -> Result<(), SampleError> {
    client
        .batch_execute(&format!(
            "CREATE TEMPORARY TABLE {SAMPLE_TABLE} (
                 sample_index BIGINT NOT NULL,
                 web_id UUID NOT NULL,
                 entity_uuid UUID NOT NULL
             ) ON COMMIT DROP"
        ))
        .await
        .map_err(From::from)
}

// Building indexes after the bulk insert or COPY is substantially cheaper than maintaining
// them row by row. PostgreSQL does not auto-analyze temporary tables, so collect statistics
// explicitly for the large joins below.
async fn index_sample_table(client: &(impl GenericClient + Sync)) -> Result<(), SampleError> {
    client
        .batch_execute(&format!(
            "CREATE UNIQUE INDEX atlas_sample_by_index
                 ON {SAMPLE_TABLE} (sample_index);
             CREATE UNIQUE INDEX atlas_sample_by_entity
                 ON {SAMPLE_TABLE} (web_id, entity_uuid);
             ANALYZE {SAMPLE_TABLE};"
        ))
        .await
        .map_err(From::from)
}

async fn query_count(client: &(impl GenericClient + Sync)) -> Result<i64, SampleError> {
    let row = client
        .query_one(
            &format!(
                "SELECT COUNT(*)
                 FROM {entity_embeddings}
                 WHERE {property} IS NULL",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str()
            ),
            &[],
        )
        .await?;

    row.try_get(0).map_err(From::from)
}

#[expect(
    clippy::cast_precision_loss,
    reason = "PostgreSQL's TABLESAMPLE percentage is an f64"
)]
async fn materialize_sample(
    client: &(impl GenericClient + Sync),
    seed: u64,
    total_rows: i64,
    options: SampleOptions,
) -> Result<u64, SampleError> {
    create_sample_table(client).await?;

    let seed = seed.cast_signed();
    let pct = f64::min(
        100.0,
        100.0 * (options.size as f64) / f64::max(total_rows as f64, 1.0),
    );

    let rows = client
        .execute(
            &format!(
                "INSERT INTO {SAMPLE_TABLE} (sample_index, web_id, entity_uuid)
                 SELECT
                     row_number() OVER () - 1,
                     embeddings.web_id,
                     embeddings.entity_uuid
                 FROM {entity_embeddings} embeddings
                 TABLESAMPLE BERNOULLI($1) REPEATABLE ($2)
                 WHERE embeddings.{property} IS NULL",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str(),
            ),
            &[&pct as &(dyn ToSql + Sync), &seed as &(dyn ToSql + Sync)],
        )
        .await?;

    index_sample_table(client).await?;
    Ok(rows)
}

struct EmbeddingBytes<'value>(&'value [u8]);

impl<'value> FromSql<'value> for EmbeddingBytes<'value> {
    #[expect(
        clippy::big_endian_bytes,
        reason = "PostgreSQL sends vector headers in big-endian order"
    )]
    fn from_sql(_ty: &Type, raw: &'value [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let &[raw_hi, raw_lo, unused_hi, unused_lo, ref rest @ ..] = raw else {
            return Err("expected at least 4 bytes".into());
        };

        let dim = u16::from_be_bytes([raw_hi, raw_lo]) as usize;
        let unused = u16::from_be_bytes([unused_hi, unused_lo]);
        if unused != 0 {
            return Err("expect unused bytes to be zero".into());
        }

        if rest.len() != (size_of::<f32>() * dim) {
            return Err("the dimensions exceed the available data".into());
        }

        Ok(Self(&rest[..(size_of::<f32>() * dim)]))
    }

    fn accepts(ty: &Type) -> bool {
        ty.name() == "vector"
    }
}

#[expect(
    clippy::big_endian_bytes,
    clippy::host_endian_bytes,
    reason = "PostgreSQL sends f32 values big-endian and sample files are native-endian"
)]
async fn query_embeddings<W>(
    client: &(impl GenericClient + Sync),
    options: SampleOptions,
    output: W,
) -> Result<(), SampleError>
where
    W: AsyncWrite,
{
    let stream = client
        .query_raw(
            &format!(
                "SELECT
                     l2_normalize(
                         subvector(embedding.embedding, 1, {dim})
                     )::vector({dim}) AS embedding
                 FROM {SAMPLE_TABLE} sample
                 JOIN {entity_embeddings} embedding
                   ON sample.web_id = embedding.web_id
                  AND sample.entity_uuid = embedding.entity_uuid
                 WHERE embedding.{property} IS NULL
                 ORDER BY sample.sample_index",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str(),
                dim = options.dim,
            ),
            iter::empty::<&(dyn ToSql + Sync)>(),
        )
        .await?;

    let mut writer = pin!(output);
    let sink = sink::unfold(
        (
            vec![0_u8; usize::from(options.dim.get()) * size_of::<f32>()],
            &mut writer,
        ),
        async |(mut embedding, writer), row: Row| {
            let raw_embedding: EmbeddingBytes<'_> = row.try_get(0)?;

            // Reuse this allocation for every row while converting PostgreSQL's big-endian f32
            // representation to the native-endian format consumed by FloatBytes.
            embedding.copy_from_slice(raw_embedding.0);
            let (floats, tail) = embedding.as_chunks_mut::<{ size_of::<f32>() }>();
            debug_assert!(tail.is_empty());
            for float in floats {
                *float = f32::from_be_bytes(*float).to_ne_bytes();
            }

            writer.write_all(&embedding).await?;
            Ok::<_, SampleError>((embedding, writer))
        },
    );

    {
        let mut stream = pin!(stream.map_err(SampleError::from));
        let mut sink = pin!(sink);

        sink.send_all(&mut stream).await?;
        sink.close().await?;
    }

    writer.shutdown().await?;
    Ok(())
}

async fn copy_mapping_out<W>(transaction: &Transaction<'_>, output: W) -> Result<(), SampleError>
where
    W: AsyncWrite,
{
    let stream = transaction
        .copy_out(&format!(
            "COPY (
                 SELECT sample_index, web_id, entity_uuid
                 FROM {SAMPLE_TABLE}
                 ORDER BY sample_index
             ) TO STDOUT (FORMAT BINARY)"
        ))
        .await?;
    let mut stream = pin!(stream);
    let mut writer = pin!(output);

    while let Some(bytes) = stream.try_next().await? {
        writer.write_all(&bytes).await?;
    }

    writer.shutdown().await?;
    Ok(())
}

async fn copy_mapping_in(
    transaction: &Transaction<'_>,
    file: &mut fs::File,
) -> Result<u64, SampleError> {
    let sink = transaction
        .copy_in::<_, Bytes>(&format!(
            "COPY {SAMPLE_TABLE} (sample_index, web_id, entity_uuid)
             FROM STDIN (FORMAT BINARY)"
        ))
        .await?;
    let mut sink = pin!(sink);
    let mut buffer = BytesMut::with_capacity(OUTPUT_BUFFER_SIZE);

    loop {
        buffer.reserve(OUTPUT_BUFFER_SIZE);
        let read = file.read_buf(&mut buffer).await?;
        if read == 0 {
            break;
        }

        sink.as_mut().send(buffer.split().freeze()).await?;
    }

    sink.as_mut().finish().await.map_err(From::from)
}

async fn load_mapping(
    transaction: &Transaction<'_>,
    file: &mut fs::File,
) -> Result<u64, SampleError> {
    create_sample_table(transaction).await?;
    let rows = copy_mapping_in(transaction, file).await?;
    index_sample_table(transaction).await?;
    Ok(rows)
}

fn embeddings_path(out: impl AsRef<Utf8Path>) -> Utf8PathBuf {
    out.as_ref().join("sample.f32")
}

fn mappings_path(out: impl AsRef<Utf8Path>) -> Utf8PathBuf {
    out.as_ref().join("sample.pgcopy")
}

async fn write_sample(
    transaction: &Transaction<'_>,
    out: impl AsRef<Utf8Path>,
    seed: u64,
    options: SampleOptions,
) -> Result<u64, SampleError> {
    let out = out.as_ref();

    let total_rows = query_count(transaction).await?;
    let rows = materialize_sample(transaction, seed, total_rows, options).await?;

    let embeddings_path = embeddings_path(out);
    let mappings_path = mappings_path(out);

    let (embeddings_out, embeddings_temporary_path) = NamedTempFile::new_in(out)?.into_parts();
    let (mappings_out, mappings_temporary_path) = NamedTempFile::new_in(out)?.into_parts();

    let mut embeddings_out = fs::File::from_std(embeddings_out);
    let mut mappings_out = fs::File::from_std(mappings_out);

    query_embeddings(
        transaction,
        options,
        BufWriter::with_capacity(OUTPUT_BUFFER_SIZE, &mut embeddings_out),
    )
    .await?;

    copy_mapping_out(
        transaction,
        BufWriter::with_capacity(OUTPUT_BUFFER_SIZE, &mut mappings_out),
    )
    .await?;

    let embeddings_out =
        NamedTempFile::from_parts(embeddings_out.into_std().await, embeddings_temporary_path);
    let mappings_out =
        NamedTempFile::from_parts(mappings_out.into_std().await, mappings_temporary_path);

    tokio::task::spawn_blocking(move || -> Result<(), tempfile::PersistError> {
        embeddings_out.persist(embeddings_path)?;
        mappings_out.persist(mappings_path)?;

        Ok(())
    })
    .await??;

    Ok(rows)
}

pub(super) struct Relations<'sample> {
    pub(super) hubs: Vec<EntityId>,
    pub(super) edges: QueryEdges<'sample>,
}

pin_project_lite::pin_project! {
    pub(super) struct QueryEdges<'sample> {
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

async fn prepare_relations(
    client: &(impl GenericClient + Sync),
    hub_quantile: f64,
    hub_min_ratio: f64,
) -> Result<Relations<'_>, SampleError> {
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
        .await?;

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
                     WHERE degree.degree > $1"
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

    let hubs = client
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
        .collect::<Result<Vec<_>, tokio_postgres::Error>>()?;

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

    Ok(Relations {
        hubs,
        edges: QueryEdges {
            stream,
            marker: PhantomData,
        },
    })
}
