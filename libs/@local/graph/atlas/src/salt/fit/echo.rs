//! The serialized form of one fit's configuration.
//!
//! The metadata document echoes the whole [`FitConfig`], so a replay
//! takes every setting from the published record instead of the
//! defaults compiled into the replaying binary. `serde_derive` does
//! not parse default field values, so the options structs cannot carry
//! their own derives; each has a field-for-field shadow here (the
//! [serde remote pattern]). Deserialization constructs the real struct
//! field by field: an option field added to a stage fails compilation
//! here until the echo carries it.
//!
//! Validated fields ([`UnitFraction`], [`LearningRate`],
//! [`RepulsionStrength`], [`AffinityCurve`], the `NonZero` counts)
//! deserialize through their validating constructors, so a document
//! whose echo violates a construction invariant refuses to parse. The
//! `math` types serialize through the with-modules here rather than
//! own impls: `math` is serialization-free, and how a curve or a
//! fraction appears in a document is the document's concern.
//!
//! [serde remote pattern]: https://serde.rs/remote-derive.html

use core::num::NonZero;

use super::{FitConfig, prepare::norm};
use crate::{
    math::{AffinityCurve, UnitFraction},
    salt::{
        knn::{hannoy::HannoyIndexOptions, recall},
        landmark::{
            layout::{LayoutOptions, LearningRate, RepulsionStrength},
            quotient::QuotientOptions,
            select::SelectionOptions,
        },
        semantic::SmoothingOptions,
    },
};

/// Serializes a [`UnitFraction`] as its plain fraction, validating
/// through [`UnitFraction::new`] on deserialize.
mod unit_fraction {
    use serde::{Deserialize as _, de::Error as _};

    use crate::math::UnitFraction;

    #[expect(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde's `with` contract passes the field by reference"
    )]
    pub(super) fn serialize<S>(fraction: &UnitFraction, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_f64(fraction.get())
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<UnitFraction, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = f64::deserialize(deserializer)?;
        UnitFraction::new(value).ok_or_else(|| {
            D::Error::custom(format_args!(
                "the value {value} is not a finite fraction in [0, 1]"
            ))
        })
    }
}

/// Serializes an [`AffinityCurve`] as its two named parameters,
/// validating through [`AffinityCurve::new`] on deserialize.
mod affinity_curve {
    #![expect(
        clippy::min_ident_chars,
        reason = "`a` and `b` are the canonical names of the UMAP curve parameters and the \
                  document's field names"
    )]

    use serde::{Deserialize as _, Serialize as _, de::Error as _};

    use crate::math::AffinityCurve;

    /// The curve's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Record {
        a: f32,
        b: f32,
    }

    #[expect(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde's `with` contract passes the field by reference"
    )]
    pub(super) fn serialize<S>(curve: &AffinityCurve, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Record {
            a: curve.a(),
            b: curve.b(),
        }
        .serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<AffinityCurve, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let Record { a, b } = Record::deserialize(deserializer)?;
        AffinityCurve::new(a, b).ok_or_else(|| {
            D::Error::custom(format_args!(
                "the parameters a = {a}, b = {b} do not form an affinity curve; both must be \
                 finite and strictly positive"
            ))
        })
    }
}

/// serde shadow of [`SelectionOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "SelectionOptions")]
struct SelectionOptionsDef {
    maximum_count: NonZero<u32>,
    #[serde(with = "unit_fraction")]
    retained_fraction: UnitFraction,
}

/// serde shadow of [`norm::SpotCheckOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "norm::SpotCheckOptions")]
struct NormCheckOptionsDef {
    tolerance: f64,
    defect_rate: f64,
    confidence: f64,
}

/// serde shadow of [`HannoyIndexOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "HannoyIndexOptions")]
struct HannoyIndexOptionsDef {
    map_size: usize,
    ef_construction: usize,
    ef_search: usize,
}

/// serde shadow of [`recall::SpotCheckOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "recall::SpotCheckOptions")]
struct RecallCheckOptionsDef {
    neighbours: NonZero<usize>,
    minimum_recall: f64,
    defect_rate: f64,
    confidence: f64,
}

/// serde shadow of [`SmoothingOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "SmoothingOptions")]
struct SmoothingOptionsDef {
    tolerance: f64,
    bandwidth_floor: f32,
    bisection_iterations: usize,
}

/// serde shadow of [`QuotientOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "QuotientOptions")]
struct QuotientOptionsDef {
    maximum_neighbours: NonZero<usize>,
}

/// serde shadow of [`LayoutOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "LayoutOptions")]
struct LayoutOptionsDef {
    epochs: NonZero<u32>,
    initial_learning_rate: LearningRate,
    repulsion_strength: RepulsionStrength,
    negative_sample_rate: NonZero<u32>,
}

/// serde shadow of [`FitConfig`]: the metadata document's echo of every
/// setting one fit ran under.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "FitConfig")]
pub(crate) struct FitConfigDef {
    seed: u64,
    #[serde(with = "SelectionOptionsDef")]
    selection: SelectionOptions,
    #[serde(with = "affinity_curve")]
    curve: AffinityCurve,
    #[serde(with = "NormCheckOptionsDef")]
    norm_check: norm::SpotCheckOptions,
    neighbours: NonZero<usize>,
    #[serde(with = "HannoyIndexOptionsDef")]
    index: HannoyIndexOptions,
    #[serde(with = "RecallCheckOptionsDef")]
    recall_check: recall::SpotCheckOptions,
    #[serde(with = "SmoothingOptionsDef")]
    smoothing: SmoothingOptions,
    #[serde(with = "QuotientOptionsDef")]
    quotient: QuotientOptions,
    #[serde(with = "LayoutOptionsDef")]
    layout: LayoutOptions,
}
