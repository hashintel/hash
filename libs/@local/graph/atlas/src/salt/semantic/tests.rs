#![expect(
    clippy::float_cmp,
    reason = "symmetry is bit-exact by construction and saturated memberships are exactly one; \
              both are contracts, not coincidences"
)]

use core::{assert_matches, simd::f32x8};
use std::collections::HashMap;

use hashql_core::id::Id as _;
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    SemanticGraph, SemanticMatrix, SemanticValidationError, SmoothingOptions, bandwidth::RowSolver,
};
use crate::{
    file::{WriteInto as _, sprs::read::SprsFile},
    identity::NodeRowId,
    math::{NonNegative, kernel::exp_f32x8, non_negative},
    salt::knn::table::{Knn, KnnMatrix},
};

fn options() -> SmoothingOptions {
    SmoothingOptions { .. }
}

/// Builds a validated k-NN table from uniform per-row neighbour lists.
fn knn_from_rows(rows: &[Vec<(u32, NonNegative)>]) -> Knn<NodeRowId> {
    let count = rows.len();
    let neighbours = rows[0].len();
    let mut indices = Vec::with_capacity(count * neighbours);
    let mut distances = Vec::with_capacity(count * neighbours);
    for row in rows {
        assert_eq!(row.len(), neighbours, "the fixture rows must be uniform");
        for &(column, distance) in row {
            indices.push(column);
            distances.push(distance);
        }
    }

    let indptr: Vec<u64> = (0..=count).map(|row| (row * neighbours) as u64).collect();
    let matrix = KnnMatrix::try_new((count, count), indptr, indices, distances)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture is structurally valid");
    Knn::new(matrix).expect("the fixture satisfies the table invariants")
}

/// Brute-force cosine k-NN over random points on the unit circle arc.
fn random_knn(rows: usize, neighbours: usize, seed: u64) -> Knn<NodeRowId> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    let points: Vec<[f32; 2]> = core::iter::repeat_with(|| {
        let angle = rng.random::<f32>() * core::f32::consts::FRAC_PI_2;
        [angle.cos(), angle.sin()]
    })
    .take(rows)
    .collect();

    let table: Vec<Vec<(u32, NonNegative)>> = (0..rows)
        .map(|row| {
            let mut candidates: Vec<(u32, NonNegative)> = (0..rows)
                .filter(|&other| other != row)
                .map(|other| {
                    let dot =
                        points[row][0].mul_add(points[other][0], points[row][1] * points[other][1]);
                    let column = u32::try_from(other).expect("fixture rows fit u32");
                    let distance = NonNegative::new((1.0 - dot).max(0.0))
                        .expect("a clamped unit-circle cosine distance is finite and non-negative");
                    (column, distance)
                })
                .collect();
            candidates.sort_unstable_by(|&(left_column, left), &(right_column, right)| {
                left.cmp(&right).then(left_column.cmp(&right_column))
            });
            candidates.truncate(neighbours);
            candidates.sort_unstable_by_key(|&(column, _)| column);
            candidates
        })
        .collect();

    knn_from_rows(&table)
}

/// The scalar fuzzy-weight reference.
///
/// The smooth-kNN kernel with libm exponentials, keyed by directed edge.
#[expect(
    clippy::suboptimal_flops,
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "the reference deliberately mirrors the naive scalar kernel, independent of the SIMD \
              path under test"
)]
fn scalar_reference(
    knn: &Knn<NodeRowId>,
    options: &SmoothingOptions,
) -> HashMap<(usize, usize), f32> {
    let view = knn.view();
    let rows = view.rows();
    let neighbours = view.neighbours();
    let target = (neighbours as f64).log2();

    let all_distances: Vec<f32> = (0..rows)
        .flat_map(|row| {
            view.row(NodeRowId::from_usize(row))
                .map(|neighbour| neighbour.distance.get())
        })
        .collect();
    let corpus_mean = (all_distances
        .iter()
        .map(|&distance| f64::from(distance))
        .sum::<f64>()
        / all_distances.len() as f64) as f32;

    let mut directed = HashMap::new();
    for row in 0..rows {
        let distances: Vec<f32> = view
            .row(NodeRowId::from_usize(row))
            .map(|neighbour| neighbour.distance.get())
            .collect();
        let rho = distances
            .iter()
            .copied()
            .filter(|&distance| distance > 0.0)
            .fold(f32::INFINITY, f32::min);
        let rho = if rho.is_finite() { rho } else { 0.0 };

        let mut low = 0.0_f32;
        let mut high = f32::MAX;
        let mut sigma = 1.0_f32;
        for _ in 0..options.bisection_iterations {
            let sum: f64 = distances
                .iter()
                .map(|&distance| {
                    let adjusted = distance - rho;
                    if adjusted > 0.0 {
                        f64::from((-adjusted / sigma).exp())
                    } else {
                        1.0
                    }
                })
                .sum();
            if (sum - target).abs() < options.tolerance {
                break;
            }
            if sum > target {
                high = sigma;
                sigma = f32::midpoint(low, high);
            } else {
                low = sigma;
                sigma = if high == f32::MAX {
                    sigma * 2.0
                } else {
                    f32::midpoint(low, high)
                };
            }
        }

        let row_mean = distances.iter().sum::<f32>() / distances.len() as f32;
        let sigma =
            sigma.max(options.bandwidth_floor * if rho > 0.0 { row_mean } else { corpus_mean });

        for neighbour in view.row(NodeRowId::from_usize(row)) {
            let adjusted = neighbour.distance.get() - rho;
            let membership = if adjusted > 0.0 {
                (-adjusted / sigma).exp().max(f32::MIN_POSITIVE)
            } else {
                1.0
            };
            directed.insert((row, neighbour.id.as_usize()), membership);
        }
    }

    let mut union = HashMap::new();
    for (&(row, column), &forward) in &directed {
        let reverse = directed.get(&(column, row)).copied().unwrap_or(0.0);
        union.insert(
            (row, column),
            ((forward + reverse) - forward * reverse).min(1.0),
        );
        union.insert(
            (column, row),
            ((reverse + forward) - reverse * forward).min(1.0),
        );
    }

    union
}

#[test]
#[expect(
    clippy::cast_precision_loss,
    reason = "the fixture length is far below exact f64 integer precision"
)]
fn calibration_solves_the_membership_sum_equation() {
    let distances = [
        non_negative!(0.05),
        non_negative!(0.11),
        non_negative!(0.18),
        non_negative!(0.21),
        non_negative!(0.33),
        non_negative!(0.4),
        non_negative!(0.52),
        non_negative!(0.61),
    ];
    let target = (distances.len() as f64).log2();

    let mut solver = RowSolver::new(distances.len());
    let bandwidth = solver.calibrate(&distances, target, 1.0, &options());

    // The defining equation, recomputed through scalar libm.
    let sum: f64 = distances
        .iter()
        .map(|&distance| {
            f64::from(((-(distance.get() - bandwidth.rho).max(0.0)) / bandwidth.sigma).exp())
        })
        .sum();
    assert!(
        (sum - target).abs() < 1e-3,
        "memberships sum to {sum} against the target {target}",
    );
    assert_eq!(bandwidth.rho, 0.05);
}

#[test]
fn calibration_ignores_zero_distances_for_the_radius() {
    let distances = [
        NonNegative::ZERO,
        NonNegative::ZERO,
        non_negative!(0.3),
        non_negative!(0.5),
    ];
    let mut solver = RowSolver::new(distances.len());
    let bandwidth = solver.calibrate(&distances, 2.0, 1.0, &options());

    assert_eq!(bandwidth.rho, 0.3);
}

#[test]
fn duplicate_rows_saturate_at_full_membership() {
    let distances = [NonNegative::ZERO; 4];
    let mut solver = RowSolver::new(distances.len());
    let bandwidth = solver.calibrate(&distances, 2.0, 0.25, &options());

    // No positive distance: the floor scales from the fallback.
    assert_eq!(bandwidth.rho, 0.0);
    assert_eq!(bandwidth.sigma, options().bandwidth_floor * 0.25);

    let mut memberships = [0.0_f32; 4];
    solver.memberships(bandwidth, &mut memberships);
    assert_eq!(memberships, [1.0; 4]);
}

/// The SIMD row pipeline matches the membership definition lane for lane.
///
/// The scalar oracle routes through the same vendored kernel, so agreement is bit-exact: the pin
/// covers the padded tail lanes (partial, exact, and full-plus-partial chunks), the ρ subtraction
/// with its zero clamp, the membership floor, and same-length solver reuse.
#[test]
#[expect(
    clippy::cast_precision_loss,
    reason = "the fixture lengths are far below exact f64 integer precision"
)]
fn simd_rows_match_the_scalar_definition_lane_for_lane() {
    for neighbours in [1_usize, 3, 7, 8, 9, 15, 16, 17] {
        let distances: Vec<NonNegative> = (0..neighbours)
            .map(|slot| {
                if slot.is_multiple_of(3) {
                    NonNegative::ZERO
                } else {
                    NonNegative::new(0.05 * slot as f32)
                        .expect("a small positive multiple is finite and non-negative")
                }
            })
            .collect();
        let target = (neighbours as f64).log2().max(1.0);

        let mut solver = RowSolver::new(neighbours);
        // A first calibration over reversed distances, so the checked row
        // reuses scratch another row has written.
        let reversed: Vec<NonNegative> = distances.iter().rev().copied().collect();
        solver.calibrate(&reversed, target, 0.5, &options());

        let bandwidth = solver.calibrate(&distances, target, 0.5, &options());
        let mut memberships = vec![0.0_f32; neighbours];
        solver.memberships(bandwidth, &mut memberships);

        for (slot, (&distance, &membership)) in distances.iter().zip(&memberships).enumerate() {
            let adjusted = (distance.get() - bandwidth.rho).max(0.0);
            let expected = exp_f32x8(f32x8::splat(-(adjusted / bandwidth.sigma))).to_array()[0]
                .max(f32::MIN_POSITIVE);
            assert_eq!(
                membership, expected,
                "lane {slot} of a {neighbours}-neighbour row",
            );
        }
    }
}

#[test]
fn agrees_with_the_scalar_reference() {
    let knn = random_knn(48, 4, 7);
    let graph = SemanticGraph::build(&knn.view(), options());
    let reference = scalar_reference(&knn, &options());

    let view = graph.view();
    let mut compared = 0;
    for row in 0..view.rows() {
        for edge in view.row(NodeRowId::from_usize(row)) {
            let expected = reference
                .get(&(row, edge.id.as_usize()))
                .expect("every built edge appears in the reference union");
            assert!(
                (edge.weight.get() - f64::from(*expected)).abs() <= 1e-4,
                "edge ({row}, {}): built {} vs reference {expected}",
                edge.id.as_u64(),
                edge.weight,
            );
            compared += 1;
        }
    }
    assert_eq!(compared, view.entries());
    assert_eq!(compared, reference.len());
}

#[test]
fn every_edge_is_stored_twice_with_equal_weight() {
    let graph = SemanticGraph::build(&random_knn(32, 3, 11).view(), options());
    let view = graph.view();

    for row in 0..view.rows() {
        for edge in view.row(NodeRowId::from_usize(row)) {
            assert_ne!(edge.id.as_usize(), row);
            assert!(edge.weight > 0.0 && edge.weight <= 1.0);

            let reverse = view
                .row(edge.id)
                .find(|reverse| reverse.id.as_usize() == row)
                .expect("every edge is stored in both rows");
            assert_eq!(reverse.weight, edge.weight);
        }
    }
}

#[test]
fn union_support_covers_every_directed_edge() {
    let knn = random_knn(24, 3, 13);
    let graph = SemanticGraph::build(&knn.view(), options());
    let view = graph.view();

    for row in 0..knn.rows() {
        for neighbour in knn.view().row(NodeRowId::from_usize(row)) {
            assert!(
                view.row(NodeRowId::from_usize(row))
                    .any(|edge| edge.id.as_usize() == neighbour.id.as_usize()),
                "the directed edge ({row}, {}) is missing from the union",
                neighbour.id.as_u64(),
            );
        }
    }
}

#[test]
fn one_sided_edges_keep_their_directed_membership() {
    // Row 2 is nobody's neighbour: both of its edges are one-sided, so
    // their union weights equal its directed memberships, which the
    // scalar reference computes independently.
    let knn = knn_from_rows(&[
        vec![(1, non_negative!(0.1)), (3, non_negative!(0.2))],
        vec![(0, non_negative!(0.1)), (3, non_negative!(0.3))],
        vec![(0, non_negative!(0.4)), (1, non_negative!(0.5))],
        vec![(0, non_negative!(0.2)), (1, non_negative!(0.3))],
    ]);
    let graph = SemanticGraph::build(&knn.view(), options());
    let reference = scalar_reference(&knn, &options());

    let view = graph.view();
    for edge in view.row(NodeRowId::new(2)) {
        let expected = reference[&(2, edge.id.as_usize())];
        assert!(
            (edge.weight.get() - f64::from(expected)).abs() <= 1e-4,
            "one-sided edge (2, {}): built {} vs reference {expected}",
            edge.id.as_u64(),
            edge.weight,
        );
    }
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through machinery Miri cannot execute"
)]
fn published_graph_reopens_mapped() {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-semantic-artifact-{}",
        std::process::id(),
    ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let graph = SemanticGraph::build(&random_knn(16, 3, 17).view(), options());

    let mut bytes = Vec::new();
    let digest = graph
        .write_into(&mut bytes)
        .expect("writing to a buffer succeeds");
    let path = dir.join("semantic.sprs");
    std::fs::write(&path, &bytes).expect("the graph file writes");

    let mapped = super::artifact::SemanticGraphArchive::<NodeRowId>::new(
        SprsFile::open(&path).expect("the published file reopens"),
    )
    .expect("the published file opens as a semantic graph");

    let owned = graph.view();
    let reopened = mapped.view();
    assert_eq!(reopened.rows(), owned.rows());
    assert_eq!(reopened.entries(), owned.entries());
    for row in 0..owned.rows() {
        let row = NodeRowId::from_usize(row);
        let owned_row: Vec<(u64, f64)> = owned
            .row(row)
            .map(|edge| (edge.id.as_u64(), edge.weight.get()))
            .collect();
        let reopened_row: Vec<(u64, f64)> = reopened
            .row(row)
            .map(|edge| (edge.id.as_u64(), edge.weight.get()))
            .collect();
        assert_eq!(owned_row, reopened_row);
    }

    let mut hasher = crate::integrity::Sha256::new();
    crate::integrity::Update::update(&mut hasher, &bytes);
    assert_eq!(digest, hasher.finalize());
}

fn symmetric_pair(weight_forward: f32, weight_reverse: f32) -> SemanticMatrix {
    SemanticMatrix::try_new(
        (2, 2),
        vec![0, 1, 2],
        vec![1, 0],
        vec![weight_forward, weight_reverse],
    )
    .map_err(|(_, _, _, error)| error)
    .expect("the pair matrix is structurally valid")
}

#[test]
fn validation_rejects_invariant_violations() {
    assert_eq!(
        SemanticGraph::<NodeRowId>::new(symmetric_pair(0.5, 0.25))
            .expect_err("the invariant violation must be rejected"),
        SemanticValidationError::AsymmetricWeight {
            row: 0,
            column: 1,
            forward: 0.5,
            reverse: 0.25,
        },
    );

    assert_eq!(
        SemanticGraph::<NodeRowId>::new(symmetric_pair(1.5, 1.5))
            .expect_err("the invariant violation must be rejected"),
        SemanticValidationError::WeightOutOfRange {
            row: 0,
            column: 1,
            weight: 1.5,
        },
    );

    assert_matches!(
        SemanticGraph::<NodeRowId>::new(symmetric_pair(f32::NAN, 0.5))
            .expect_err("the invariant violation must be rejected"),
        SemanticValidationError::NonFiniteWeight {
            row: 0,
            column: 1,
            ..
        },
    );

    let self_edge = SemanticMatrix::try_new((2, 2), vec![0, 1, 1], vec![0], vec![0.5])
        .map_err(|(_, _, _, error)| error)
        .expect("the self-edge matrix is structurally valid");
    assert_eq!(
        SemanticGraph::<NodeRowId>::new(self_edge)
            .expect_err("the invariant violation must be rejected"),
        SemanticValidationError::SelfEdge { row: 0 },
    );

    let one_sided = SemanticMatrix::try_new((2, 2), vec![0, 1, 1], vec![1], vec![0.5])
        .map_err(|(_, _, _, error)| error)
        .expect("the one-sided matrix is structurally valid");
    assert_eq!(
        SemanticGraph::<NodeRowId>::new(one_sided)
            .expect_err("the invariant violation must be rejected"),
        SemanticValidationError::AsymmetricSupport { row: 0, column: 1 },
    );
}

#[test]
fn validation_rejects_degenerate_domains() {
    let single = SemanticMatrix::try_new((1, 1), vec![0, 0], vec![], vec![])
        .map_err(|(_, _, _, error)| error)
        .expect("the single-row matrix is structurally valid");
    assert_eq!(
        SemanticGraph::<NodeRowId>::new(single)
            .expect_err("the invariant violation must be rejected"),
        SemanticValidationError::InsufficientRows { rows: 1 },
    );
}
