use core::{error::Error, fmt, mem::size_of};

use tokio_postgres::types::{FromSql, Type};

use crate::salt::CANONICAL_DIMENSIONS;

/// Owned f32 values decoded directly from pgvector's binary wire format.
pub(super) struct CanonicalVector(pub Box<[f32]>);

impl<'value> FromSql<'value> for CanonicalVector {
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
            ref values @ ..,
        ] = raw
        else {
            return Err(Box::new(VectorDecodeError::Header));
        };
        let dimensions = usize::from(u16::from_be_bytes([dimension_high, dimension_low]));
        if dimensions != CANONICAL_DIMENSIONS
            || u16::from_be_bytes([unused_high, unused_low]) != 0
            || values.len() != dimensions * size_of::<f32>()
        {
            return Err(Box::new(VectorDecodeError::Shape {
                dimensions,
                bytes: values.len(),
            }));
        }
        let mut decoded = Vec::new();
        decoded
            .try_reserve_exact(dimensions)
            .map_err(|_error| VectorDecodeError::Allocation)?;
        decoded.extend(
            values
                .chunks_exact(size_of::<f32>())
                .map(|bytes| f32::from_be_bytes(bytes.try_into().expect("chunk width is four"))),
        );
        Ok(Self(decoded.into_boxed_slice()))
    }

    fn accepts(ty: &Type) -> bool {
        ty.name() == "vector"
    }
}

#[derive(Debug, Copy, Clone)]
enum VectorDecodeError {
    Header,
    Shape { dimensions: usize, bytes: usize },
    Allocation,
}

impl fmt::Display for VectorDecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header => formatter.write_str("pgvector header is truncated"),
            Self::Shape { dimensions, bytes } => write!(
                formatter,
                "expected a {CANONICAL_DIMENSIONS}-dimensional pgvector, got {dimensions} \
                 dimensions and {bytes} payload bytes"
            ),
            Self::Allocation => formatter.write_str("could not allocate pgvector decode buffer"),
        }
    }
}

impl Error for VectorDecodeError {}
