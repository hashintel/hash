use core::{error::Error, fmt, pin::pin};
use std::io;

use futures::{SinkExt as _, TryStreamExt as _, future::join, sink};
use hash_graph_embeddings::{D512, Dimension};
use hash_graph_postgres_store::store::postgres::query::{
    Table,
    table::{DatabaseColumn as _, EntityEmbeddings},
};
use tokio::io::{AsyncWrite, AsyncWriteExt as _, BufWriter};
use tokio_postgres::{
    Client, GenericClient, IsolationLevel, Row,
    types::{FromSql, ToSql, Type},
};
use type_system::{knowledge::entity::id::EntityUuid, principal::actor_group::WebId};
use uuid::Uuid;

#[derive(Debug)]
enum SampleError {
    InvalidIndex(i64),
    Io(io::Error),
    Postgres(tokio_postgres::Error),
}

impl fmt::Display for SampleError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidIndex(index) => {
                write!(fmt, "database returned invalid sample index {index}")
            }
            Self::Io(_) => fmt.write_str("failed to write sampled data"),
            Self::Postgres(_) => fmt.write_str("failed to query sampled data"),
        }
    }
}

impl Error for SampleError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidIndex(_) => None,
            Self::Io(error) => Some(error),
            Self::Postgres(error) => Some(error),
        }
    }
}

impl From<io::Error> for SampleError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<tokio_postgres::Error> for SampleError {
    fn from(error: tokio_postgres::Error) -> Self {
        Self::Postgres(error)
    }
}

#[derive(Debug, Copy, Clone, Default)]
struct SampleOptions {
    dim: Dimension = D512,
    size: usize = 1_500_000,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct SampleStats {
    rows: u64,
    edges: u64,
}

const SAMPLE_TABLE: &str = "atlas_sample";
const OUTPUT_BUFFER_SIZE: usize = 1024 * 1024;

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
    client
        .batch_execute(&format!(
            "CREATE TEMPORARY TABLE {SAMPLE_TABLE} (
                 sample_index BIGINT NOT NULL,
                 web_id UUID NOT NULL,
                 entity_uuid UUID NOT NULL
             ) ON COMMIT DROP"
        ))
        .await?;

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
            &[
                (&pct as &(dyn ToSql + Sync)),
                (&seed as &(dyn ToSql + Sync)),
            ],
        )
        .await?;

    // Building indexes after the bulk insert is substantially cheaper than maintaining them row by
    // row. PostgreSQL does not auto-analyze temporary tables, so collect statistics explicitly for
    // the two large joins below.
    client
        .batch_execute(&format!(
            "CREATE UNIQUE INDEX atlas_sample_by_index
                 ON {SAMPLE_TABLE} (sample_index);
             CREATE UNIQUE INDEX atlas_sample_by_entity
                 ON {SAMPLE_TABLE} (web_id, entity_uuid);
             ANALYZE {SAMPLE_TABLE};"
        ))
        .await?;

    Ok(rows)
}

struct RawEmbedding<'v>(&'v [u8]);
impl<'v> FromSql<'v> for RawEmbedding<'v> {
    #[expect(
        clippy::big_endian_bytes,
        reason = "PostgreSQL sends vector headers in big-endian order"
    )]
    fn from_sql(_ty: &Type, raw: &'v [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
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
async fn query_embeddings<W1, W2>(
    client: &(impl GenericClient + Sync),
    options: SampleOptions,
    embeddings_output: W1,
    metadata_output: W2,
) -> Result<(), SampleError>
where
    W1: AsyncWrite,
    W2: AsyncWrite,
{
    let stream = client
        .query_raw(
            &format!(
                "SELECT
                     sample.web_id,
                     sample.entity_uuid,
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
            core::iter::empty::<&(dyn ToSql + Sync)>(),
        )
        .await?;

    let mut metadata_writer = pin!(metadata_output);
    let mut embeddings_writer = pin!(embeddings_output);

    let sink = sink::unfold(
        (
            vec![0_u8; usize::from(options.dim.get()) * size_of::<f32>()],
            &mut metadata_writer,
            &mut embeddings_writer,
        ),
        async |(mut embedding, metadata_writer, embeddings_writer), row: Row| {
            let web_id: WebId = row.try_get(0)?;
            let entity_uuid: EntityUuid = row.try_get(1)?;
            let raw_embedding_bytes: RawEmbedding<'_> = row.try_get(2)?;

            embedding.copy_from_slice(raw_embedding_bytes.0);

            // PostgreSQL sends each f32 in big-endian order. Reuse this allocation for every row
            // while converting the bytes to the native-endian format consumed by FloatBytes.
            let (floats, tail) = embedding.as_chunks_mut::<{ size_of::<f32>() }>();
            debug_assert!(tail.is_empty());
            for float in floats {
                *float = f32::from_be_bytes(*float).to_ne_bytes();
            }

            let mut metadata = [0_u8; 32];
            metadata[..16].copy_from_slice(Uuid::from(web_id).as_bytes());
            metadata[16..].copy_from_slice(Uuid::from(entity_uuid).as_bytes());

            let (metadata_result, embeddings_result) = join(
                metadata_writer.write_all(&metadata),
                embeddings_writer.write_all(&embedding),
            )
            .await;

            metadata_result?;
            embeddings_result?;

            Ok::<_, SampleError>((embedding, metadata_writer, embeddings_writer))
        },
    );

    {
        let mut stream = pin!(stream.map_err(SampleError::from));
        let mut sink = pin!(sink);

        sink.send_all(&mut stream).await?;
        sink.close().await?;
    }

    metadata_writer.shutdown().await?;
    embeddings_writer.shutdown().await?;

    Ok(())
}

#[expect(
    clippy::host_endian_bytes,
    reason = "sample files intentionally use native byte order"
)]
async fn query_reverse_index<W>(
    client: &(impl GenericClient + Sync),
    output: W,
) -> Result<u64, SampleError>
where
    W: AsyncWrite,
{
    let stream = client
        .query_raw(
            &format!(
                "SELECT web_id, entity_uuid, sample_index
                 FROM {SAMPLE_TABLE}
                 ORDER BY web_id, entity_uuid"
            ),
            core::iter::empty::<&(dyn ToSql + Sync)>(),
        )
        .await?;
    let mut stream = pin!(stream);
    let mut writer = pin!(output);
    let mut written = 0_u64;
    let mut record = [0_u8; 2 * size_of::<Uuid>() + size_of::<u64>()];

    while let Some(row) = stream.try_next().await? {
        let web_id: Uuid = row.try_get(0)?;
        let entity_uuid: Uuid = row.try_get(1)?;
        let index = row.try_get::<_, i64>(2)?;
        let index = u64::try_from(index).map_err(|_error| SampleError::InvalidIndex(index))?;

        record[..16].copy_from_slice(web_id.as_bytes());
        record[16..32].copy_from_slice(entity_uuid.as_bytes());
        record[32..].copy_from_slice(&index.to_ne_bytes());
        writer.write_all(&record).await?;
        written += 1;
    }

    writer.shutdown().await?;
    Ok(written)
}

#[expect(
    clippy::host_endian_bytes,
    reason = "sample files intentionally use native byte order"
)]
async fn query_edges<W>(client: &(impl GenericClient + Sync), output: W) -> Result<u64, SampleError>
where
    W: AsyncWrite,
{
    let stream = client
        .query_raw(
            &format!(
                "SELECT source_sample.sample_index, target_sample.sample_index
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
                   AND right_edge.direction = 'outgoing'",
                entity_edge = Table::EntityEdge.as_str(),
            ),
            core::iter::empty::<&(dyn ToSql + Sync)>(),
        )
        .await?;
    let mut stream = pin!(stream);
    let mut writer = pin!(output);
    let mut written = 0_u64;
    let mut record = [0_u8; 2 * size_of::<u64>()];

    while let Some(row) = stream.try_next().await? {
        let source = row.try_get::<_, i64>(0)?;
        let source = u64::try_from(source).map_err(|_error| SampleError::InvalidIndex(source))?;
        let target = row.try_get::<_, i64>(1)?;
        let target = u64::try_from(target).map_err(|_error| SampleError::InvalidIndex(target))?;

        record[..8].copy_from_slice(&source.to_ne_bytes());
        record[8..].copy_from_slice(&target.to_ne_bytes());
        writer.write_all(&record).await?;
        written += 1;
    }

    writer.shutdown().await?;
    Ok(written)
}

async fn write_sample<W1, W2, W3, W4>(
    client: &mut Client,
    seed: u64,
    options: SampleOptions,
    embeddings_output: W1,
    metadata_output: W2,
    reverse_output: W3,
    edges_output: W4,
) -> Result<SampleStats, SampleError>
where
    W1: AsyncWrite,
    W2: AsyncWrite,
    W3: AsyncWrite,
    W4: AsyncWrite,
{
    // Keep the count, sampled identities, embeddings, and edges on one database snapshot. The
    // temporary table is dropped automatically when this transaction commits or rolls back.
    let transaction = client
        .build_transaction()
        .isolation_level(IsolationLevel::RepeatableRead)
        .start()
        .await?;

    let total_rows = query_count(&transaction).await?;
    let rows = materialize_sample(&transaction, seed, total_rows, options).await?;

    let embeddings_output = BufWriter::with_capacity(OUTPUT_BUFFER_SIZE, embeddings_output);
    let metadata_output = BufWriter::with_capacity(OUTPUT_BUFFER_SIZE, metadata_output);
    let reverse_output = BufWriter::with_capacity(OUTPUT_BUFFER_SIZE, reverse_output);
    let edges_output = BufWriter::with_capacity(OUTPUT_BUFFER_SIZE, edges_output);

    query_embeddings(&transaction, options, embeddings_output, metadata_output).await?;
    let reverse_rows = query_reverse_index(&transaction, reverse_output).await?;
    debug_assert_eq!(rows, reverse_rows);

    let edges = query_edges(&transaction, edges_output).await?;
    transaction.commit().await?;

    Ok(SampleStats { rows, edges })
}
