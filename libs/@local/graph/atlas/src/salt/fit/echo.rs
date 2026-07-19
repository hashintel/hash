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

use super::{FitConfig, PlacementOptions, PolicyOptions, prepare::norm};
use crate::{
    math::{AffinityCurve, UnitFraction},
    salt::{
        importance::RankingConfig,
        knn::{hannoy::HannoyIndexOptions, recall},
        landmark::{
            layout::{LayoutOptions, LearningRate, RepulsionStrength},
            quotient::QuotientOptions,
            select::SelectionOptions,
        },
        lod::stage::LodConfig,
        policy::{CoincidentAdmission, PolicyOverride},
        relation::attraction::AttractionOptions,
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

/// Serializes [`AttractionOptions`] as its two named settings,
/// validating through [`AttractionOptions::new`] on deserialize.
mod attraction_options {
    use serde::{Deserialize as _, Serialize as _, de::Error as _};

    use crate::salt::relation::attraction::AttractionOptions;

    /// The settings' wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Record {
        coincident_coefficient: f32,
        pruning_threshold: f32,
    }

    #[expect(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde's `with` contract passes the field by reference"
    )]
    pub(super) fn serialize<S>(
        options: &AttractionOptions,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Record {
            coincident_coefficient: options.coincident_coefficient(),
            pruning_threshold: options.pruning_threshold(),
        }
        .serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<AttractionOptions, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let Record {
            coincident_coefficient,
            pruning_threshold,
        } = Record::deserialize(deserializer)?;
        AttractionOptions::new(coincident_coefficient, pruning_threshold).ok_or_else(|| {
            D::Error::custom(format_args!(
                "the settings kappa_C = {coincident_coefficient}, eta_F = {pruning_threshold} are \
                 not both finite and non-negative"
            ))
        })
    }
}

/// Serializes [`PlacementOptions`] as a tagged record, validating
/// every projector setting through its constructor on deserialize.
mod placement {
    use core::num::NonZero;

    use serde::{Deserialize as _, Serialize as _};

    use super::super::{LandmarkSupport, PlacementOptions, ProjectorOptions};
    use crate::salt::{
        ladder::{Conditions, LadderOptions, MeasurementOptions},
        projector::{
            budget::BudgetOptions,
            loss::{CoincidentEnergy, SupportOptions},
            miner::MinerOptions,
            model::Architecture,
            train::{BatchPlan, Coefficients, RelationLens, TrainingSchedule},
        },
        relation::protection::{ChannelConfig, ProtectionConfig},
    };

    /// The placement's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    #[serde(rename_all = "kebab-case")]
    enum Record {
        LandmarkBaseline,
        Projector(Box<ProjectorRecord>),
    }

    /// The projector settings' wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct ProjectorRecord {
        architecture: ArchitectureRecord,
        schedule: ScheduleRecord,
        plan: PlanRecord,
        affinity_offset: f32,
        support: [f32; 2],
        budget: [f32; 4],
        coefficients: [f32; 6],
        miner: MinerRecord,
        lens: LensRecord,
        protection: ProtectionRecord,
        landmark_weight: f32,
        forward_rows: NonZero<usize>,
        ladder: LadderRecord,
    }

    /// The model shape's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct ArchitectureRecord {
        width: NonZero<usize>,
        residual_blocks: NonZero<usize>,
        representation_dimensions: NonZero<usize>,
        role_dimensions: NonZero<usize>,
        condition_dimensions: NonZero<usize>,
    }

    /// The step schedule's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct ScheduleRecord {
        steps: NonZero<usize>,
        boundary: usize,
        refresh_interval: NonZero<usize>,
        initial_learning_rate: f64,
        minimum_learning_rate: f64,
    }

    /// The sampling plan's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct PlanRecord {
        semantic_pairs: NonZero<usize>,
        ordinary_pairs: usize,
        relation_types: usize,
        relation_cap: NonZero<usize>,
        hard_queries: usize,
        landmark_anchors: usize,
        temporal_anchors: usize,
    }

    /// The mining schedule's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct MinerRecord {
        neighbours: NonZero<usize>,
        search_margin: NonZero<usize>,
        maximum_weight: f32,
        rank_exponent: f32,
    }

    /// The relation lens's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct LensRecord {
        coincident_radius: f32,
        coincident_threshold: f32,
        temperature: f32,
        epsilon: f32,
        asserted_radius: Option<f32>,
    }

    /// The protection thresholds' wire form; each channel is
    /// `[floor, threshold]`.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct ProtectionRecord {
        hard: [f32; 2],
        ordinary: [f32; 2],
        protect_ordinary: bool,
    }

    /// The condition ladder's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct LadderRecord {
        conditions: Vec<f32>,
        distinguishability_floor: f64,
        monotonicity_tolerance: f64,
        canonical: f32,
    }

    pub(super) fn serialize<S>(
        placement: &PlacementOptions,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let record = match placement {
            PlacementOptions::LandmarkBaseline => Record::LandmarkBaseline,
            PlacementOptions::Projector(options) => Record::Projector(Box::new(ProjectorRecord {
                architecture: ArchitectureRecord {
                    width: options.architecture.width,
                    residual_blocks: options.architecture.residual_blocks,
                    representation_dimensions: options.architecture.representation_dimensions,
                    role_dimensions: options.architecture.role_dimensions,
                    condition_dimensions: options.architecture.condition_dimensions,
                },
                schedule: ScheduleRecord {
                    steps: options.schedule.steps(),
                    boundary: options.schedule.boundary(),
                    refresh_interval: options.schedule.refresh_interval(),
                    initial_learning_rate: options.schedule.initial_learning_rate(),
                    minimum_learning_rate: options.schedule.minimum_learning_rate(),
                },
                plan: PlanRecord {
                    semantic_pairs: options.plan.semantic_pairs,
                    ordinary_pairs: options.plan.ordinary_pairs,
                    relation_types: options.plan.relation_types,
                    relation_cap: options.plan.relation_cap,
                    hard_queries: options.plan.hard_queries,
                    landmark_anchors: options.plan.landmark_anchors,
                    temporal_anchors: options.plan.temporal_anchors,
                },
                affinity_offset: options.affinity_offset,
                support: [options.support.threshold(), options.support.epsilon()],
                budget: [
                    options.budget.positive(),
                    options.budget.total(),
                    options.budget.floor(),
                    options.budget.epsilon(),
                ],
                coefficients: [
                    options.coefficients.semantic(),
                    options.coefficients.ordinary(),
                    options.coefficients.hard(),
                    options.coefficients.relation(),
                    options.coefficients.anchor(),
                    options.coefficients.landmark(),
                ],
                miner: MinerRecord {
                    neighbours: options.miner.neighbours(),
                    search_margin: options.miner.search_margin(),
                    maximum_weight: options.miner.maximum_weight(),
                    rank_exponent: options.miner.rank_exponent(),
                },
                lens: LensRecord {
                    coincident_radius: options.lens.coincident().radius(),
                    coincident_threshold: options.lens.coincident().threshold(),
                    temperature: options.lens.temperature(),
                    epsilon: options.lens.epsilon(),
                    asserted_radius: options.lens.asserted_radius(),
                },
                protection: ProtectionRecord {
                    hard: [
                        options.protection.hard().floor(),
                        options.protection.hard().threshold(),
                    ],
                    ordinary: [
                        options.protection.ordinary().floor(),
                        options.protection.ordinary().threshold(),
                    ],
                    protect_ordinary: options.protection.protect_ordinary(),
                },
                landmark_weight: options.landmark_support.weight(),
                forward_rows: options.forward_rows,
                ladder: LadderRecord {
                    conditions: options.ladder.conditions.values().to_vec(),
                    distinguishability_floor: options.ladder.measurement.distinguishability_floor,
                    monotonicity_tolerance: options.ladder.measurement.monotonicity_tolerance,
                    canonical: options.ladder.canonical,
                },
            })),
        };
        record.serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<PlacementOptions, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match Record::deserialize(deserializer)? {
            Record::LandmarkBaseline => Ok(PlacementOptions::LandmarkBaseline),
            Record::Projector(record) => Ok(PlacementOptions::Projector(record.into_options()?)),
        }
    }

    impl ProjectorRecord {
        /// Validates the wire fields into the real options, field by
        /// field through the constructors.
        fn into_options<E: serde::de::Error>(self) -> Result<ProjectorOptions, E> {
            let record = self;
            let schedule = TrainingSchedule::new(
                record.schedule.steps,
                record.schedule.boundary,
                record.schedule.refresh_interval,
                record.schedule.initial_learning_rate,
                record.schedule.minimum_learning_rate,
            )
            .ok_or_else(|| E::custom("the schedule fields do not form a training schedule"))?;

            if !(record.affinity_offset.is_finite() && record.affinity_offset > 0.0) {
                return Err(E::custom(format_args!(
                    "the affinity offset {} is not finite and strictly positive",
                    record.affinity_offset
                )));
            }

            let [threshold, epsilon] = record.support;
            let support = SupportOptions::new(threshold, epsilon).ok_or_else(|| {
                E::custom("the support constants are not finite and strictly positive")
            })?;

            let [positive, total, floor, epsilon] = record.budget;
            let budget = BudgetOptions::new(positive, total, floor, epsilon)
                .ok_or_else(|| E::custom("the budget fields do not form a gradient budget"))?;

            let [semantic, ordinary, hard, relation, anchor, landmark] = record.coefficients;
            let coefficients =
                Coefficients::new(semantic, ordinary, hard, relation, anchor, landmark)
                    .ok_or_else(|| {
                        E::custom("the coefficients are not finite, non-negative, and semantic-led")
                    })?;

            let miner = MinerOptions::new(
                record.miner.neighbours,
                record.miner.search_margin,
                record.miner.maximum_weight,
                record.miner.rank_exponent,
            )
            .ok_or_else(|| E::custom("the miner fields do not form a mining schedule"))?;

            let lens = record.lens.into_lens()?;
            let protection = record.protection.into_config()?;

            let landmark_support =
                LandmarkSupport::new(record.landmark_weight).ok_or_else(|| {
                    E::custom("the landmark support weight is not finite and strictly positive")
                })?;

            let conditions = Conditions::new(record.ladder.conditions)
                .map_err(|error| E::custom(format_args!("invalid condition schedule: {error}")))?;

            Ok(ProjectorOptions {
                architecture: Architecture {
                    width: record.architecture.width,
                    residual_blocks: record.architecture.residual_blocks,
                    representation_dimensions: record.architecture.representation_dimensions,
                    role_dimensions: record.architecture.role_dimensions,
                    condition_dimensions: record.architecture.condition_dimensions,
                },
                schedule,
                plan: BatchPlan {
                    semantic_pairs: record.plan.semantic_pairs,
                    ordinary_pairs: record.plan.ordinary_pairs,
                    relation_types: record.plan.relation_types,
                    relation_cap: record.plan.relation_cap,
                    hard_queries: record.plan.hard_queries,
                    landmark_anchors: record.plan.landmark_anchors,
                    temporal_anchors: record.plan.temporal_anchors,
                },
                affinity_offset: record.affinity_offset,
                support,
                budget,
                coefficients,
                miner,
                lens,
                protection,
                landmark_support,
                forward_rows: record.forward_rows,
                ladder: LadderOptions {
                    conditions,
                    measurement: MeasurementOptions {
                        distinguishability_floor: record.ladder.distinguishability_floor,
                        monotonicity_tolerance: record.ladder.monotonicity_tolerance,
                    },
                    canonical: record.ladder.canonical,
                },
            })
        }
    }

    impl LensRecord {
        /// Validates the wire fields into the relation lens.
        fn into_lens<E: serde::de::Error>(self) -> Result<RelationLens, E> {
            let coincident =
                CoincidentEnergy::new(self.coincident_radius, self.coincident_threshold)
                    .ok_or_else(|| E::custom("the lens fields do not form a Coincident energy"))?;
            RelationLens::new(
                coincident,
                self.temperature,
                self.epsilon,
                self.asserted_radius,
            )
            .ok_or_else(|| E::custom("the lens fields do not form a relation lens"))
        }
    }

    impl ProtectionRecord {
        /// Validates the wire fields into the protection configuration.
        fn into_config<E: serde::de::Error>(self) -> Result<ProtectionConfig, E> {
            let channel = |[floor, threshold]: [f32; 2], name| {
                ChannelConfig::new(floor, threshold).ok_or_else(|| {
                    E::custom(format_args!(
                        "the {name} channel fields do not form a protection channel"
                    ))
                })
            };
            ProtectionConfig::new(
                channel(self.hard, "hard")?,
                channel(self.ordinary, "ordinary")?,
                self.protect_ordinary,
            )
            .ok_or_else(|| E::custom("the channels violate the protection ordering constraints"))
        }
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
    margin: f64,
    confidence: f64,
    pilot: NonZero<usize>,
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

/// serde shadow of [`RankingConfig`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "RankingConfig")]
#[serde(rename_all = "kebab-case")]
enum RankingConfigDef {
    ConstantColumns,
    IncidentDegree,
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
    #[serde(with = "attraction_options")]
    attraction: AttractionOptions,
    #[serde(with = "placement")]
    placement: PlacementOptions,
    #[serde(with = "RankingConfigDef")]
    ranking: RankingConfig,
    #[serde(with = "LodConfigDef")]
    lod: LodConfig,
}
