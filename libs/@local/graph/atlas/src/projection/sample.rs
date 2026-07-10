use core::{error::Error, fmt, pin::pin};
use std::io;

use futures::{SinkExt as _, TryStreamExt as _, future::join, sink};
use hash_graph_embeddings::{D512, Dimension};
use hash_graph_postgres_store::store::postgres::query::{
    Table,
    table::{DatabaseColumn as _, EntityEmbeddings},
};
use tokio::io::{AsyncWrite, AsyncWriteExt as _};
use tokio_postgres::{
    Client, Row,
    types::{FromSql, ToSql, Type},
};
use type_system::{knowledge::entity::id::EntityUuid, principal::actor_group::WebId};
use uuid::Uuid;

#[derive(Debug)]
enum SampleError {
    Io(io::Error),
    Postgres(tokio_postgres::Error),
}

impl fmt::Display for SampleError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("failed to write sampled data"),
            Self::Postgres(_) => fmt.write_str("failed to query sampled data"),
        }
    }
}

impl Error for SampleError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
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

async fn query_count(client: impl AsRef<Client>) -> Result<i64, SampleError> {
    let client = client.as_ref();

    let count = client
        .query_one_scalar::<i64, _>(
            &format!(
                "SELECT COUNT(*)
                 FROM {entity_embeddings}
                 WHERE {property} IS NOT NULL",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str()
            ),
            &[],
        )
        .await?;

    Ok(count)
}

struct RawEmbedding(Vec<u8>);
impl<'v> FromSql<'v> for RawEmbedding {
    #[expect(
        clippy::big_endian_bytes,
        clippy::host_endian_bytes,
        reason = "Postgres always returns big endian"
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

        // f32 is in big-endian, but we consume it in native endian. Therefore we must first detect
        // our native endianess.
        let mut floats = rest[..(size_of::<f32>() * dim)].to_vec();
        let (floats_mut, tail) = floats.as_chunks_mut::<4>();
        debug_assert!(tail.is_empty());

        for float in floats_mut {
            *float = f32::from_be_bytes(*float).to_ne_bytes();
        }

        Ok(Self(floats))
    }

    fn accepts(ty: &Type) -> bool {
        ty.name() == "vector"
    }
}

async fn query_embeddings<W1, W2>(
    client: impl AsRef<Client>,
    seed: u64,
    total_rows: i64,
    options: SampleOptions,
    embeddings_output: W1,
    metadata_output: W2,
) -> Result<(), SampleError>
where
    W1: AsyncWrite,
    W2: AsyncWrite,
{
    let client = client.as_ref();
    let pct = f64::min(
        100.0,
        (options.size as f64) / f64::max(total_rows as f64, 1.0),
    );

    let stream = client
        .query_raw(
            &format!(
                "SELECT
                     e.web_id,
                     e.entity_uuid,
                     l2_normalize(
                         subvector(e.embedding, 1, {dim})
                     )::vector({dim}) AS embedding
                 FROM {entity_embeddings} e
                 TABLESAMPLE BERNOULLI($1) REPEATABLE ($2)
                 WHERE e.{property} IS NOT NULL",
                entity_embeddings = Table::EntityEmbeddings.as_str(),
                property = EntityEmbeddings::Property.name().as_str(),
                dim = options.dim,
            ),
            [
                (&pct as &(dyn ToSql + Sync)),
                (&(seed as i64) as &(dyn ToSql + Sync)),
            ],
        )
        .await?;

    let metadata_writer = core::pin::pin!(metadata_output);
    let embeddings_writer = core::pin::pin!(embeddings_output);

    let sink = sink::unfold(
        (metadata_writer, embeddings_writer),
        async move |(mut metadata_writer, mut embeddings_writer), row: Row| {
            let web_id: WebId = row.get(0);
            let entity_uuid: EntityUuid = row.get(1);
            let embedding: RawEmbedding = row.get(2);

            let mut buffer = [0_u8; 32];
            buffer[..16].copy_from_slice(Uuid::from(web_id).as_bytes());
            buffer[16..].copy_from_slice(Uuid::from(entity_uuid).as_bytes());

            let (metadata_result, embeddings_result) = join(
                metadata_writer.write_all(&buffer),
                embeddings_writer.write_all(&embedding.0),
            )
            .await;

            metadata_result?;
            embeddings_result?;

            Ok::<_, SampleError>((metadata_writer, embeddings_writer))
        },
    );

    let mut stream = pin!(stream.map_err(SampleError::from));
    let mut sink = pin!(sink);

    sink.send_all(&mut stream).await?;
    sink.close().await?;

    Ok(())
}
