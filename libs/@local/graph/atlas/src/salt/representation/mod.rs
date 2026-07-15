//! Validated canonical embeddings and projector-prefix normalization.
//!
//! A canonical embedding is a finite vector `x` with 3,072 [`f32`]
//! components. The projector consumes only the first 512 components, normalized
//! as:
//!
//! ```text
//! norm = sqrt(sum(x[k]^2 for k in 0..512))
//! denominator = max(norm, 1e-12)
//! projector[k] = x[k] / denominator
//! ```
//!
//! The squared norm is accumulated in [`f64`] before the normalized prefix is
//! written as [`f32`]. This keeps small and high-magnitude finite inputs inside
//! the representable range while preserving the persisted projector width.
//! Normalization performs no allocation.
//!
//! # Numerical behavior
//!
//! Squared components are accumulated into fixed SIMD lanes and reduced in
//! ascending lane order. The transform therefore has one bit-level contract
//! across supported IEEE-754 targets.

mod artifact;
mod audit;

use core::{
    error::Error,
    fmt,
    simd::{f32x8, f64x8, num::SimdFloat as _},
};

pub(crate) use artifact::{PublishedRepresentations, publish_representations};
pub(crate) use audit::{
    AUDITED_PREFIX_DIMENSIONS, RepresentationAuditError, RepresentationAuditReport,
    prefix_corpus_hash,
};

use crate::salt::hash::{ContentHash, ContentHasher};

/// The stored embedding width.
pub(crate) const CANONICAL_DIMENSIONS: usize = 3_072;

/// The normalized prefix width consumed by the projector.
pub(crate) const PROJECTOR_DIMENSIONS: usize = 512;

/// The lower bound used when normalizing a projector prefix.
pub(crate) const NORMALIZATION_EPSILON: f64 = 1.0e-12;

/// Version of the canonical-to-projector transform.
pub(crate) const TRANSFORM_VERSION: &str = "matryoshka-prefix-v1";

/// Computes the immutable numerical contract for projector-prefix conversion.
#[must_use]
#[expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform transform identities require little-endian scalars"
)]
pub(crate) fn transform_contract_hash() -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-transform-contract.v1");
    hasher.update(TRANSFORM_VERSION.as_bytes());
    hasher.update(
        &u64::try_from(CANONICAL_DIMENSIONS)
            .expect("canonical dimensions should fit u64")
            .to_le_bytes(),
    );
    hasher.update(
        &u64::try_from(PROJECTOR_DIMENSIONS)
            .expect("projector dimensions should fit u64")
            .to_le_bytes(),
    );
    hasher.update(&NORMALIZATION_EPSILON.to_bits().to_le_bytes());
    hasher.finish()
}

/// Computes golden output identity for the compiled projector transform.
#[must_use]
#[expect(
    clippy::cast_precision_loss,
    clippy::little_endian_bytes,
    reason = "indexes are exactly represented and persistent identities use little-endian scalars"
)]
pub(crate) fn transform_golden_vectors_hash() -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-transform-golden.v1");
    for case in 0..3 {
        let mut canonical = [0.0_f32; CANONICAL_DIMENSIONS];
        match case {
            0 => {}
            1 => {
                canonical[0] = 3.0;
                canonical[1] = 4.0;
            }
            2 => {
                for (index, value) in canonical[..PROJECTOR_DIMENSIONS].iter_mut().enumerate() {
                    *value = (index as f32 - 255.5) / 256.0;
                }
            }
            _ => unreachable!("fixed golden-vector case should be in range"),
        }
        let mut projector = [0.0_f32; PROJECTOR_DIMENSIONS];
        let normalization = CanonicalEmbedding(&canonical).normalize_prefix(&mut projector);
        hasher.update(&normalization.norm.to_bits().to_le_bytes());
        hasher.update(&normalization.denominator.to_bits().to_le_bytes());
        for value in projector {
            hasher.update(&value.to_bits().to_le_bytes());
        }
    }
    hasher.finish()
}

/// Computes the canonical identity of a flat 3,072-dimensional corpus.
#[must_use]
pub(crate) fn canonical_corpus_hash(values: &[f32]) -> ContentHash {
    corpus_hash(
        b"hash.graph.atlas.salt.canonical-embedding-corpus.v2",
        CANONICAL_DIMENSIONS,
        values,
    )
}

/// Computes the canonical identity of a flat normalized-prefix corpus.
#[must_use]
pub(crate) fn projector_corpus_hash(values: &[f32]) -> ContentHash {
    corpus_hash(
        b"hash.graph.atlas.salt.projector-representation-corpus.v1",
        PROJECTOR_DIMENSIONS,
        values,
    )
}

#[expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform corpus identities require canonical little-endian scalars"
)]
fn corpus_hash(domain: &[u8], dimensions: usize, values: &[f32]) -> ContentHash {
    let mut hasher = ContentHasher::new(domain);
    hasher.update(
        &u64::try_from(dimensions)
            .expect("fixed representation dimensions should fit u64")
            .to_le_bytes(),
    );
    hasher.update(
        &u64::try_from(values.len())
            .expect("slice length should fit the persisted u64 frame")
            .to_le_bytes(),
    );
    for value in values {
        hasher.update(&value.to_bits().to_le_bytes());
    }
    hasher.finish()
}

/// A finite canonical embedding with the required width.
///
/// Construction validates the complete 3,072-component row, even though
/// [`Self::normalize_prefix`] reads only its first 512 components.
#[derive(Debug, Copy, Clone)]
pub(crate) struct CanonicalEmbedding<'embedding>(&'embedding [f32; CANONICAL_DIMENSIONS]);

impl<'embedding> CanonicalEmbedding<'embedding> {
    /// Validates and borrows one canonical embedding.
    ///
    /// # Errors
    ///
    /// This returns an error when `values` has the wrong width or contains a
    /// non-finite component.
    pub(crate) fn new(values: &'embedding [f32]) -> Result<Self, RepresentationError> {
        let values: &[f32; CANONICAL_DIMENSIONS] =
            values
                .try_into()
                .map_err(|_| RepresentationError::Dimensions {
                    expected: CANONICAL_DIMENSIONS,
                    actual: values.len(),
                })?;

        let (chunks, remainder) = values.as_chunks::<8>();
        debug_assert!(remainder.is_empty());
        for (chunk_index, chunk) in chunks.iter().enumerate() {
            if !f32x8::from_array(*chunk).is_finite().all() {
                let start = chunk_index * 8;
                let lane = chunk
                    .iter()
                    .position(|value| !value.is_finite())
                    .expect("should contain a non-finite lane after the SIMD check");
                return Err(RepresentationError::NonFinite {
                    index: start + lane,
                });
            }
        }

        Ok(Self(values))
    }

    /// Borrows all canonical components.
    #[must_use]
    #[inline]
    pub(crate) const fn as_array(self) -> &'embedding [f32; CANONICAL_DIMENSIONS] {
        self.0
    }

    /// Writes the normalized projector prefix into `output`.
    ///
    /// The norm is accumulated in [`f64`]. Every element of `output` is
    /// overwritten, including when the prefix norm is zero.
    ///
    /// # Complexity
    ///
    /// This runs in `O(512)` time and uses constant additional space. It does
    /// not allocate.
    #[must_use]
    pub(crate) fn normalize_prefix(
        self,
        output: &mut [f32; PROJECTOR_DIMENSIONS],
    ) -> PrefixNormalization {
        let (input, remainder) = self.0[..PROJECTOR_DIMENSIONS].as_chunks::<8>();
        debug_assert!(remainder.is_empty());
        let (output, remainder) = output.as_chunks_mut::<8>();
        debug_assert!(remainder.is_empty());
        debug_assert_eq!(input.len(), output.len());

        let mut sum0 = f64x8::splat(0.0);
        let mut sum1 = f64x8::splat(0.0);
        let mut sum2 = f64x8::splat(0.0);
        let mut sum3 = f64x8::splat(0.0);

        let mut index = 0;
        while index + 4 <= input.len() {
            let [input0, input1, input2, input3] = [
                f32x8::from_array(input[index]),
                f32x8::from_array(input[index + 1]),
                f32x8::from_array(input[index + 2]),
                f32x8::from_array(input[index + 3]),
            ];

            output[index] = input0.to_array();
            output[index + 1] = input1.to_array();
            output[index + 2] = input2.to_array();
            output[index + 3] = input3.to_array();

            let [wide0, wide1, wide2, wide3]: [f64x8; 4] =
                [input0.cast(), input1.cast(), input2.cast(), input3.cast()];
            sum0 += wide0 * wide0;
            sum1 += wide1 * wide1;
            sum2 += wide2 * wide2;
            sum3 += wide3 * wide3;
            index += 4;
        }
        debug_assert_eq!(index, input.len());

        let squared_norm = (sum0 + sum1 + sum2 + sum3)
            .to_array()
            .into_iter()
            .fold(0.0, |sum, lane| sum + lane);
        let norm = squared_norm.sqrt();
        let denominator = norm.max(NORMALIZATION_EPSILON);
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the normalized projector representation is persisted as f32"
        )]
        let inverse = f32x8::splat((1.0 / denominator) as f32);
        for chunk in output {
            *chunk = (f32x8::from_array(*chunk) * inverse).to_array();
        }

        PrefixNormalization { norm, denominator }
    }
}

/// An owned finite canonical embedding.
///
/// Construction reuses the input vector allocation when its length and values
/// are valid. Borrowing the validated row does not rescan its components.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct OwnedCanonicalEmbedding(Box<[f32; CANONICAL_DIMENSIONS]>);

impl OwnedCanonicalEmbedding {
    /// Validates and takes ownership of one canonical embedding.
    ///
    /// # Errors
    ///
    /// This returns an error when `values` has the wrong width or contains a
    /// non-finite component.
    pub(crate) fn from_vec(values: Vec<f32>) -> Result<Self, RepresentationError> {
        CanonicalEmbedding::new(&values)?;
        let values = values
            .into_boxed_slice()
            .try_into()
            .expect("validated canonical embedding should have the required width");
        Ok(Self(values))
    }

    /// Borrows the validated row.
    #[must_use]
    #[inline]
    pub(crate) fn as_borrowed(&self) -> CanonicalEmbedding<'_> {
        CanonicalEmbedding(&self.0)
    }

    /// Borrows the backing array.
    #[must_use]
    #[inline]
    pub(crate) fn as_array(&self) -> &[f32; CANONICAL_DIMENSIONS] {
        &self.0
    }
}

/// Diagnostics from projector-prefix normalization.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PrefixNormalization {
    /// The unbounded `f64` norm of the canonical prefix.
    pub norm: f64,
    /// The denominator after applying [`NORMALIZATION_EPSILON`].
    pub denominator: f64,
}

/// An invalid canonical embedding.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RepresentationError {
    /// The embedding width differs from [`CANONICAL_DIMENSIONS`].
    Dimensions { expected: usize, actual: usize },
    /// A component is NaN or infinite.
    NonFinite { index: usize },
}

impl fmt::Display for RepresentationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dimensions { expected, actual } => write!(
                formatter,
                "canonical embedding contains {actual} components; expected {expected}"
            ),
            Self::NonFinite { index } => write!(
                formatter,
                "canonical embedding component {index} is not finite"
            ),
        }
    }
}

impl Error for RepresentationError {}

#[cfg(test)]
mod tests;
