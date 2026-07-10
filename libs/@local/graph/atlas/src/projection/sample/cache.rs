//! Cold and hot paths for the on-disk sample cache.
//!
//! A sample is persisted as two files that must stay consistent:
//!
//! - `sample.f32`: native-endian embedding rows, in sample-index order, read back through a shared
//!   mmap.
//! - `sample.pgcopy`: the `(sample_index, web_id, entity_uuid)` identity mapping in PostgreSQL
//!   binary `COPY` format, so the hot path can restore the temporary table without re-drawing the
//!   sample.
//!
//! Both files are published with temporary-file hotswaps: a crash mid-write
//! leaves the previous cache intact, and [`Sample::load`] cross-checks the
//! row counts of the two files before trusting them.
//!
//! [`Sample::load`]: super::Sample::load

use core::{error::Error, iter, pin::pin};

use bytes::{Bytes, BytesMut};
use camino::{Utf8Path, Utf8PathBuf};
use futures::{SinkExt as _, TryStreamExt as _, sink};
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
    GenericClient, Row, Transaction,
    types::{FromSql, ToSql, Type},
};

use super::{OUTPUT_BUFFER_SIZE, SAMPLE_TABLE, SampleError, SampleOptions};

/// Location of the mmap-ready embedding matrix within the cache directory.
pub(super) fn embeddings_path(out: impl AsRef<Utf8Path>) -> Utf8PathBuf {
    out.as_ref().join("sample.f32")
}

/// Location of the binary `COPY` identity mapping within the cache directory.
pub(super) fn mappings_path(out: impl AsRef<Utf8Path>) -> Utf8PathBuf {
    out.as_ref().join("sample.pgcopy")
}

/// Creates the empty temporary sampled-identity table.
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

/// Indexes and analyzes the populated sampled-identity table.
///
/// The unique index over `(web_id, entity_uuid)` doubles as an integrity
/// assertion: sampling draws each entity at most once, and a violation here
/// means the source query produced duplicate identities.
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

/// Counts the sampleable embedding rows: live (non-draft) whole-entity
/// embeddings.
async fn query_count(client: &(impl GenericClient + Sync)) -> Result<i64, SampleError> {
    let row = client
        .query_one(
            &format!(
                "SELECT COUNT(*)
                 FROM {entity_embeddings}
                 WHERE {property} IS NULL
                   AND {draft_id} IS NULL",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str(),
                draft_id = EntityEmbeddings::DraftId.name().as_str(),
            ),
            &[],
        )
        .await?;

    row.try_get(0).map_err(From::from)
}

/// Draws the Bernoulli sample into the sampled-identity table and assigns
/// contiguous sample indices.
///
/// Only live (non-draft) whole-entity embedding rows participate. Draft rows
/// share their entity's `(web_id, entity_uuid)` identity, so admitting them
/// would sample the same identity more than once and break the unique
/// identity index (and the one-row-per-index embedding export).
#[expect(
    clippy::cast_precision_loss,
    reason = "PostgreSQL's TABLESAMPLE percentage and seed are double precision"
)]
async fn materialize_sample(
    client: &(impl GenericClient + Sync),
    seed: u64,
    total_rows: i64,
    options: SampleOptions,
) -> Result<u64, SampleError> {
    create_sample_table(client).await?;

    // TABLESAMPLE types its percentage parameter as `real` and REPEATABLE
    // accepts any numeric expression; bind both as double precision and cast
    // in SQL so the wire types line up.
    let seed = seed.cast_signed() as f64;
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
                 TABLESAMPLE BERNOULLI($1::DOUBLE PRECISION)
                 REPEATABLE ($2::DOUBLE PRECISION)
                 WHERE embeddings.{property} IS NULL
                   AND embeddings.{draft_id} IS NULL",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str(),
                draft_id = EntityEmbeddings::DraftId.name().as_str(),
            ),
            &[&pct as &(dyn ToSql + Sync), &seed as &(dyn ToSql + Sync)],
        )
        .await?;

    index_sample_table(client).await?;
    Ok(rows)
}

/// The raw big-endian payload of a `pgvector` value.
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

/// Streams the sampled embeddings to `output` in sample-index order.
///
/// Each embedding is truncated to the configured dimension, re-normalized to
/// unit length in the database, and converted from PostgreSQL's big-endian
/// wire format to native-endian bytes on the fly.
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
                   AND embedding.{draft_id} IS NULL
                 ORDER BY sample.sample_index",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str(),
                draft_id = EntityEmbeddings::DraftId.name().as_str(),
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
            if raw_embedding.0.len() != embedding.len() {
                return Err(SampleError::EmbeddingDimension {
                    expected: embedding.len() / size_of::<f32>(),
                    actual: raw_embedding.0.len() / size_of::<f32>(),
                });
            }

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

/// Exports the identity mapping as binary `COPY` data, ordered by sample
/// index.
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

/// Restores a previously exported identity mapping into the sampled-identity
/// table and returns the restored row count.
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

/// The hot cache path: recreates and repopulates the sampled-identity table
/// from a cached mapping file.
pub(super) async fn load_mapping(
    transaction: &Transaction<'_>,
    file: &mut fs::File,
) -> Result<u64, SampleError> {
    create_sample_table(transaction).await?;
    let rows = copy_mapping_in(transaction, file).await?;
    index_sample_table(transaction).await?;
    Ok(rows)
}

/// The cold cache path: draws a fresh sample and publishes both cache files.
///
/// The embedding matrix and the identity mapping are written to temporary
/// files in the output directory first and only persisted over the cache
/// destinations after both exports succeeded, so a failure part-way leaves
/// any previous cache intact.
pub(super) async fn write_sample(
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
