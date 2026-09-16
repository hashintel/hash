//! Endpoint contraction and corpus displacement across a published condition ladder.
//!
//! Frozen relation loss measures the [projector](crate::salt::projector)'s locally normalized
//! objective, while this report asks whether retained relation endpoints become closer in map
//! units. It compares every stored attraction instance's endpoint distance at the [zero-condition
//! step](super::Conditions) with its distance at each later step. Loss and contraction appear
//! together to expose disagreement between the objective and map geometry.
//!
//! # What the report reads
//!
//! The published generation supplies the checkpoint, representations, recorded schedule and
//! alignments, plus the attraction index. The report reconstructs all step frames on the supplied
//! device and applies each recorded alignment into the baseline frame. Per-step raw frames are fit
//! scratch artifacts and are not available as published columns. Row-independent projection
//! establishes the mathematical reconstruction, but backend kernels and floating-point behavior can
//! change its bits. No database or embedding provider is contacted.
//!
//! # The certificate
//!
//! The canonical reconstruction must have absolute component error strictly below
//! [`CERTIFICATE_TOLERANCE`] (0.001 world units) against the published coordinate column. Failure
//! panics. This establishes numerical agreement at the canonical step, not byte equality or
//! reconstruction accuracy at every other step. The bound uses a calibration of full-corpus
//! reconstructions of two generations with maximum component error near 0.0001. The report includes
//! the measured residual for comparison with that bound.
//!
//! # Bases, stated
//!
//! - Distances use the baseline frame's world units after each step's recorded alignment. A pure
//!   source similarity is removed by an ideal exact alignment, up to the implementation's rounding.
//!   Changing the baseline's unit scale changes the reported magnitudes.
//! - For instance i, engagement mass is mᵢ = confidenceᵢ · normalizationᵢ · strengthᵢ. This uses
//!   the loss readout's per-instance factor expression. Channel weights and locally normalized
//!   class energies are separate parts of the loss, and the report shows the channel weights per
//!   group.
//! - With contraction Δᵢ = distanceᵢ,zero − distanceᵢ,step, the mass-weighted mean is Σᵢ mᵢΔᵢ/Σᵢ
//!   mᵢ, or zero at zero mass. The unweighted mean is Σᵢ Δᵢ/E for E instances, or zero at E = 0.
//!   Positive values mean contraction. The contracted fraction counts only Δᵢ > 0, excluding ties.
//! - The report measures every stored instance and every corpus row. It preserves stored
//!   multiplicity and does not deduplicate oriented pairs or sample them. This population differs
//!   from the distinct-row training domain and its capped draws. Complete coverage removes sampling
//!   error, not numerical error or uncertainty about causal effects.
//! - Endpoint differences and lengths compute in `f32` before widening to `f64` for the serial
//!   aggregates. Even finite fields can overflow this distance path. The report refuses non-finite
//!   aggregate results instead of treating them as measurements.

#[cfg(test)]
mod tests;

use core::num::NonZero;
use std::fs::File;

use burn::tensor::backend::Backend;
use hashql_core::id::{Id as _, IdSlice, IdVec};

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::PhysicalDevice,
    file::{
        ArtifactFile as _,
        array::ArrayFile,
        attraction::read::AttractionFile,
        generation::{GenerationId, GenerationRoot},
        salt::{SaltRepository, metadata::LadderEvidence},
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{
        AlignedVecN, DFinite, DNonNegative, DPositive, Derivation, FinitePointField, NonNegative,
        UnitFraction,
    },
    salt::{
        fit::{PlacementOptions, ProjectorOptions},
        projector::{
            artifact::{self, CERTIFICATE_TOLERANCE},
            model::{NodeRole, Projector},
            train::{batch::NodeColumns, refresh},
        },
        relation::{artifact::AttractionArchive, attraction::AttractionWeights},
    },
};

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
    /// The published step's schedule index.
    pub canonical_index: usize,
    /// The published step's condition.
    pub canonical_condition: NonNegative,
    /// The schedule index with the largest mass-weighted mean contraction.
    ///
    /// Ties keep the first. With the baseline's zero contraction at index 0, a selected index of 0
    /// means no step has a strictly positive mass-weighted mean. Individual pairs can still
    /// contract.
    pub contraction_argmax_index: usize,
    /// Whether the published step is the contraction argmax.
    pub canonical_is_argmax: bool,
    /// The canonical step's reproduction residual against the published coordinate column.
    pub certificate: Certificate,
    /// One reading per step, in schedule order.
    ///
    /// The baseline has zero contraction and displacement, while retaining its counts, masses and
    /// recorded loss.
    pub steps: Vec<StepReading>,
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

/// One step's manifest evidence beside its measured relation effect.
#[derive(Debug, serde::Serialize)]
pub(crate) struct StepReading {
    /// The step's condition value.
    pub condition: NonNegative,
    /// The manifest's frozen relation loss using locally normalized distances.
    pub relation_loss: DNonNegative,
    /// The manifest's RMS movement against the baseline field after alignment.
    pub baseline_movement: DNonNegative,
    /// The measured contraction of engaged pairs against the baseline step, over all groups.
    pub contraction: ContractionReading,
    /// Per-group contraction, ascending by relation row.
    pub group_contractions: Vec<GroupReading>,
    /// Point displacement against the baseline step over participant rows.
    pub participant_displacement: DisplacementReading,
    /// Point displacement against the baseline step over non-participant rows.
    ///
    /// A step that buys contraction by disturbing rows the relation term never touches shows it
    /// here.
    pub non_participant_displacement: DisplacementReading,
}

/// Aggregated endpoint-distance contraction of engaged pairs against the baseline step.
///
/// Positive values state that engaged pairs end closer than the baseline placed them.
#[derive(Debug, serde::Serialize)]
pub(crate) struct ContractionReading {
    /// Instances entering the aggregate.
    pub edge_count: usize,
    /// Total engagement mass of those instances.
    pub total_mass: DNonNegative,
    /// Mass-weighted mean of baseline distance minus step distance, in world units.
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
    mass: DNonNegative,
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
    /// [`CERTIFICATE_TOLERANCE`]. Non-finite projection, alignment, distance or aggregate results
    /// also panic.
    ///
    /// # Complexity
    ///
    /// For S steps, N rows, G groups and E stored instances, the reading retains O(S(N + G) + E)
    /// host data for frames, terms and results, in addition to model and device working memory.
    /// Group extraction repeatedly validates archive regions, costing O(G(G + E)). Reading all
    /// steps costs O(S(N + G + E)) after frame reconstruction.
    #[tracing::instrument(skip_all)]
    pub(crate) fn compile(
        root: &GenerationRoot,
        id: GenerationId,
        device: &PhysicalDevice,
    ) -> Self {
        let generation = root.open(id).expect("the generation is published");
        let repository = generation.repository();

        let LadderSources { options, evidence } = LadderSources::new(repository);

        // The artifacts. Every row domain must agree before pairs index into frames.
        let files = &repository.files;
        let checkpoint = files
            .projector
            .as_ref()
            .expect("a projector placement stages its checkpoint");

        let representations = ArrayFile::open(generation.path_of(&files.representations.name()))
            .expect("the representation matrix opens");
        let representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> =
            IdSlice::from_raw(
                representations.vectors().expect(
                    "the representation matrix was sealed as f32 rows of the projector width",
                ),
            );
        let rows = representations.len();

        let coordinates = ArrayFile::open(generation.path_of(&files.coordinates.name()))
            .expect("the coordinate column opens");
        let coordinates = coordinates
            .points()
            .expect("the coordinate column was sealed as f32 pairs");
        let coordinates = FinitePointField::new(IdSlice::from_raw(coordinates))
            .expect("the coordinate column is finite");
        assert_eq!(
            rows,
            coordinates.len(),
            "the representation matrix and the coordinate column disagree on the row domain",
        );

        let attraction = AttractionArchive::new(
            AttractionFile::open(generation.path_of(&files.attraction.name()))
                .expect("the attraction index opens"),
        )
        .expect("the published attraction index is valid");
        assert_eq!(
            rows as u64,
            attraction.rows(),
            "the attraction index and the representation matrix disagree on the row domain",
        );

        // reconstruct on the supplied inference device. The certificate checks its canonical output
        // against the published column.
        let model: Projector<crate::device::Inference> = artifact::open_model(
            File::open(generation.path_of(&checkpoint.name())).expect("the checkpoint opens"),
            options.architecture,
            device,
        )
        .expect("the checkpoint decodes against the echoed architecture");

        let roles = vec![NodeRole::KnowledgeEntity; rows];
        let columns = NodeColumns {
            representations,
            roles: IdSlice::from_raw(&roles),
        };
        let aligned = rebuild_frames(&model, columns, evidence, options.forward_rows, device);
        let certificate = certify(&aligned[evidence.canonical_index], coordinates);

        // The reading. Terms materialize once and every step reuses them.
        let group_terms = materialize_terms(&attraction);
        let mut participant = vec![false; rows];
        for group in &group_terms {
            for term in &group.terms {
                participant[term.source.as_usize()] = true;
                participant[term.target.as_usize()] = true;
            }
        }
        let participants = participant.iter().filter(|&&engaged| engaged).count();

        let steps = read_steps(evidence, &aligned, &group_terms, &participant);

        let contraction_argmax_index =
            argmax(steps.iter().map(|step| step.contraction.mass_weighted_mean));

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
            steps,
        }
    }
}

/// One relation group's terms, materialized once and reused by every step.
struct GroupTerms {
    /// The relation type's ontology row.
    relation: OntologyRowId,
    /// The group's shared channel weights.
    weights: AttractionWeights,
    /// The group's instances with their masses.
    terms: Vec<EdgeTerm>,
}

/// Echoed projector options with a matching recorded condition sequence.
struct LadderSources<'source> {
    /// The echoed projector options.
    options: &'source ProjectorOptions,
    /// The measured ladder evidence.
    evidence: &'source LadderEvidence,
}

impl<'source> LadderSources<'source> {
    /// Returns the echoed projector options beside the measured ladder evidence.
    ///
    /// # Panics
    ///
    /// Panics for landmark-baseline placement, missing projector or ladder evidence, a
    /// condition-sequence mismatch, an out-of-range recorded canonical index, or disagreement
    /// between that entry and the recorded canonical condition.
    ///
    /// This does not compare the echoed canonical option with the evidence's canonical condition or
    /// validate the recorded alignments.
    pub(crate) fn new(repository: &'source SaltRepository) -> Self {
        let PlacementOptions::Projector(options) =
            &repository.metadata.reproducibility.config.placement
        else {
            panic!("ladder reporting requires projector placement");
        };

        let evidence = repository
            .metadata
            .evidence
            .projector
            .as_ref()
            .expect("a projector placement records its training evidence")
            .ladder
            .as_ref()
            .expect("should contain recorded ladder evidence for reporting");

        let schedule = options.ladder.conditions.values();
        assert_eq!(
            schedule.len(),
            evidence.steps.len(),
            "the echoed schedule and the ladder evidence disagree on the step count",
        );
        for (index, (&condition, step)) in schedule.iter().zip(&evidence.steps).enumerate() {
            assert_eq!(
                condition, step.condition,
                "step {index}: the echoed schedule and the ladder evidence disagree on the \
                 condition ({condition} against {})",
                step.condition,
            );
        }

        assert_eq!(
            evidence.steps[evidence.canonical_index].condition, evidence.canonical,
            "the canonical index does not name the canonical condition",
        );

        Self { options, evidence }
    }
}

/// Reprojects each recorded condition and applies its recorded baseline alignment.
///
/// The representation and role columns must cover the same rows. All aligned frames remain
/// allocated in the result.
///
/// # Panics
///
/// Panics when the columns do not cover a requested row range, projection fails, or applying an
/// alignment produces a non-finite coordinate.
fn rebuild_frames<B: Backend<FloatElem = f32>>(
    model: &Projector<B>,
    columns: NodeColumns<'_, NodeRowId>,
    evidence: &LadderEvidence,
    forward_rows: NonZero<usize>,
    device: &B::Device,
) -> Vec<Box<FinitePointField<NodeRowId>>> {
    evidence
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            let frame = refresh::forward(model, columns, step.condition, forward_rows, device)
                .unwrap_or_else(|error| panic!("step {index} projects a finite frame: {error:?}"));

            tracing::info!(
                index,
                condition = %step.condition,
                "projected the step"
            );

            let points: IdVec<_, _> = frame
                .as_raw()
                .iter()
                .map(|&point| step.alignment.apply(point))
                .collect();

            FinitePointField::new_boxed(points.into_boxed_slice())
                .unwrap_or_else(|error| panic!("step {index} aligns to a finite frame: {error:?}"))
        })
        .collect()
}

/// Materializes every stored instance with its confidence-normalization-strength mass.
///
/// Each group lookup revalidates archive regions. Extracting G groups over E edges costs O(G(G +
/// E)) work and O(G + E) result storage.
fn materialize_terms(attraction: &AttractionArchive<NodeRowId, EdgeRowId>) -> Vec<GroupTerms> {
    (0..attraction.group_count())
        .map(|index| {
            let group = attraction.group(index);
            let weights = group.weights();
            GroupTerms {
                relation: group.relation(),
                weights,
                terms: group
                    .edges()
                    .map(|edge| EdgeTerm {
                        source: edge.source,
                        target: edge.target,
                        // preserve the loss readout's factor expression and multiplication order.
                        mass: (edge.confidence.value() * edge.normalization)
                            * weights.strength.widen(),
                    })
                    .collect(),
            }
        })
        .collect()
}

/// Reads per-step contraction and participant/nonparticipant displacement.
///
/// `aligned` must follow the evidence's step order. The frames, endpoints and participant mask must
/// describe the same row domain.
///
/// # Panics
///
/// Panics when the baseline or a recorded step is missing, an indexed row is outside its frame, or
/// a contraction or displacement aggregate is non-finite.
fn read_steps(
    evidence: &LadderEvidence,
    aligned: &[Box<FinitePointField<NodeRowId>>],
    group_terms: &[GroupTerms],
    participant: &[bool],
) -> Vec<StepReading> {
    let baseline = &*aligned[0];

    evidence
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            let frame = &*aligned[index];

            let group_contractions = group_terms
                .iter()
                .map(|group| GroupReading {
                    relation: group.relation.as_u32(),
                    coincident: group.weights.coincident,
                    proximal: group.weights.proximal,
                    strength: group.weights.strength,
                    contraction: contract(baseline, frame, &group.terms),
                })
                .collect();
            let contraction = contract(
                baseline,
                frame,
                group_terms.iter().flat_map(|group| &group.terms).copied(),
            );

            StepReading {
                condition: step.condition,
                relation_loss: step.relation_loss,
                baseline_movement: step.baseline_movement,
                contraction,
                group_contractions,
                participant_displacement: displace(baseline, frame, participant, true),
                non_participant_displacement: displace(baseline, frame, participant, false),
            }
        })
        .collect()
}

/// Measures the canonical step's reproduction residual and asserts the certificate bound.
///
/// # Panics
///
/// Panics when frame lengths differ, a measured residual is non-finite, or the largest absolute
/// component error is at least [`CERTIFICATE_TOLERANCE`].
///
/// Component subtraction and point lengths use `f32` before widening. Empty paired fields yield
/// zero residuals and pass the bound.
#[expect(
    clippy::cast_precision_loss,
    reason = "corpus row counts sit orders of magnitude below the f64 mantissa"
)]
fn certify(
    rebuilt: &FinitePointField<NodeRowId>,
    published: &FinitePointField<NodeRowId>,
) -> Certificate {
    assert_eq!(
        rebuilt.len(),
        published.len(),
        "the rebuilt frame and the published column disagree on the row domain",
    );

    let mut max_absolute = 0.0_f64;
    let mut sum_absolute = 0.0_f64;
    let mut max_distance = 0.0_f64;
    for (&ours, &theirs) in rebuilt.iter().zip(published.iter()) {
        let delta = ours - theirs;
        let dx = f64::from(delta.x()).abs();
        let dy = f64::from(delta.y()).abs();
        max_absolute = max_absolute.max(dx).max(dy);
        sum_absolute += dx + dy;
        max_distance = max_distance.max(f64::from(delta.length()));
    }
    let components = (rebuilt.len() * 2) as f64;

    // finite input coordinates can still overflow f32 subtraction or length calculation. Validate
    // the residual summaries before comparing the component bound.
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
///
/// Distances compute through the `f32` vector-length path. Endpoint differences, their squared
/// lengths and the subsequent mass and difference folds must remain finite. A [`FinitePointField`]
/// alone does not establish those arithmetic bounds.
///
/// # Panics
///
/// Panics for an out-of-frame endpoint or a non-finite completed weighted or unweighted mean.
#[expect(
    clippy::cast_precision_loss,
    reason = "instance counts sit orders of magnitude below the f64 mantissa"
)]
fn contract(
    baseline: &FinitePointField<NodeRowId>,
    frame: &FinitePointField<NodeRowId>,
    terms: impl IntoIterator<Item = impl core::borrow::Borrow<EdgeTerm>>,
) -> ContractionReading {
    let mut edge_count = 0_usize;
    let mut contracted = 0_usize;
    let mut total_mass = DNonNegative::ZERO;
    // the weighted mean validates its completed derivation. If the f32 distances remain finite,
    // each unweighted difference has magnitude below 2¹²⁸. Fewer than 2⁶⁴ terms then keep the sum
    // below 2¹⁹². Finiteness of the input coordinates alone does not establish the first premise.
    let mut weighted_sum = Derivation::<DFinite>::ZERO;
    let mut unweighted_sum = DFinite::ZERO;

    for term in terms {
        let term = *term.borrow();
        let before = (baseline[term.source] - baseline[term.target]).length();
        let after = (frame[term.source] - frame[term.target]).length();

        let difference = before.widen() - after.widen();

        edge_count += 1;
        contracted += usize::from(after < before);
        total_mass += term.mass;
        weighted_sum = Derivation::from(difference).mul_add(term.mass, weighted_sum);
        unweighted_sum += difference;
    }

    ContractionReading {
        edge_count,
        total_mass,
        mass_weighted_mean: total_mass.positive().map_or(DFinite::ZERO, |total_mass| {
            (weighted_sum / total_mass)
                .finish()
                .expect("a mass-weighted mean of finite distance differences is finite")
        }),
        unweighted_mean: NonZero::new(edge_count).map_or(DFinite::ZERO, |edge_count| {
            (unweighted_sum / DPositive::from_usize(edge_count))
                .finish()
                .expect("a mean of finite distance differences is finite")
        }),
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
/// `engaged` selects which side of the participant mask enters. Only matching mask positions are
/// read. Rows beyond the mask's length do not enter either population. Differences and lengths
/// compute in `f32` before widening.
///
/// # Panics
///
/// Panics when a selected mask position exceeds either frame or a resulting displacement summary is
/// non-finite.
#[expect(
    clippy::cast_precision_loss,
    reason = "row counts sit orders of magnitude below the f64 mantissa"
)]
fn displace(
    baseline: &FinitePointField<NodeRowId>,
    frame: &FinitePointField<NodeRowId>,
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
