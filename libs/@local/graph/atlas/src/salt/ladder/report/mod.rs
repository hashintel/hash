//! The relation-effect report over one published generation's condition ladder.
//!
//! The ladder's evidence records how far each rung moved and what the frozen relation loss read,
//! both in the trainer's own vocabulary of RMS movement after alignment and loss in local-scale
//! units. Neither states the product's named claim - that the relation lens ends related entities
//! closer on the published map. This report reads that claim in the map's own units. For every
//! force-bearing relation instance it takes the distance between its endpoints at the
//! zero-condition rung against the same distance at every other rung, aggregated with the
//! trainer's own engagement mass. The bridge between the two vocabularies is the point of the
//! bundle: the manifest's loss column rides beside the measured contraction so a reader can see
//! where they disagree.
//!
//! # What the report reads
//!
//! Everything comes from the published generation directory; the report dials no store and mutates
//! nothing. The trained checkpoint projects the representation matrix at every rung condition of
//! the recorded schedule (rows project independently, so this reproduces the fit's own frames),
//! each raw frame maps into the baseline frame through its recorded manifest alignment, and the
//! attraction index supplies the engaged pairs with their weights. Frames are rebuilt rather than
//! read because the fit persists them only as scratch. The checkpoint, the schedule, and the
//! alignments together determine them exactly.
//!
//! # The certificate
//!
//! Before the report takes any reading, the canonical rung's rebuilt aligned frame must reproduce
//! the published coordinate column within [`CERTIFICATE_TOLERANCE`] world units per component. A
//! report whose forward pass does not reproduce the published bytes would describe a lookalike,
//! so failure panics instead of reporting. The tolerance derives from measurement. Independent
//! full-corpus reproductions of two prior generations reached a maximum component error near
//! `1e-4`, and the bound stands one order above that floor. The bundle carries the measured
//! residual, so drift toward the bound is visible long before it fails.
//!
//! # Bases, stated
//!
//! - Distances are Euclidean world units in the baseline frame after each rung's own manifest
//!   alignment. The alignment quotients the global similarity freedom the projector never promises
//!   to pin down, exactly as the ladder's published movement evidence does; a uniform rescale of a
//!   whole frame is therefore not read as contraction.
//! - The engagement mass of an instance is the trainer's own loss factor, computed identically:
//!   `confidence * degree_normalization * strength`. Mass-weighted and unweighted aggregates ride
//!   together, and every group row carries its channel weights, so no single convention hides the
//!   other.
//! - Populations are exact. Every retained instance and every corpus row enters, with no sampling
//!   anywhere. Byte-identical duplicate rows project identically and enter with their multiplicity,
//!   the same convention the trainer's loss uses. Confidence machinery over these point readings is
//!   a later concern. Nothing here is an estimate.
//! - The contracted fraction counts instances whose endpoint distance strictly shrank against the
//!   baseline; ties - including coincident duplicates at distance zero on both rungs - do not
//!   count.

#[cfg(test)]
mod tests;

use core::num::NonZero;
use std::fs::File;

use burn::tensor::backend::Backend;
use hashql_core::id::{Id as _, IdSlice};

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::ArrayFile,
        attraction::read::AttractionFile,
        generation::{GenerationId, GenerationRoot},
        salt::{SaltRepository, metadata::LadderEvidence},
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{
        AlignedVecN, DFinite, DNonNegative, DPositive, NonNegative, UnitFraction, Vec2, d_positive,
    },
    salt::{
        fit::{PlacementInner, PlacementOptions, ProjectorOptions, placement_device},
        projector::{
            artifact,
            model::{NodeRole, Projector},
            train::{batch::NodeColumns, refresh},
        },
        relation::artifact::AttractionArchive,
    },
};

/// The certificate bound on the canonical rung's reproduction, world units per component.
///
/// One order above the measured reproduction floor: independent full-corpus rebuilds of two prior
/// generations reached maximum component errors of `7.6e-5` and `1.03e-4` against their published
/// coordinate columns.
pub(crate) const CERTIFICATE_TOLERANCE: DPositive = d_positive!(1e-3);

/// The relation-effect report of one published generation's condition ladder.
///
/// Compiled by [`compile`](Self::compile) and serialized as the report bundle.
#[derive(Debug, serde::Serialize)]
pub(crate) struct LadderReport {
    /// The reported generation's hex identity.
    pub generation: GenerationId,
    /// Corpus rows, the shared row domain of every frame.
    pub rows: usize,
    /// Force-bearing relation instances over all groups.
    pub edges: usize,
    /// Relation groups in the attraction index.
    pub groups: usize,
    /// Rows that are an endpoint of at least one retained instance.
    pub participants: usize,
    /// The published rung's schedule index.
    pub canonical_index: usize,
    /// The published rung's condition.
    pub canonical_condition: NonNegative,
    /// The schedule index with the largest mass-weighted mean contraction.
    ///
    /// Ties keep the first. Index `0` states that no rung contracts the engaged pairs against the
    /// baseline at all.
    pub contraction_argmax_index: usize,
    /// Whether the published rung is the contraction argmax.
    pub canonical_is_argmax: bool,
    /// The canonical rung's reproduction residual against the published coordinate column.
    pub certificate: Certificate,
    /// One reading per rung, in schedule order. The baseline rung is the all-zero row.
    pub rungs: Vec<RungReading>,
}

/// The reproduction residual of the rebuilt canonical frame against the published column.
#[derive(Debug, serde::Serialize)]
pub(crate) struct Certificate {
    /// The acceptance bound, world units per component.
    pub tolerance: DPositive,
    /// Largest absolute component error.
    pub max_absolute_error: DNonNegative,
    /// Mean absolute component error.
    pub mean_absolute_error: DNonNegative,
    /// Largest Euclidean point error.
    pub max_point_distance: DNonNegative,
}

/// One rung's manifest evidence beside its measured relation effect.
#[derive(Debug, serde::Serialize)]
pub(crate) struct RungReading {
    /// The rung's condition value.
    pub condition: NonNegative,
    /// The manifest's frozen relation loss at projection time, local-scale units.
    pub relation_loss: DNonNegative,
    /// The manifest's RMS movement against the baseline field after alignment.
    pub baseline_movement: DNonNegative,
    /// The measured contraction of engaged pairs against the baseline rung, over all groups.
    pub contraction: ContractionReading,
    /// Per-group contraction, ascending by relation row.
    pub group_contractions: Vec<GroupReading>,
    /// Point displacement against the baseline rung over participant rows.
    pub participant_displacement: DisplacementReading,
    /// Point displacement against the baseline rung over non-participant rows.
    ///
    /// A rung that buys contraction by disturbing rows the relation term never touches shows it
    /// here.
    pub non_participant_displacement: DisplacementReading,
}

/// Aggregated endpoint-distance contraction of engaged pairs against the baseline rung.
///
/// Positive values state that engaged pairs end closer than the baseline placed them.
#[derive(Debug, serde::Serialize)]
pub(crate) struct ContractionReading {
    /// Instances entering the aggregate.
    pub edge_count: usize,
    /// Total engagement mass of those instances.
    pub total_mass: DNonNegative,
    /// Mass-weighted mean of `baseline distance - rung distance`, world units.
    ///
    /// Zero when no mass entered.
    pub mass_weighted_mean: DFinite,
    /// Unweighted mean of the same difference, world units. Zero when no instance entered.
    pub unweighted_mean: DFinite,
    /// The fraction of instances whose distance strictly shrank. Zero when no instance entered.
    pub contracted_fraction: UnitFraction,
}

/// One relation group's contraction beside its shared weights.
#[derive(Debug, serde::Serialize)]
pub(crate) struct GroupReading {
    /// The relation type's ontology row.
    pub relation: u32,
    /// The group's Coincident channel weight.
    pub coincident: NonNegative,
    /// The group's Proximal channel weight.
    pub proximal: NonNegative,
    /// The group's strength factor, one factor of every instance's mass.
    pub strength: NonNegative,
    /// The group's contraction aggregate.
    pub contraction: ContractionReading,
}

/// Point-displacement summary of one row population between two aligned frames.
#[derive(Debug, serde::Serialize)]
pub(crate) struct DisplacementReading {
    /// Rows in the population.
    pub rows: usize,
    /// Mean Euclidean displacement, world units. Zero for an empty population.
    pub mean: DNonNegative,
    /// Root-mean-square Euclidean displacement, world units. Zero for an empty population.
    pub rms: DNonNegative,
    /// Largest Euclidean displacement, world units. Zero for an empty population.
    pub max: DNonNegative,
}

/// One instance's endpoints and engagement mass, the unit of the contraction aggregates.
#[derive(Debug, Copy, Clone)]
struct EdgeTerm {
    /// The source endpoint's corpus row.
    source: NodeRowId,
    /// The target endpoint's corpus row.
    target: NodeRowId,
    /// The trainer's loss factor for this instance.
    mass: f64,
}

impl LadderReport {
    /// Rebuilds the ladder frames from the published checkpoint and compiles the reading.
    ///
    /// # Panics
    ///
    /// This panics when opening the generation fails, when it published no trained projector or
    /// no measured ladder, when an artifact fails to open or disagrees with another about the row
    /// domain, when the echoed schedule and the ladder evidence describe different ladders, or
    /// when the rebuilt canonical frame does not reproduce the published coordinate column within
    /// [`CERTIFICATE_TOLERANCE`]. A report run has no recovery path, and the error is the
    /// diagnosis.
    #[tracing::instrument(skip_all)]
    pub(crate) fn compile(root: &GenerationRoot, id: GenerationId) -> Self {
        let generation = root.open(id).expect("the generation is published");
        let repository = generation.repository();

        let (options, evidence) = ladder_sources(repository);

        // The artifacts. Every row domain must agree before pairs index into frames.
        let files = &repository.files;
        let checkpoint = files
            .projector
            .as_ref()
            .expect("a projector placement stages its checkpoint");

        let representations = ArrayFile::open(generation.path_of(&files.representations.name))
            .expect("the representation matrix opens");
        let representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> =
            IdSlice::from_raw(
                representations.vectors().expect(
                    "the representation matrix was sealed as f32 rows of the projector width",
                ),
            );
        let rows = representations.len();

        let coordinates = ArrayFile::open(generation.path_of(&files.coordinates.name))
            .expect("the coordinate column opens");
        let coordinates = coordinates
            .points()
            .expect("the coordinate column was sealed as f32 pairs");
        assert_eq!(
            rows,
            coordinates.len(),
            "the representation matrix and the coordinate column disagree on the row domain",
        );

        let attraction = AttractionArchive::new(
            AttractionFile::open(generation.path_of(&files.attraction.name))
                .expect("the attraction index opens"),
        )
        .expect("the published attraction index is valid");
        assert_eq!(
            rows as u64,
            attraction.rows(),
            "the attraction index and the representation matrix disagree on the row domain",
        );

        // The model, opened on the placement backend the fit trained on.
        let device = placement_device();
        let model: Projector<PlacementInner> = artifact::open_model(
            File::open(generation.path_of(&checkpoint.name)).expect("the checkpoint opens"),
            options.architecture,
            &device,
        )
        .expect("the checkpoint decodes against the echoed architecture");

        let roles = vec![NodeRole::KnowledgeEntity; rows];
        let columns = NodeColumns {
            representations,
            roles: IdSlice::from_raw(&roles),
        };
        let aligned = rebuild_frames(&model, columns, evidence, options.forward_rows, &device);
        let certificate = certify(&aligned[evidence.canonical_index], coordinates);

        // The reading. Terms materialize once and every rung reuses them.
        let group_terms = materialize_terms(&attraction);
        let mut participant = vec![false; rows];
        for group in &group_terms {
            for term in &group.terms {
                participant[term.source.as_usize()] = true;
                participant[term.target.as_usize()] = true;
            }
        }
        let participants = participant.iter().filter(|&&engaged| engaged).count();

        let rungs = read_rungs(evidence, &aligned, &group_terms, &participant);

        let contraction_argmax_index =
            argmax(rungs.iter().map(|rung| rung.contraction.mass_weighted_mean));

        Self {
            generation: id,
            rows,
            edges: attraction.edge_count(),
            groups: attraction.group_count(),
            participants,
            canonical_index: evidence.canonical_index,
            canonical_condition: evidence.canonical,
            contraction_argmax_index,
            canonical_is_argmax: contraction_argmax_index == evidence.canonical_index,
            certificate,
            rungs,
        }
    }
}

/// One relation group's terms, materialized once and reused by every rung.
struct GroupTerms {
    /// The relation type's ontology row.
    relation: OntologyRowId,
    /// The group's shared `[coincident, proximal, strength]` weights.
    weights: [NonNegative; 3],
    /// The group's instances with their masses.
    terms: Vec<EdgeTerm>,
}

/// Returns the echoed projector options beside the measured ladder evidence.
///
/// # Panics
///
/// This panics when the generation placed rows by landmark baseline, when it published no ladder,
/// or when the echoed schedule and the evidence describe different ladders: a reading over
/// disagreeing sources would describe neither.
fn ladder_sources(repository: &SaltRepository) -> (&ProjectorOptions, &LadderEvidence) {
    let PlacementOptions::Projector(options) =
        &repository.metadata.reproducibility.config.placement
    else {
        panic!("the generation placed rows by landmark baseline; no ladder exists to read");
    };
    let evidence = repository
        .metadata
        .evidence
        .projector
        .as_ref()
        .expect("a projector placement records its training evidence")
        .ladder
        .as_ref()
        .expect("the corpus carries relation force; a forceless ladder never publishes");

    let schedule = options.ladder.conditions.values();
    assert_eq!(
        schedule.len(),
        evidence.rungs.len(),
        "the echoed schedule and the ladder evidence disagree on the rung count",
    );
    for (index, (&condition, rung)) in schedule.iter().zip(&evidence.rungs).enumerate() {
        assert_eq!(
            condition, rung.condition,
            "rung {index}: the echoed schedule and the ladder evidence disagree on the condition \
             ({condition} against {})",
            rung.condition,
        );
    }

    assert_eq!(
        evidence.rungs[evidence.canonical_index].condition, evidence.canonical,
        "the canonical index does not name the canonical condition",
    );

    (options, evidence)
}

/// Rebuilds every rung: the production forward pass at the rung's condition, then the recorded
/// manifest alignment into the baseline frame.
///
/// # Panics
///
/// This panics when a forward slice reads back a non-finite coordinate.
fn rebuild_frames<B: Backend<FloatElem = f32>>(
    model: &Projector<B>,
    columns: NodeColumns<'_, NodeRowId>,
    evidence: &LadderEvidence,
    forward_rows: NonZero<usize>,
    device: &B::Device,
) -> Vec<Vec<Vec2>> {
    evidence
        .rungs
        .iter()
        .enumerate()
        .map(|(index, rung)| {
            let frame = refresh::forward(model, columns, rung.condition, forward_rows, device)
                .unwrap_or_else(|error| panic!("rung {index} projects a finite frame: {error:?}"));
            tracing::info!(
                index,
                condition = %rung.condition,
                "projected the rung"
            );
            frame
                .as_raw()
                .iter()
                .map(|&point| rung.alignment.apply(point))
                .collect()
        })
        .collect()
}

/// Materializes every group's instances with the trainer's own loss factor as their mass.
fn materialize_terms(attraction: &AttractionArchive<NodeRowId, EdgeRowId>) -> Vec<GroupTerms> {
    (0..attraction.group_count())
        .map(|index| {
            let group = attraction.group(index);
            let weights = group.weights();
            GroupTerms {
                relation: group.relation(),
                weights: [weights.coincident, weights.proximal, weights.strength],
                terms: group
                    .edges()
                    .map(|edge| EdgeTerm {
                        source: edge.source,
                        target: edge.target,
                        // The trainer's loss factor, computed identically (`relation_loss`).
                        mass: (edge.confidence.value() * edge.normalization)
                            * f64::from(weights.strength),
                    })
                    .collect(),
            }
        })
        .collect()
}

/// Reads every rung against the baseline: contraction per group and in aggregate, and the point
/// displacement of both row populations.
fn read_rungs(
    evidence: &LadderEvidence,
    aligned: &[Vec<Vec2>],
    group_terms: &[GroupTerms],
    participant: &[bool],
) -> Vec<RungReading> {
    let baseline: &IdSlice<NodeRowId, Vec2> = IdSlice::from_raw(&aligned[0]);

    evidence
        .rungs
        .iter()
        .enumerate()
        .map(|(index, rung)| {
            let frame: &IdSlice<NodeRowId, Vec2> = IdSlice::from_raw(&aligned[index]);

            let group_contractions = group_terms
                .iter()
                .map(|group| GroupReading {
                    relation: group.relation.as_u32(),
                    coincident: group.weights[0],
                    proximal: group.weights[1],
                    strength: group.weights[2],
                    contraction: contract(baseline, frame, &group.terms),
                })
                .collect();
            let contraction = contract(
                baseline,
                frame,
                group_terms.iter().flat_map(|group| &group.terms).copied(),
            );

            RungReading {
                condition: rung.condition,
                relation_loss: rung.relation_loss,
                baseline_movement: rung.baseline_movement,
                contraction,
                group_contractions,
                participant_displacement: displace(baseline, frame, participant, true),
                non_participant_displacement: displace(baseline, frame, participant, false),
            }
        })
        .collect()
}

/// Measures the canonical rung's reproduction residual and asserts the certificate bound.
///
/// # Panics
///
/// This panics when the largest absolute component error reaches [`CERTIFICATE_TOLERANCE`] and
/// when any rebuilt component is non-finite: the rebuilt frames would describe a lookalike of the
/// published generation, and no reading over them is evidence about it.
#[expect(
    clippy::cast_precision_loss,
    reason = "corpus row counts sit orders of magnitude below the f64 mantissa"
)]
fn certify(rebuilt: &[Vec2], published: &[Vec2]) -> Certificate {
    assert_eq!(
        rebuilt.len(),
        published.len(),
        "the rebuilt frame and the published column disagree on the row domain",
    );

    let mut max_absolute = 0.0_f64;
    let mut sum_absolute = 0.0_f64;
    let mut max_distance = 0.0_f64;
    for (&ours, &theirs) in rebuilt.iter().zip(published) {
        let delta = ours - theirs;
        let dx = f64::from(delta.x()).abs();
        let dy = f64::from(delta.y()).abs();
        max_absolute = max_absolute.max(dx).max(dy);
        sum_absolute += dx + dy;
        max_distance = max_distance.max(f64::from(delta.length()));
    }
    let components = (rebuilt.len() * 2) as f64;

    // `f64::max` skips NaN, so the max fold alone cannot certify finiteness. Any NaN component
    // poisons the component sum, and the mean's constructor is the refusal.
    let non_finite =
        "the rebuilt canonical frame carries a non-finite coordinate and reproduces nothing";
    let certificate = Certificate {
        tolerance: CERTIFICATE_TOLERANCE,
        max_absolute_error: DNonNegative::new(max_absolute).expect(non_finite),
        mean_absolute_error: if rebuilt.is_empty() {
            DNonNegative::ZERO
        } else {
            DNonNegative::new(sum_absolute / components).expect(non_finite)
        },
        max_point_distance: DNonNegative::new(max_distance).expect(non_finite),
    };
    assert!(
        certificate.max_absolute_error < CERTIFICATE_TOLERANCE,
        "the rebuilt canonical frame does not reproduce the published coordinate column (max \
         component error {}, bound {CERTIFICATE_TOLERANCE})",
        certificate.max_absolute_error,
    );

    certificate
}

/// Aggregates endpoint-distance contraction over one instance population.
#[expect(
    clippy::cast_precision_loss,
    reason = "instance counts sit orders of magnitude below the f64 mantissa"
)]
fn contract(
    baseline: &IdSlice<NodeRowId, Vec2>,
    frame: &IdSlice<NodeRowId, Vec2>,
    terms: impl IntoIterator<Item = impl core::borrow::Borrow<EdgeTerm>>,
) -> ContractionReading {
    let mut edge_count = 0_usize;
    let mut contracted = 0_usize;
    let mut total_mass = 0.0_f64;
    let mut weighted_sum = 0.0_f64;
    let mut unweighted_sum = 0.0_f64;

    for term in terms {
        let term = *term.borrow();
        let before = (baseline[term.source] - baseline[term.target]).length();
        let after = (frame[term.source] - frame[term.target]).length();
        let difference = f64::from(before) - f64::from(after);

        edge_count += 1;
        contracted += usize::from(after < before);
        total_mass += term.mass;
        weighted_sum = term.mass.mul_add(difference, weighted_sum);
        unweighted_sum += difference;
    }

    ContractionReading {
        edge_count,
        total_mass: DNonNegative::new(total_mass)
            .expect("a sum of non-negative engagement masses is non-negative and finite"),
        mass_weighted_mean: if total_mass > 0.0 {
            DFinite::new(weighted_sum / total_mass)
                .expect("a mass-weighted mean of finite distance differences is finite")
        } else {
            DFinite::ZERO
        },
        unweighted_mean: if edge_count > 0 {
            DFinite::new(unweighted_sum / edge_count as f64)
                .expect("a mean of finite distance differences is finite")
        } else {
            DFinite::ZERO
        },
        contracted_fraction: if edge_count > 0 {
            UnitFraction::new(contracted as f64 / edge_count as f64)
                .expect("a count never exceeds the population it counts")
        } else {
            UnitFraction::ZERO
        },
    }
}

/// Summarizes point displacement between two aligned frames over one row population.
///
/// `engaged` selects which side of the participant mask enters.
#[expect(
    clippy::cast_precision_loss,
    reason = "row counts sit orders of magnitude below the f64 mantissa"
)]
fn displace(
    baseline: &IdSlice<NodeRowId, Vec2>,
    frame: &IdSlice<NodeRowId, Vec2>,
    participant: &[bool],
    engaged: bool,
) -> DisplacementReading {
    let mut rows = 0_usize;
    let mut sum = 0.0_f64;
    let mut sum_squared = 0.0_f64;
    let mut max = 0.0_f64;

    for (index, &membership) in participant.iter().enumerate() {
        if membership != engaged {
            continue;
        }
        let row = NodeRowId::from_usize(index);
        let distance = f64::from((frame[row] - baseline[row]).length());
        rows += 1;
        sum += distance;
        sum_squared = distance.mul_add(distance, sum_squared);
        max = max.max(distance);
    }

    DisplacementReading {
        rows,
        mean: if rows > 0 {
            DNonNegative::new(sum / rows as f64)
                .expect("a mean of finite non-negative distances is non-negative and finite")
        } else {
            DNonNegative::ZERO
        },
        rms: if rows > 0 {
            DNonNegative::new((sum_squared / rows as f64).sqrt())
                .expect("a root of a non-negative mean is non-negative")
        } else {
            DNonNegative::ZERO
        },
        max: DNonNegative::new(max).expect("a maximum of non-negative distances is non-negative"),
    }
}

/// Returns the index of the largest value.
///
/// Ties keep the first. Empty input returns `0`.
fn argmax(values: impl IntoIterator<Item = DFinite>) -> usize {
    let mut best = 0_usize;
    let mut best_value = None;
    for (index, value) in values.into_iter().enumerate() {
        if best_value.is_none_or(|current| value > current) {
            best = index;
            best_value = Some(value);
        }
    }
    best
}
