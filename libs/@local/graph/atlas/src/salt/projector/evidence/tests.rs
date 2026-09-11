//! Certificates for the per-evaluation evidence reading.
//!
//! Dyadic fixtures land every asserted reading on an exactly representable value, from the
//! fitted scales through the displacement quantiles, so each assert is an exact contract. The
//! clip-then-read certificate exercises the one place production arithmetic rounds - a clipped
//! row's landing coordinate - and asserts the boolean the floor was sized for.

#![expect(
    clippy::float_cmp,
    reason = "the exact fixtures produce exactly representable readings, so the asserted \
              constants are exact contracts"
)]

use hashql_core::id::IdSlice;

use super::{EvaluationEvidence, EvidenceReferences, EvidenceRefusal, StratumId};
use crate::{
    identity::NodeRowId,
    math::{DNonNegative, FinitePointField, Positive, Rotation, Similarity, Transform, Vec2},
    salt::projector::{
        band::BandProjection,
        gauge::{DuplicateClassId, GaugeAnchors, GaugeFit},
    },
};

fn positive(value: f32) -> Positive {
    Positive::new(value).expect("test value is positive")
}

/// The frame bridge, gauge frame to corpus frame: undoing the gauge fit and applying the corpus
/// fit. Composition can leave the representable coefficient range, in which case the two recorded
/// ends remain the complete evidence.
fn bridge(evidence: &EvaluationEvidence) -> Option<Similarity> {
    evidence
        .gauge_similarity
        .inverse()
        .then(evidence.corpus_similarity)
}

/// The boundary snapshot is an exact square of gauge anchors at rows 1, 2, 4, 5 with two far
/// fillers, centred so every fitted translation vanishes. The anchors' frozen spread is exactly
/// 1, so normalized residuals read unscaled.
const SNAPSHOT: [Vec2; 6] = [
    Vec2::new(8.0, 8.0),
    Vec2::new(1.0, 0.0),
    Vec2::new(-1.0, 0.0),
    Vec2::new(-8.0, -8.0),
    Vec2::new(0.0, 1.0),
    Vec2::new(0.0, -1.0),
];

/// Rows 0 through 2 sit in stratum 0 and rows 3 through 5 in stratum 1, so each stratum holds
/// one filler and two anchors.
const STRATA: [StratumId; 6] = [
    StratumId::new(0),
    StratumId::new(0),
    StratumId::new(0),
    StratumId::new(1),
    StratumId::new(1),
    StratumId::new(1),
];

/// Views a finite coordinate array as a proven-finite whole-corpus field.
fn frame(points: &[Vec2]) -> &FinitePointField<NodeRowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

fn gauge() -> GaugeAnchors<NodeRowId> {
    GaugeAnchors::freeze(
        Box::new([1, 2, 4, 5].map(NodeRowId::new)),
        Box::new([0, 1, 2, 3].map(DuplicateClassId::new)),
        frame(&SNAPSHOT),
        None,
        None,
    )
    .expect("the square fixture is a valid gauge")
}

/// A projection over the snapshot at the given dimensionless radius, with `s_ref = 2`.
fn projection(dimensionless_radius: f32) -> BandProjection<NodeRowId> {
    BandProjection::freeze(
        FinitePointField::new_boxed_unchecked(IdSlice::from_boxed_slice(Box::new(SNAPSHOT))),
        positive(dimensionless_radius),
        positive(2.0),
    )
    .expect("the fixture is a valid constraint")
}

fn live_fit(
    anchors: &GaugeAnchors<NodeRowId>,
    canonical: &[Vec2; 6],
    zero: &[Vec2; 6],
) -> GaugeFit {
    anchors
        .fit_gathered(
            &frame(canonical).gather(anchors.rows()),
            &frame(zero).gather(anchors.rows()),
            None,
        )
        .expect("the fixture fits")
}

fn scaled(field: &[Vec2; 6], factor: f32) -> [Vec2; 6] {
    field.map(|point| Vec2::new(point.x() * factor, point.y() * factor))
}

/// A uniform shrink of the whole zero field is per-row legal away from the fillers, and every
/// reading separates it exactly: the live scale leaves the reference-configuration scale, the
/// common-mode fit reads the shrink as `s_z = 2`, the anchors' displacement family reads the
/// world-unit movement, and the saturation tally counts only the two far fillers.
#[test]
fn a_common_shrink_separates_every_reading() {
    let anchors = gauge();
    let projection = projection(1.0);
    let record = projection.open_record(3);

    let canonical = scaled(&SNAPSHOT, 2.0);
    let zero = scaled(&SNAPSHOT, 0.5);
    let fit = live_fit(&anchors, &canonical, &zero);

    let evidence = EvaluationEvidence::read(
        11,
        &EvidenceReferences {
            anchors: &anchors,
            projection: &projection,
            strata: IdSlice::from_raw(&STRATA),
            record: &record,
        },
        &fit,
        frame(&canonical),
        frame(&zero),
    )
    .expect("the exact fixture reads");

    assert_eq!(evidence.step, 11);
    assert_eq!(evidence.effective_count, DNonNegative::from_usize(4));

    // The whole-field gauge fit reads current against current: canonical 2x onto zero 0.5x.
    // The objective-shape fit read the same constellations in this fixture, so its own
    // recorded reading agrees.
    assert_eq!(evidence.scale.get(), 0.25);
    assert_eq!(evidence.residual, 0.0);
    assert_eq!(evidence.objective_scale.get(), 0.25);
    assert_eq!(evidence.objective_residual, 0.0);
    // The reference-configuration fit reads current against frozen: canonical 2x onto `Z_K`.
    assert_eq!(evidence.reference_scale.get(), 0.5);
    assert_eq!(evidence.reference_residual, 0.0);

    // The whole corpus moved as one similarity, so both bridge ends agree and the bridge is
    // exactly the identity.
    assert_eq!(evidence.corpus_similarity, evidence.gauge_similarity);
    assert_eq!(bridge(&evidence), Some(Similarity::IDENTITY));

    // The shrunk zero field fits onto `Z_K` at exactly twice the scale, with no rotation and
    // no translation - the common mode read out.
    assert_eq!(evidence.zero_similarity.scale().get(), 2.0);
    assert_eq!(evidence.zero_similarity.translation(), Vec2::new(0.0, 0.0));

    // The gauge constellation stayed similar, so the affine component is the plain scale.
    assert_eq!(
        evidence.affine,
        Transform::from_scale(Vec2::new(0.25, 0.25))
    );
    assert_eq!(evidence.affine_residual, 0.0);

    // Every anchor moved by exactly half its unit norm.
    assert_eq!(evidence.displacement.len(), 2);
    for (family, stratum) in evidence.displacement.iter().zip([0, 1]) {
        assert_eq!(family.stratum, StratumId::new(stratum));
        assert_eq!(family.anchors, 2);
        assert_eq!(family.displacement.q05.get(), 0.5);
        assert_eq!(family.displacement.q50.get(), 0.5);
        assert_eq!(family.displacement.q95.get(), 0.5);
        assert_eq!(family.displacement.mean.get(), 0.5);
    }

    // The anchors stay far inside the radius 2 band. Each stratum's far filler moved by the
    // illegal 4·sqrt(2) and reads saturated. The per-row constraint sees the fillers alone,
    // while the common-mode scale above reads the shrink itself.
    assert_eq!(evidence.saturation.len(), 2);
    for (tally, stratum) in evidence.saturation.iter().zip([0, 1]) {
        assert_eq!(tally.stratum, StratumId::new(stratum));
        assert_eq!(tally.rows, 3);
        assert_eq!(tally.saturated, 1);
    }

    // The record was opened and never applied.
    assert!(!evidence.enforcement.ever_clipped);
    assert_eq!(evidence.enforcement.clipped_row_applications, 0);
    assert_eq!(evidence.enforcement.max_overshoot.get(), 0.0);
    assert_eq!(evidence.enforcement.opened_at, 3);
    assert_eq!(evidence.enforcement.last_application, None);
}

/// An anisotropic gauge deformation splits the decomposition exactly: the similarity residual
/// prices the deformation at `r = 0.75` while the affine fit absorbs it whole, and the
/// reference-configuration fit stays at the frozen identity.
#[test]
fn the_affine_component_absorbs_what_the_similarity_prices() {
    let anchors = gauge();
    let projection = projection(1.0);
    let record = projection.open_record(0);

    let canonical = SNAPSHOT;
    // The anchors' zero rows deform under diag(2, 1/2). The fillers hold still.
    let mut zero = SNAPSHOT;
    zero[1] = Vec2::new(2.0, 0.0);
    zero[2] = Vec2::new(-2.0, 0.0);
    zero[4] = Vec2::new(0.0, 0.5);
    zero[5] = Vec2::new(0.0, -0.5);
    let fit = live_fit(&anchors, &canonical, &zero);

    let evidence = EvaluationEvidence::read(
        0,
        &EvidenceReferences {
            anchors: &anchors,
            projection: &projection,
            strata: IdSlice::from_raw(&STRATA),
            record: &record,
        },
        &fit,
        frame(&canonical),
        frame(&zero),
    )
    .expect("the exact fixture reads");

    assert_eq!(evidence.scale.get(), 1.25);
    assert_eq!(evidence.residual, 0.75);
    assert_eq!(evidence.objective_scale.get(), 1.25);
    assert_eq!(evidence.objective_residual, 0.75);
    assert_eq!(evidence.reference_scale.get(), 1.0);
    assert_eq!(evidence.reference_residual, 0.0);

    assert_eq!(evidence.affine, Transform::from_scale(Vec2::new(2.0, 0.5)));
    assert_eq!(evidence.affine_residual, 0.0);

    // No row reaches the radius 2 floor: the deformed anchors moved by at most 1.
    for tally in &evidence.saturation {
        assert_eq!(tally.saturated, 0);
    }
}

/// A non-finite coordinate anywhere in either field dies at the whole-corpus fit before any
/// per-row reading, and a collinear canonical gauge constellation admits a similarity fit
/// while refusing the affine one. Production data reaches both arms.
#[test]
fn refusals_name_the_fit_that_could_not_be_made() {
    let anchors = gauge();
    let projection = projection(1.0);
    let record = projection.open_record(0);
    let zero = SNAPSHOT;

    // A non-finite coordinate never reaches the reading: the readback boundary's proof
    // refuses it naming the row, so the reading's own refusals cover fit degeneracy alone.
    let mut poisoned = scaled(&SNAPSHOT, 2.0);
    poisoned[0] = Vec2::new(f32::NAN, 16.0);
    assert_eq!(
        FinitePointField::new(IdSlice::<NodeRowId, _>::from_raw(&poisoned))
            .expect_err("a poisoned field refuses its proof")
            .id,
        NodeRowId::new(0)
    );

    // Anchors collinear on the x axis: positive variance fits the similarity, while the
    // collapsed scatter axis refuses the affine solve.
    let mut collinear = SNAPSHOT;
    collinear[1] = Vec2::new(1.0, 0.0);
    collinear[2] = Vec2::new(-1.0, 0.0);
    collinear[4] = Vec2::new(2.0, 0.0);
    collinear[5] = Vec2::new(-2.0, 0.0);
    let fit = live_fit(&anchors, &collinear, &zero);
    assert_eq!(
        EvaluationEvidence::read(
            0,
            &EvidenceReferences {
                anchors: &anchors,
                projection: &projection,
                strata: IdSlice::from_raw(&STRATA),
                record: &record,
            },
            &fit,
            frame(&collinear),
            frame(&zero),
        ),
        Err(EvidenceRefusal::Affine)
    );
}

/// A row the projection actually clipped reads as saturated through the stored `f32` bytes:
/// the landing coordinate rounds, the floor sits a full margin below the landing radius, and
/// the enforcement summary copies the record's cumulative story at the evaluation point.
#[test]
fn a_clipped_row_reads_saturated_with_its_record() {
    let anchors = gauge();
    let projection = projection(0.25);
    let mut record = projection.open_record(7);

    let canonical = scaled(&SNAPSHOT, 2.0);
    let mut zero = SNAPSHOT;
    // Row 0 overshoots its centre by 1.25 against the radius 0.5; every other row holds
    // still and re-reads bit-identical.
    zero[0] = Vec2::new(9.25, 8.0);
    let mut field =
        FinitePointField::new_boxed_unchecked(IdSlice::from_boxed_slice(Box::new(zero)));
    projection.apply(&mut field, 9, &mut record);

    let fit = live_fit(
        &anchors,
        &canonical,
        field.as_raw().try_into().expect("six rows"),
    );
    let evidence = EvaluationEvidence::read(
        12,
        &EvidenceReferences {
            anchors: &anchors,
            projection: &projection,
            strata: IdSlice::from_raw(&STRATA),
            record: &record,
        },
        &fit,
        frame(&canonical),
        &field,
    )
    .expect("the clipped fixture reads");

    // The clipped filler is stratum 0's one saturated row. Nothing else moved.
    assert_eq!(evidence.saturation.len(), 2);
    assert_eq!(evidence.saturation[0].saturated, 1);
    assert_eq!(evidence.saturation[1].saturated, 0);

    // The anchors never moved, so the gauge displacement family stays at zero.
    for family in &evidence.displacement {
        assert_eq!(family.displacement.q50.get(), 0.0);
        assert_eq!(family.displacement.mean.get(), 0.0);
    }

    assert!(evidence.enforcement.ever_clipped);
    assert_eq!(evidence.enforcement.clipped_row_applications, 1);
    // Overshoot in units of s_ref: (1.25 - 0.5) / 2.
    assert_eq!(evidence.enforcement.max_overshoot.get(), 0.375);
    assert_eq!(evidence.enforcement.opened_at, 7);
    assert_eq!(evidence.enforcement.last_application, Some(9));
}

/// An objective-shape fit disagreeing with the whole-field realization stands as its own
/// reading and enters no bridge end: both recorded ends derive from the fields alone.
#[test]
fn the_objective_reading_enters_no_bridge_end() {
    let anchors = gauge();
    let projection = projection(1.0);
    let record = projection.open_record(0);

    let canonical = SNAPSHOT;
    let zero = SNAPSHOT;
    // The pass's padded-shape fit saw a doubled canonical constellation.
    let doubled = scaled(&SNAPSHOT, 2.0);
    let fit = live_fit(&anchors, &doubled, &zero);

    let evidence = EvaluationEvidence::read(
        4,
        &EvidenceReferences {
            anchors: &anchors,
            projection: &projection,
            strata: IdSlice::from_raw(&STRATA),
            record: &record,
        },
        &fit,
        frame(&canonical),
        frame(&zero),
    )
    .expect("the exact fixture reads");

    assert_eq!(evidence.objective_scale.get(), 0.5);
    assert_eq!(evidence.scale.get(), 1.0);
    assert_eq!(evidence.gauge_similarity, Similarity::IDENTITY);
    assert_eq!(evidence.corpus_similarity, Similarity::IDENTITY);
    assert_eq!(bridge(&evidence), Some(Similarity::IDENTITY));
}

/// The bridge converts a gauge-frame reading into the corpus frame by recorded arithmetic
/// alone: undoing a pure gauge scale of 2 against a corpus identity halves the reading.
#[test]
fn the_bridge_composes_the_two_recorded_ends() {
    let gauge_similarity = Similarity::new(
        Positive::new(2.0).expect("2 is positive"),
        Rotation::IDENTITY,
        Vec2::new(0.0, 0.0),
    )
    .expect("scale 2 is in range");

    let anchors = gauge();
    let projection = projection(1.0);
    let record = projection.open_record(0);
    let fit = live_fit(&anchors, &SNAPSHOT, &SNAPSHOT);
    let mut evidence = EvaluationEvidence::read(
        0,
        &EvidenceReferences {
            anchors: &anchors,
            projection: &projection,
            strata: IdSlice::from_raw(&STRATA),
            record: &record,
        },
        &fit,
        frame(&SNAPSHOT),
        frame(&SNAPSHOT),
    )
    .expect("the identity fixture reads");

    evidence.gauge_similarity = gauge_similarity;
    evidence.corpus_similarity = Similarity::IDENTITY;

    let bridge = bridge(&evidence).expect("the composition is in range");
    assert_eq!(bridge.scale().get(), 0.5);
    assert_eq!(bridge.apply(Vec2::new(4.0, -2.0)), Vec2::new(2.0, -1.0));
}
