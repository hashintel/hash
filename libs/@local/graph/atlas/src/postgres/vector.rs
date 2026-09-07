//! The projector-prefix expression and the wire-format decoder for pgvector values.
//!
//! Everything that touches pgvector's own types lives here, on both sides of the wire.
//! [`normalized_prefix`] is the statement-side expression preparing an embedding as projector
//! input, so every lookup shares one definition and an answer is bit-identical to the
//! representation row a fit reads. [`PgVector`] decodes the answers: the binary wire format,
//! read into fixed-dimension vectors.

use core::{error::Error, fmt};

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Expression, Function, PostgresType, table::EntityEmbeddings,
};
use tokio_postgres::types::{FromSql, Type};

use crate::{dataset::PROJECTOR_DIMENSIONS, math::BoxedVecN};

/// Builds the unit-norm projector prefix of an embedding column.
///
/// The store does the geometry's data preparation: `subvector` truncates the embedding to the
/// projector's prefix and `l2_normalize` renormalizes it inside the statement, so the connection
/// carries unit-norm prefixes and nothing wider.
///
/// # SQL
///
/// ```sql
/// l2_normalize(subvector(embedding.embedding, 1, <prefix>))::vector(<prefix>)
/// ```
pub(crate) fn normalized_prefix(embedding: Aliased<EntityEmbeddings>) -> Expression {
    Expression::from(Function::L2Normalize(Box::new(
        Function::Subvector {
            vector: Box::new(embedding.column(&EntityEmbeddings::Embedding)),
            start: 1,
            count: PROJECTOR_DIMENSIONS,
        }
        .into(),
    )))
    .cast(PostgresType::Vector {
        dimensions: Some(PROJECTOR_DIMENSIONS),
    })
}

/// A pgvector payload that does not decode as the expected vector.
#[derive(Debug, Copy, Clone)]
pub(crate) enum VectorDecodeError {
    /// The four-byte header is truncated.
    Header,
    /// The header's dimensions or the payload length disagree with the expected shape.
    Shape {
        /// The compile-time component count.
        expected: usize,
        /// The component count the header declares.
        dimensions: usize,
        /// The payload length in bytes.
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

/// An `N`-component pgvector value decoded from the binary wire format.
pub(crate) struct PgVector<const N: usize>(pub BoxedVecN<N>);

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
