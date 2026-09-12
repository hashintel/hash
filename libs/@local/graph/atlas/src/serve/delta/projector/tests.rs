use core::num::NonZero;

use hashql_core::id::IdSlice;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    DeltaProjector, ForwardIndex, Position, ProjectionError, ProjectorError, ProjectorScratch,
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::Device,
    identity::NodeRowId,
    math::{Bounds2, MatrixN, NonNegative, Rotation, Similarity, Vec2, nz, positive},
    salt::projector::{
        model::{Architecture, NodeRole, Projector},
        train::{NodeColumns, refresh},
    },
};

pub(crate) fn projector(alignment: Option<Similarity>) -> DeltaProjector {
    let device = Device::Cpu.pin(0).resolve();
    let architecture = Architecture {
        width: nz!(8),
        residual_blocks: nz!(1),
        representation_dimensions: nz!(PROJECTOR_DIMENSIONS),
        role_dimensions: nz!(4),
        condition_dimensions: nz!(1),
    };

    DeltaProjector {
        model: Projector::new(architecture, &device, Xoshiro256PlusPlus::seed_from_u64(7)),
        device,
        condition: NonNegative::ZERO,
        alignment,
        world: Bounds2::new(Vec2::splat(-100.0), Vec2::splat(100.0))
            .expect("should have ordered finite bounds"),
        forward_rows: NonZero::new(64).expect("should have a non-zero forward bound"),
        scratch: ProjectorScratch::new(),
    }
}

fn representations(count: usize) -> MatrixN<PROJECTOR_DIMENSIONS> {
    let mut inputs = MatrixN::zeroed(count);
    for (axis, row) in (0..PROJECTOR_DIMENSIONS).cycle().zip(inputs.rows_mut()) {
        row.as_array_mut()[axis] = 1.0;
    }
    inputs
}

#[test]
fn position_non_finite() {
    assert_eq!(
        Position::new(Vec2::ZERO).map(Position::get),
        Some(Vec2::ZERO)
    );
    for value in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
        assert!(Position::new(Vec2::new(value, 0.0)).is_none());
        assert!(Position::new(Vec2::new(0.0, value)).is_none());
    }
}

#[test]
fn forward_chunk_boundaries() {
    let inputs = representations(ProjectorScratch::CHUNK_SIZE * 2 + 1);
    let alignment = Similarity::new(
        positive!(2.0),
        Rotation::from_radians(0.5),
        Vec2::new(3.0, -4.0),
    )
    .expect("should have a valid similarity");
    let mut projector = projector(Some(alignment));
    let roles = vec![NodeRole::KnowledgeEntity; inputs.rows().len()];
    let columns: NodeColumns<'_, ForwardIndex> = NodeColumns {
        representations: IdSlice::from_raw(inputs.rows()),
        roles: IdSlice::from_raw(&roles),
    };
    let expected = refresh::forward(
        &projector.model,
        columns,
        projector.condition,
        projector.forward_rows,
        &projector.device,
    )
    .expect("should project the reference rows");
    let actual: Vec<_> = projector
        .forward(inputs.rows())
        .try_collect()
        .expect("should project all chunks");
    assert_eq!(actual.len(), inputs.rows().len());
    for (&actual, &expected) in actual.iter().zip(expected.iter()) {
        assert!(
            actual
                .get()
                .distance_squared_wide(alignment.apply(expected))
                < 1e-10
        );
    }
}

#[test]
fn forward_empty_and_reused() {
    let mut projector = projector(None);
    let inputs = representations(ProjectorScratch::CHUNK_SIZE + 1);
    let first: Vec<_> = projector
        .forward(inputs.rows())
        .try_collect()
        .expect("should project the initial batch");
    let short: Vec<_> = projector
        .forward(&inputs.rows()[..1])
        .try_collect()
        .expect("should project a short batch");
    assert_eq!(short.len(), 1);
    assert!(short[0].get().distance_squared_wide(first[0].get()) < 1e-10);
    assert_eq!(projector.forward(&inputs.rows()[..0]).len(), 0);
}

#[test]
fn forward_non_finite_rows() {
    let alignment = Similarity::new(positive!(2.0), Rotation::IDENTITY, Vec2::new(3.0, -4.0))
        .expect("should have a valid similarity");
    let mut projector = projector(Some(alignment));
    let mut inputs = representations(ProjectorScratch::CHUNK_SIZE * 2 + 1);
    let reference: Vec<_> = projector
        .forward(inputs.rows())
        .try_collect()
        .expect("should project finite inputs");
    let offenders = [1, ProjectorScratch::CHUNK_SIZE + 3];
    for row in offenders {
        inputs.rows_mut()[row].as_array_mut()[0] = f32::NAN;
    }
    let actual: Vec<_> = projector.forward(inputs.rows()).collect();
    assert_eq!(actual.len(), inputs.rows().len());
    for (row, result) in actual.into_iter().enumerate() {
        if offenders.contains(&row) {
            assert_eq!(result, Err(ProjectionError::NonFiniteProjection));
        } else {
            assert!(
                result
                    .expect("should retain finite rows")
                    .get()
                    .distance_squared_wide(reference[row].get())
                    < 1e-10
            );
        }
    }
    projector
        .forward(&inputs.rows()[..1])
        .next()
        .expect("should return one row")
        .expect("should project a finite row after a mixed batch");
}

#[test]
fn forward_alignment_overflow() {
    let mut projector = projector(None);
    let inputs = representations(1);
    let point = projector
        .forward(inputs.rows())
        .next()
        .expect("should return one row")
        .expect("should project a finite point")
        .get();
    assert!(point.x().abs().max(point.y().abs()) > 1e-3);
    projector.alignment = Some(
        Similarity::new(
            positive!(1e37),
            Rotation::IDENTITY,
            Vec2::new(f32::MAX.copysign(point.x()), f32::MAX.copysign(point.y())),
        )
        .expect("should accept a finite similarity with a normal reciprocal"),
    );
    assert_eq!(
        projector.forward(inputs.rows()).next(),
        Some(Err(ProjectionError::NonFiniteAlignment))
    );
}

#[test]
fn project_world_bounds() {
    let mut projector = projector(None);
    let inputs = representations(3);
    let positions: Vec<_> = projector
        .forward(inputs.rows())
        .try_collect()
        .expect("should project finite points");
    let point = positions[0].get();
    projector.world = Bounds2::new(point, point).expect("should accept a point-sized world");
    let actual: Vec<_> = projector.project(inputs.rows()).collect();
    assert_eq!(actual.len(), 3);
    assert_eq!(actual[0], Ok(positions[0]));
    for (&position, result) in positions.iter().zip(actual) {
        if position.get() == point {
            assert_eq!(result, Ok(position));
        } else {
            assert_eq!(
                result,
                Err(ProjectionError::OutOfBounds {
                    global: position.get()
                })
            );
        }
    }
    assert!(positions.iter().any(|position| position.get() != point));
}

#[test]
fn roundtrip_column_lengths() {
    let mut projector = projector(None);
    for (representations_len, coordinates_len) in [(0, 0), (1, 0), (0, 1), (2, 1), (1, 2)] {
        let inputs = representations(representations_len);
        let coordinates = vec![Vec2::ZERO; coordinates_len];
        let report = projector
            .try_roundtrip_sample_impl(
                IdSlice::from_raw(inputs.rows()),
                IdSlice::from_raw(&coordinates),
            )
            .expect_err("should refuse empty or mismatched columns");
        assert!(
            matches!(report.current_context(), ProjectorError::InvalidSampleCorpus { representations, coordinates }
            if *representations == representations_len && *coordinates == coordinates_len)
        );
    }
}

#[test]
fn roundtrip_non_finite_coordinate() {
    let mut projector = projector(None);
    let inputs = representations(2);
    let coordinates = [Vec2::ZERO, Vec2::new(f32::NAN, 0.0)];
    let report = projector
        .try_roundtrip_sample_impl(
            IdSlice::from_raw(inputs.rows()),
            IdSlice::from_raw(&coordinates),
        )
        .expect_err("should refuse a non-finite published point");
    assert!(
        matches!(report.current_context(), ProjectorError::NonFiniteCoordinates { row } if *row == NodeRowId::new(1))
    );
}

#[test]
fn roundtrip_aligned_sample() {
    let mut projector = projector(Some(
        Similarity::new(positive!(2.0), Rotation::IDENTITY, Vec2::new(3.0, -4.0))
            .expect("should have a valid similarity"),
    ));
    let inputs = representations(ProjectorScratch::CHUNK_SIZE * 2 + 1);
    let coordinates: Vec<_> = projector
        .forward(inputs.rows())
        .map(|result| result.map(Position::get))
        .try_collect()
        .expect("should project sample coordinates");
    projector
        .try_roundtrip_sample_impl(
            IdSlice::from_raw(inputs.rows()),
            IdSlice::from_raw(&coordinates),
        )
        .expect("should reproduce aligned sample coordinates");
}

#[test]
fn roundtrip_tolerance_exceeded() {
    let mut projector = projector(None);
    let inputs = representations(1);
    let point = projector
        .forward(inputs.rows())
        .next()
        .expect("should return one row")
        .expect("should project a finite point")
        .get();
    let coordinates = [point + Vec2::new(0.01, 0.0)];
    let report = projector
        .try_roundtrip_sample_impl(
            IdSlice::from_raw(inputs.rows()),
            IdSlice::from_raw(&coordinates),
        )
        .expect_err("should refuse a changed published point");
    assert!(
        matches!(report.current_context(), ProjectorError::RoundtripSampleToleranceExceeded { tolerance, error }
        if error >= tolerance)
    );
}

#[test]
fn roundtrip_non_finite_projection() {
    let mut projector = projector(None);
    let mut inputs = representations(1);
    inputs.rows_mut()[0].as_array_mut()[0] = f32::INFINITY;
    let report = projector
        .try_roundtrip_sample_impl(
            IdSlice::from_raw(inputs.rows()),
            IdSlice::from_raw(&[Vec2::ZERO]),
        )
        .expect_err("should refuse a non-finite sample projection");
    assert!(matches!(
        report.current_context(),
        ProjectorError::RoundtripSampleForward
    ));
    assert_eq!(
        report.downcast_ref::<ProjectionError>(),
        Some(&ProjectionError::NonFiniteProjection)
    );
}
