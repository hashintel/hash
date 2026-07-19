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

use super::{FitConfig, PolicyOptions, prepare::norm};
use crate::{
    math::{AffinityCurve, UnitFraction},
    salt::{
        knn::{hannoy::HannoyIndexOptions, recall},
        landmark::{
            layout::{LayoutOptions, LearningRate, RepulsionStrength},
            quotient::QuotientOptions,
            select::SelectionOptions,
        },
        lod::stage::LodConfig,
        policy::{CoincidentAdmission, PolicyOverride},
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

/// Serializes policy overrides as named records, validating each
/// distribution through [`Posterior::new`] on deserialize.
///
/// [`Posterior::new`]: crate::salt::policy::Posterior::new
mod policy_overrides {
    use serde::{Deserialize as _, Serialize as _, de::Error as _};

    use crate::{
        dataset::OntologyRowId,
        salt::policy::{GeometryClass, PolicyOverride, PolicySource, Posterior},
    };

    /// The precedence tier's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    #[serde(rename_all = "kebab-case")]
    enum SourceRecord {
        Human,
        Reviewed,
        Synthetic,
    }

    /// One override's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Record {
        relation: u64,
        source: SourceRecord,
        distribution: [f64; GeometryClass::COUNT],
    }

    #[expect(
        clippy::ptr_arg,
        reason = "serde's `with` contract passes the field type by reference"
    )]
    pub(super) fn serialize<S>(
        overrides: &Vec<PolicyOverride>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let records: Vec<Record> = overrides
            .iter()
            .map(|record| Record {
                relation: record.relation.get(),
                source: match record.source {
                    PolicySource::Human => SourceRecord::Human,
                    PolicySource::Reviewed => SourceRecord::Reviewed,
                    PolicySource::Synthetic => SourceRecord::Synthetic,
                },
                distribution: *record.distribution.as_array(),
            })
            .collect();
        records.serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<Vec<PolicyOverride>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Vec::<Record>::deserialize(deserializer)?
            .into_iter()
            .map(|record| {
                let distribution = Posterior::new(record.distribution).ok_or_else(|| {
                    D::Error::custom(format_args!(
                        "the override for relation row {} does not assert a probability \
                         distribution over the geometry classes",
                        record.relation,
                    ))
                })?;
                Ok(PolicyOverride {
                    relation: OntologyRowId::new(record.relation),
                    source: match record.source {
                        SourceRecord::Human => PolicySource::Human,
                        SourceRecord::Reviewed => PolicySource::Reviewed,
                        SourceRecord::Synthetic => PolicySource::Synthetic,
                    },
                    distribution,
                })
            })
            .collect()
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

/// serde shadow of [`LodConfig`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "LodConfig")]
struct LodConfigDef {
    span_log2: u8,
    max_tile_depth: u8,
}

/// serde shadow of [`CoincidentAdmission`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "CoincidentAdmission")]
struct CoincidentAdmissionDef {
    enforced: bool,
    #[serde(with = "unit_fraction")]
    class_probability_threshold: UnitFraction,
    #[serde(with = "unit_fraction")]
    applicability_threshold: UnitFraction,
}

/// serde shadow of [`PolicyOptions`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "PolicyOptions")]
struct PolicyOptionsDef {
    #[serde(with = "policy_overrides")]
    overrides: Vec<PolicyOverride>,
    #[serde(with = "CoincidentAdmissionDef")]
    admission: CoincidentAdmission,
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
    #[serde(with = "PolicyOptionsDef")]
    policy: PolicyOptions,
    #[serde(with = "LodConfigDef")]
    lod: LodConfig,
}
