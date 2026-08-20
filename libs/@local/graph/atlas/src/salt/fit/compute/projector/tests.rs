#![expect(
    clippy::float_cmp,
    reason = "exactness assertions on constructed dyadic values are bit-precise contracts"
)]

use core::assert_matches;
use std::fs;

use burn::{backend::libtorch::LibTorchDevice, module::AutodiffModule as _};
use camino::Utf8PathBuf;
use hashql_core::id::{Id as _, IdSlice};

use super::{
    super::{
        super::{ProjectorOptions, Stage, stage_rng},
        Context,
        landmark::LandmarkSurvey,
        quotient::{DistinctRowId, Quotient},
    },
    PlacementPass,
    inputs::{DistinctInputs, PlacementInputs, VerdictResolution},
    report::{LossSeries, RelationLossReadout},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::{Inference, Training},
    file::{
        array::ArrayFile,
        generation::{GenerationRoot, StagedGeneration},
        repository::Artifact as _,
        salt::{
            artifact,
            metadata::{
                FrozenRadiusEvidence, LadderEvidence, Placement, ProjectorEvidence,
                RefreshFractionEvidence, Reproducibility, Snapshot, StabilityCertificateEvidence,
            },
        },
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    integrity::{Sha256, Update as _},
    math::{
        AffinityCurve, AlignedVecN, BoxedVecN, FinitePointField, NonNegative, Positive, Similarity,
        UnitFraction, Vec2, d_non_negative, d_positive, non_negative, open_unit_fraction, positive,
        positive_unit_fraction,
    },
    salt::{
        embedding::EmbedderFingerprint,
        fit::FitConfig,
        knn::table::{Knn, KnnMatrix},
        ladder::Conditions,
        landmark::select::SelectionOptions,
        policy::ClassProbabilities,
        projector::{
            artifact as checkpoint,
            loss::CoincidentEnergy,
            model::{Architecture, NodeRole, Projector},
            scale::LocalScales,
            train::{
                BoundaryEvidence, BudgetBreakdown, FrozenRadius, Model, NodeColumns,
                RefreshFraction, RelationLens, TrainingEvidence, TrainingSchedule, refresh,
            },
            verdict::calibrate::{
                ProximalCalibration,
                stability::{StabilityBound, StabilityCertificate},
            },
        },
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::AttractionOptions,
        },
        semantic::SemanticGraph,
    },
};

#[test]
fn loss_regression_even_odd_transition() {
    // Only 1→2 rises. A non-overlapping pairing ((0,1), (2,3))
    // sees two falling pairs and misses it.
    let conditions = [
        non_negative!(0.0),
        non_negative!(0.25),
        non_negative!(0.5),
        non_negative!(0.75),
    ];
    let losses = [
        d_non_negative!(1.0),
        d_non_negative!(0.5),
        d_non_negative!(0.75),
        d_non_negative!(0.5),
    ];

    let regressions: Vec<_> = LossSeries::new(&conditions, losses.to_vec())
        .regressions()
        .collect();

    assert_eq!(regressions.len(), 1);
    let regression = &regressions[0];
    assert_eq!(regression.previous_condition, non_negative!(0.25));
    assert_eq!(regression.condition, non_negative!(0.5));
    assert_eq!(regression.delta, d_positive!(0.25));
    assert_eq!(regression.relative, Some(d_positive!(0.5)));
}

#[test]
fn loss_regression_final_odd_transition() {
    // Only 3→4 rises. A non-overlapping pairing of a five-step
    // series discards the final element with the remainder.
    let conditions = [
        non_negative!(0.0),
        non_negative!(0.25),
        non_negative!(0.5),
        non_negative!(0.75),
        non_negative!(1.0),
    ];
    let losses = [
        d_non_negative!(1.0),
        d_non_negative!(0.75),
        d_non_negative!(0.5),
        d_non_negative!(0.25),
        d_non_negative!(0.5),
    ];

    let regressions: Vec<_> = LossSeries::new(&conditions, losses.to_vec())
        .regressions()
        .collect();

    assert_eq!(regressions.len(), 1);
    let regression = &regressions[0];
    assert_eq!(regression.previous_condition, non_negative!(0.75));
    assert_eq!(regression.condition, non_negative!(1.0));
    assert_eq!(regression.delta, d_positive!(0.25));
    assert_eq!(regression.relative, Some(d_positive!(1.0)));
}

#[test]
fn loss_regression_zero_predecessor() {
    let conditions = [non_negative!(0.0), non_negative!(1.0)];
    let losses = [d_non_negative!(0.0), d_non_negative!(1.0)];

    let regressions: Vec<_> = LossSeries::new(&conditions, losses.to_vec())
        .regressions()
        .collect();

    assert_eq!(regressions.len(), 1);
    assert_eq!(regressions[0].delta, d_positive!(1.0));
    assert_eq!(regressions[0].relative, None);
}

/// Corpus rows of the publish fixture.
///
/// Row 3 carries row 0's representation and row 5 carries row 2's, so the quotient collapses
/// six corpus rows onto four distinct rows.
const ROWS: usize = 6;
const DISTINCT: usize = 4;
const CORPUS_CAPACITY: usize = ROWS * PROJECTOR_DIMENSIONS;

/// The reviewed relation type of the attraction fixture.
const RELATION: u64 = 7;

fn nonzero(value: usize) -> core::num::NonZero<usize> {
    core::num::NonZero::new(value).expect("fixture values are nonzero")
}

fn scratch_dir(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-publish-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    dir
}

/// The corpus representations, one distinct pattern per row with copies at rows 3 and 5.
fn corpus_storage() -> BoxedVecN<CORPUS_CAPACITY> {
    let mut storage = BoxedVecN::zero();
    let array = storage.as_array_mut();
    for row in 0..ROWS {
        let source = match row {
            3 => 0,
            5 => 2,
            _ => row,
        };
        let base = row * PROJECTOR_DIMENSIONS;
        array[base + source] = 1.0;
        array[base + 16 + source] = -0.5;
    }
    storage
}

/// A complete-graph neighbour table over the distinct rows.
fn distinct_knn() -> Knn<DistinctRowId> {
    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut values = Vec::new();
    for row in 0..DISTINCT {
        for column in (0..DISTINCT).filter(|&column| column != row) {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            values.push(non_negative!(0.75));
        }
        indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
    }
    let matrix = KnnMatrix::try_new((DISTINCT, DISTINCT), indptr, columns, values)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is structurally valid");
    Knn::new(matrix).expect("the fixture table is a valid neighbour table")
}

/// Relation indexes carrying one full-Proximal relation over the distinct rows.
fn distinct_indexes() -> RelationIndexes<DistinctRowId, EdgeRowId> {
    let policy = RelationPolicy {
        relation: OntologyRowId::new(RELATION),
        attraction: ClassProbabilities {
            coincident: UnitFraction::ZERO,
            proximal: UnitFraction::ONE,
        },
        selected: ClassProbabilities {
            coincident: UnitFraction::ZERO,
            proximal: UnitFraction::ONE,
        },
        applicability: UnitFraction::ONE,
        strength: NonNegative::ONE,
        _pad: [0; 4],
    };
    let instance = |edge: u64, source: usize, target: usize| RelationInstance {
        edge: EdgeRowId::new(edge),
        relation: OntologyRowId::new(RELATION),
        source: DistinctRowId::from_usize(source),
        target: DistinctRowId::from_usize(target),
        confidence: RelationConfidence::default(),
        multiplicity: 1,
    };
    let mut instances = vec![instance(0, 0, 2), instance(1, 1, 3)];
    RelationIndexes::build(
        DISTINCT,
        Policies::new(&[policy]).expect("the fixture policy is certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture instances satisfy the input contract")
}

/// Relation indexes over the corpus rows, the staged counterpart of [`distinct_indexes`].
///
/// The corpus instances restate the distinct pairs at the quotient's first rows: distinct
/// rows 2 and 3 first occur at corpus rows 2 and 4.
fn corpus_indexes() -> RelationIndexes<NodeRowId, EdgeRowId> {
    let policy = RelationPolicy {
        relation: OntologyRowId::new(RELATION),
        attraction: ClassProbabilities {
            coincident: UnitFraction::ZERO,
            proximal: UnitFraction::ONE,
        },
        selected: ClassProbabilities {
            coincident: UnitFraction::ZERO,
            proximal: UnitFraction::ONE,
        },
        applicability: UnitFraction::ONE,
        strength: NonNegative::ONE,
        _pad: [0; 4],
    };
    let instance = |edge: u64, source: u64, target: u64| RelationInstance {
        edge: EdgeRowId::new(edge),
        relation: OntologyRowId::new(RELATION),
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        confidence: RelationConfidence::default(),
        multiplicity: 1,
    };
    let mut instances = vec![instance(0, 0, 2), instance(1, 1, 4)];
    RelationIndexes::build(
        ROWS,
        Policies::new(&[policy]).expect("the fixture policy is certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture corpus instances satisfy the input contract")
}

/// Stages the corpus-domain attraction file, as the relation stage leaves it.
///
/// The paired-movement readout replays over the published index, so the ladder-walking
/// publish reads this file back.
fn stage_attraction(staging: &StagedGeneration) {
    let relations = corpus_indexes();
    staging
        .stage_with(artifact::Attraction, |writer| {
            relations.attraction.write_into(ROWS as u64, writer)
        })
        .expect("the attraction index should stage");
}

/// The skinny projector fixture.
///
/// The representation width stays the pipeline's contract while the hidden architecture
/// shrinks, so a forward pass costs a fraction of the `ratified()` model's.
fn skinny_options() -> ProjectorOptions {
    let mut options = ProjectorOptions::ratified();
    options.architecture = Architecture {
        width: nonzero(8),
        residual_blocks: nonzero(1),
        representation_dimensions: nonzero(PROJECTOR_DIMENSIONS),
        role_dimensions: nonzero(4),
        condition_dimensions: nonzero(1),
    };
    options.schedule = TrainingSchedule::new(
        nonzero(1),
        0,
        nonzero(1),
        positive_unit_fraction!(1.0e-3),
        UnitFraction::new(1.0e-5).expect("the fixture minimum rate is a unit fraction"),
    )
    .expect("the fixture schedule is valid");
    options.lens = RelationLens::new(
        CoincidentEnergy::new(non_negative!(0.01), positive!(0.5)),
        Positive::new(0.25).expect("the fixture temperature is positive"),
        Positive::new(1.0e-8).expect("the fixture scale guard is positive"),
    );
    options.ladder.conditions = Conditions::new(vec![NonNegative::ZERO, NonNegative::ONE])
        .expect("the fixture schedule is valid");
    options.ladder.canonical = NonNegative::ONE;
    options.forward_rows = nonzero(4);
    options
}

/// The widest duplicate-cluster spread the staged column may show, in units in the last
/// place.
///
/// Byte-identical representations project to one coordinate mathematically. The column,
/// however, computes in `forward_rows`-bounded slices that put rows 5 and 2 into dispatches
/// of different shapes, whose kernels the GPU backend's autotune selects independently.
/// Under a loaded device the selections can disagree, and two reduction
/// orders for one value differ in the last bit (observed at exactly one ulp under the full
/// parallel suite). Within one dispatch shape the selection is cached per process, so the
/// projection-identity assertions stay bit-exact. The tolerance keeps headroom over the
/// observed single-ulp motion while still refusing value-scale divergence: a duplicate
/// placed anywhere else in the plane is millions of ulps away.
// Byte-identical rows project through one model, but the torch batched forward varies its
// reduction order with the row's batch position, so duplicates land within a few last bits
// rather than bit-identically. Measured at 8 ulps on this fixture; the bound holds twice that,
// and a wiring defect scatters duplicates by whole coordinates rather than last bits.
const DUPLICATE_ULPS: i64 = 16;

/// Maps a finite `f32` onto a line where integer distance is ulp distance, signs included.
fn ulp_key(value: f32) -> i64 {
    if value.is_sign_negative() {
        -i64::from(value.to_bits() & 0x7FFF_FFFF)
    } else {
        i64::from(value.to_bits())
    }
}

/// Reads the staged canonical column and asserts each duplicate cluster shares one
/// coordinate, up to [`DUPLICATE_ULPS`].
fn staged_column(staging: &StagedGeneration) -> Vec<Vec2> {
    let column = ArrayFile::open(staging.path_of(&artifact::Coordinates::NAME))
        .expect("the column should map");
    let placed = column.points().expect("the column holds 2D points");
    assert_eq!(placed.len(), ROWS);
    for (copy, first) in [(3_usize, 0_usize), (5, 2)] {
        for (copied, original) in [
            (placed[copy].x(), placed[first].x()),
            (placed[copy].y(), placed[first].y()),
        ] {
            let distance = (ulp_key(copied) - ulp_key(original)).abs();
            assert!(
                distance <= DUPLICATE_ULPS,
                "duplicate row {copy} strayed {distance} ulps from row {first}: {copied} vs \
                 {original}",
            );
        }
    }
    placed.to_vec()
}

/// Asserts the staged column is the staged checkpoint's canonical-step projection under the
/// recorded alignment, bit for bit: checkpoint, evidence, and column describe one field.
fn assert_column_is_aligned_projection(
    staging: &StagedGeneration,
    options: &ProjectorOptions,
    ladder: &LadderEvidence,
    columns: NodeColumns<'_, NodeRowId>,
) {
    let device = LibTorchDevice::Cpu;
    let bytes =
        fs::read(staging.path_of(&artifact::Projector::NAME)).expect("the checkpoint should read");
    let reopened =
        checkpoint::open_model::<Inference>(bytes.as_slice(), options.architecture, &device)
            .expect("the checkpoint should open on the inner backend");
    let projected = refresh::forward(
        &reopened,
        columns,
        ladder.canonical,
        options.forward_rows,
        &device,
    )
    .expect("the reopened model projects finitely");

    let placed = staged_column(staging);
    let alignment = ladder.steps[ladder.canonical_index].alignment;
    assert!(
        placed
            .iter()
            .zip(projected.iter())
            .all(|(persisted, fresh)| {
                let aligned = alignment.apply(*fresh);
                persisted.x().to_bits() == aligned.x().to_bits()
                    && persisted.y().to_bits() == aligned.y().to_bits()
            }),
        "the published column should be the aligned canonical projection",
    );
}

/// The drift readings a run would have recorded at its two scale-bearing ticks.
fn tick_fractions() -> [RefreshFraction; 2] {
    [
        RefreshFraction {
            step: 0,
            fraction: d_non_negative!(0.25),
        },
        RefreshFraction {
            step: 8,
            fraction: d_non_negative!(0.3125),
        },
    ]
}

/// Asserts every step's per-type shares add up to its total within accumulation rounding.
///
/// The shares run their own chains, so the agreement is a relative tolerance, not bit
/// equality.
fn assert_per_type_additivity(ladder: &LadderEvidence) {
    for step in &ladder.steps {
        let shares = &step.relation_losses;
        let sum: f64 = shares.iter().map(|entry| entry.loss.get()).sum();
        let total = step.relation_loss.get();
        assert!(
            (sum - total).abs() <= 1e-12 * total.max(1.0),
            "per-type shares {sum} should add up to the step total {total}",
        );
        // The fixture's one group holds fewer edges than the ratified cap, so its clip is
        // one and the capped estimand echoes the total bit-exactly: with a single group the
        // share's chain is the total's, and a fused multiply by one onto zero is exact.
        assert_eq!(
            step.capped_relation_loss,
            Some(step.relation_loss),
            "an uncapped fixture's estimand should echo the step total",
        );
    }
}

/// The capped estimand scales each group's share by its draw probability.
///
/// The fixture spans relation 7 with two edges and relation 9 with one, both over the
/// distinct rows. At cap 1 the two-edge group's share halves while the one-edge group's
/// passes whole. At a cap covering both groups nothing clips, and the estimand is the
/// shares' fused sum.
#[test]
fn capped_estimand_draw_probability() {
    let policy = |relation: u64| RelationPolicy {
        relation: OntologyRowId::new(relation),
        attraction: ClassProbabilities {
            coincident: UnitFraction::ZERO,
            proximal: UnitFraction::ONE,
        },
        selected: ClassProbabilities {
            coincident: UnitFraction::ZERO,
            proximal: UnitFraction::ONE,
        },
        applicability: UnitFraction::ONE,
        strength: NonNegative::ONE,
        _pad: [0; 4],
    };
    let instance = |edge: u64, relation: u64, source: usize, target: usize| RelationInstance {
        edge: EdgeRowId::new(edge),
        relation: OntologyRowId::new(relation),
        source: DistinctRowId::from_usize(source),
        target: DistinctRowId::from_usize(target),
        confidence: RelationConfidence::default(),
        multiplicity: 1,
    };
    let policies = [policy(RELATION), policy(9)];
    let mut instances = vec![
        instance(0, RELATION, 0, 2),
        instance(1, RELATION, 1, 3),
        instance(2, 9, 0, 3),
    ];
    let indexes = RelationIndexes::build(
        DISTINCT,
        Policies::new(&policies).expect("the fixture policies are certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture instances satisfy the input contract");

    let points = [
        Vec2::new(0.0, 0.0),
        Vec2::new(4.0, 0.0),
        Vec2::new(0.0, 4.0),
        Vec2::new(4.0, 4.0),
    ];
    let frame = FinitePointField::new(IdSlice::<DistinctRowId, Vec2>::from_raw(&points))
        .expect("the fixture frame is finite");
    let knn = distinct_knn();
    let scales = LocalScales::compute(frame, &knn.view()).expect("the fixture frame is finite");
    let energy = FrozenRadius::Measured {
        radius: non_negative!(0.5),
    }
    .energy(&skinny_options().lens)
    .expect("a measured radius composes an energy");

    let biting =
        RelationLossReadout::measure(frame, &scales, &indexes.attraction, energy, nonzero(1));
    let covering =
        RelationLossReadout::measure(frame, &scales, &indexes.attraction, energy, nonzero(2));

    // Neither the shares nor the uncapped total depend on the cap.
    assert_eq!(biting.per_type, covering.per_type);
    assert_eq!(biting.uncapped_total, covering.uncapped_total);

    let [(seven, share_seven), (nine, share_nine)] = biting.per_type[..] else {
        panic!("the fixture builds exactly two groups");
    };
    assert_eq!(seven, OntologyRowId::new(RELATION));
    assert_eq!(nine, OntologyRowId::new(9));
    assert!(
        share_seven.get() > 0.0,
        "the spread fixture pairs should carry force"
    );

    // Group order with hand-derived clips: `min(1, 2) / 2 = 1/2` for the two-edge group and
    // `min(1, 1) / 1 = 1` for the one-edge group, folded in the walk's own fused chain.
    let expected = share_nine
        .get()
        .mul_add(1.0, share_seven.get().mul_add(0.5, 0.0));
    assert_eq!(biting.capped_total.get(), expected);

    // A cap covering every group leaves nothing to clip.
    let uncapped = share_nine
        .get()
        .mul_add(1.0, share_seven.get().mul_add(1.0, 0.0));
    assert_eq!(covering.capped_total.get(), uncapped);
}

/// Asserts the persisted calibration body echoes the boundary and the tick readings.
fn assert_calibration_body(evidence: &ProjectorEvidence, boundary: &BoundaryEvidence) {
    let calibration = evidence
        .proximal_calibration
        .as_ref()
        .expect("a measured boundary persists its calibration body");
    assert_eq!(calibration.radius.get(), 0.5);
    assert_eq!(
        calibration.fractions,
        vec![
            RefreshFractionEvidence {
                step: 0,
                fraction: d_non_negative!(0.25),
            },
            RefreshFractionEvidence {
                step: 8,
                fraction: d_non_negative!(0.3125),
            },
        ]
    );
    assert_eq!(
        calibration.stability,
        StabilityCertificateEvidence::from(
            boundary
                .calibration
                .stability
                .as_ref()
                .expect("the fixture boundary carries a certificate")
        )
    );
}

/// A boundary that froze the fixture radius from reviewed pairs.
fn measured_boundary() -> BoundaryEvidence {
    BoundaryEvidence {
        step: 0,
        radius: FrozenRadius::Measured {
            radius: non_negative!(0.5),
        },
        calibration: ProximalCalibration {
            radius: Some(non_negative!(0.5)),
            types: Vec::new(),
            // Exact dyadic literals: the publish path serializes the certificate as-is,
            // and this fixture exercises the wiring rather than the derivation.
            stability: Some(StabilityCertificate {
                quantile: open_unit_fraction!(0.25),
                delta: open_unit_fraction!(0.05),
                kappa: d_positive!(1.0),
                temperature: d_positive!(0.125),
                tau: d_positive!(0.125),
                effective_support: d_positive!(4.0),
                pairs: 4,
                mass: d_non_negative!(2.0),
                epsilon_zero: d_positive!(0.5),
                gap: d_non_negative!(0.25),
                bound: StabilityBound::Unattainable,
                pass: false,
                type_effective_support: d_positive!(1.0),
            }),
        },
    }
}

/// A boundary that froze nothing.
fn vacuous_boundary() -> BoundaryEvidence {
    BoundaryEvidence {
        step: 0,
        radius: FrozenRadius::Vacuous,
        calibration: ProximalCalibration {
            radius: None,
            types: Vec::new(),
            stability: None,
        },
    }
}

/// The metadata document's frozen-graph section of the publish fixture.
fn snapshot() -> Snapshot {
    Snapshot {
        axes: None,
        nodes: 6,
        edges: 2,
        ontology_types: 1,
    }
}

/// The metadata document's declared-inputs section of the publish fixture.
fn reproducibility() -> Reproducibility {
    let mut hasher = Sha256::new();
    hasher.update(b"publish fixture embedder");
    Reproducibility {
        config: fit_config(),
        embedder: EmbedderFingerprint::new(hasher.finalize()),
        prior: None,
    }
}

fn fit_config() -> FitConfig {
    FitConfig {
        seed: 11,
        selection: SelectionOptions {
            maximum_count: core::num::NonZero::new(4).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::fit(positive!(1.0), positive!(0.1))
            .expect("the reference falloff is well-conditioned"),
        ..
    }
}

#[test]
#[cfg_attr(miri, ignore = "the publish half stages files through the platform")]
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging directory is read back after the publish returns; dropping it early \
              would delete the files under assertion"
)]
fn publish_vacuous_baseline() {
    let corpus = corpus_storage();
    let rows: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> = IdSlice::from_raw(
        AlignedVecN::from_slice(&corpus.as_array()[..CORPUS_CAPACITY])
            .expect("boxed storage is aligned"),
    );
    let root = GenerationRoot::new(scratch_dir("vacuous")).expect("the root should open");
    let staging = root.stage().expect("the staging directory should open");
    let scratch = root.scratch().expect("the scratch directory should open");
    let quotient = Quotient::build(rows, &scratch).expect("the distinct matrix writes");
    assert_eq!(quotient.distinct_len(), DISTINCT);

    let knn = distinct_knn();
    let indexes = distinct_indexes();
    let snapshot = snapshot();
    let reproducibility = reproducibility();
    let roles = vec![NodeRole::KnowledgeEntity; ROWS];
    let columns = || NodeColumns {
        representations: rows,
        roles: IdSlice::from_raw(&roles),
    };

    let options = skinny_options();
    let device = LibTorchDevice::Cpu;
    let model = Projector::<Training>::new(
        options.architecture,
        &device,
        stage_rng(11, Stage::ProjectorInit),
    );

    let context = Context {
        staging,
        scratch,
        config: fit_config(),
        device,
    };

    let semantic = SemanticGraph::build(&knn.view(), context.config.smoothing);
    let skeleton = LandmarkSurvey::new(&context, &quotient, &semantic, None)
        .run()
        .expect("the fixture corpus builds a skeleton")
        .value;
    let resolution = VerdictResolution {
        resolved: Vec::new(),
        unresolved: 3,
    };
    let placement_inputs = PlacementInputs {
        skeleton: &skeleton,
        resolution: &resolution,
        snapshot: &snapshot,
        reproducibility: &reproducibility,
        distinct: DistinctInputs {
            quotient: &quotient,
            knn: &knn,
            semantic: &semantic,
            indexes: &indexes,
        },
    };
    let artifacts = PlacementPass::new(&context, &placement_inputs)
        .expect("the ratified placement configuration resolves")
        .publish(
            &options,
            Model {
                projector: model.clone(),
                evidence: TrainingEvidence {
                    boundary: Some(vacuous_boundary()),
                    budget: BudgetBreakdown::default(),
                    losses: Vec::new(),
                    telemetry: Vec::new(),
                    fractions: Vec::new(),
                    target: None,
                },
            },
            columns(),
        )
        .expect("the publish half should stage");

    assert_eq!(artifacts.kind, Placement::Projector);
    assert!(artifacts.checkpoint.is_some());
    let evidence = artifacts
        .evidence
        .as_ref()
        .expect("a projector placement records evidence");
    assert_eq!(evidence.steps, 1);
    assert_eq!(evidence.boundary, Some(FrozenRadiusEvidence::Vacuous));
    assert_eq!(evidence.unresolved_verdicts, 3);
    assert!(
        evidence.ladder.is_none(),
        "a vacuous boundary opens no ladder"
    );
    assert!(
        evidence.proximal_calibration.is_none(),
        "a vacuous boundary persists no calibration body, absent rather than zero"
    );

    // The staged column is the model's own zero-step projection, bit
    // for bit, and byte-identical representations share one
    // coordinate up to the last-bit motion `staged_column` prices.
    let placed = staged_column(&context.staging);
    let projected = refresh::forward(
        &model.valid(),
        columns(),
        NonNegative::ZERO,
        options.forward_rows,
        &device,
    )
    .expect("the fixture model projects finitely");
    assert!(
        placed
            .iter()
            .zip(projected.iter())
            .all(
                |(persisted, fresh)| persisted.x().to_bits() == fresh.x().to_bits()
                    && persisted.y().to_bits() == fresh.y().to_bits()
            ),
        "the published column should be the model's own projection",
    );
}

#[test]
#[cfg_attr(miri, ignore = "the publish half stages files through the platform")]
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging directory is read back after the publish returns; dropping it early \
              would delete the files under assertion"
)]
fn publish_measured_aligned_canonical() {
    let corpus = corpus_storage();
    let rows: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> = IdSlice::from_raw(
        AlignedVecN::from_slice(&corpus.as_array()[..CORPUS_CAPACITY])
            .expect("boxed storage is aligned"),
    );
    let root = GenerationRoot::new(scratch_dir("measured")).expect("the root should open");
    let staging = root.stage().expect("the staging directory should open");
    stage_attraction(&staging);
    let scratch = root.scratch().expect("the scratch directory should open");
    let quotient = Quotient::build(rows, &scratch).expect("the distinct matrix writes");
    let knn = distinct_knn();
    let indexes = distinct_indexes();
    let snapshot = snapshot();
    let reproducibility = reproducibility();
    let roles = vec![NodeRole::KnowledgeEntity; ROWS];
    let columns = || NodeColumns {
        representations: rows,
        roles: IdSlice::from_raw(&roles),
    };

    let options = skinny_options();
    let device = LibTorchDevice::Cpu;
    let model = Projector::<Training>::new(
        options.architecture,
        &device,
        stage_rng(13, Stage::ProjectorInit),
    );

    let context = Context {
        staging,
        scratch,
        config: fit_config(),
        device,
    };

    let semantic = SemanticGraph::build(&knn.view(), context.config.smoothing);
    let skeleton = LandmarkSurvey::new(&context, &quotient, &semantic, None)
        .run()
        .expect("the fixture corpus builds a skeleton")
        .value;
    let resolution = VerdictResolution {
        resolved: Vec::new(),
        unresolved: 0,
    };
    let placement_inputs = PlacementInputs {
        skeleton: &skeleton,
        resolution: &resolution,
        snapshot: &snapshot,
        reproducibility: &reproducibility,
        distinct: DistinctInputs {
            quotient: &quotient,
            knn: &knn,
            semantic: &semantic,
            indexes: &indexes,
        },
    };
    let boundary = measured_boundary();
    let artifacts = PlacementPass::new(&context, &placement_inputs)
        .expect("the ratified placement configuration resolves")
        .publish(
            &options,
            Model {
                projector: model,
                evidence: TrainingEvidence {
                    boundary: Some(measured_boundary()),
                    budget: BudgetBreakdown::default(),
                    losses: Vec::new(),
                    telemetry: Vec::new(),
                    fractions: tick_fractions().to_vec(),
                    target: None,
                },
            },
            columns(),
        )
        .expect("the publish half should stage");

    let evidence = artifacts
        .evidence
        .as_ref()
        .expect("a projector placement records evidence");
    assert_matches!(
        evidence.boundary,
        Some(FrozenRadiusEvidence::Measured { .. })
    );
    assert_calibration_body(evidence, &boundary);
    let ladder = evidence
        .ladder
        .as_ref()
        .expect("a measured boundary measures the ladder");
    assert_eq!(ladder.steps.len(), 2);
    assert_eq!(ladder.canonical.get().to_bits(), 1.0_f32.to_bits());
    assert_eq!(ladder.canonical_index, 1);
    assert_eq!(ladder.steps[0].alignment, Similarity::IDENTITY);
    assert_eq!(
        ladder.steps[0].baseline_movement.get().to_bits(),
        0.0_f64.to_bits()
    );
    assert_per_type_additivity(ladder);

    assert_column_is_aligned_projection(&context.staging, &options, ladder, columns());
}
