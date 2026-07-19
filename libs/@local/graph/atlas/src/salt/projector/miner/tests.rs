//! Certificates for the hard-negative miner: exhaustive set-algebra
//! agreement with a brute-force reference, dyadic rank weights, honest
//! short sets, channel-correct protection vetoes, max-weight pooling,
//! and determinism.

#![expect(
    clippy::float_cmp,
    reason = "fixture coordinates are small integers, so squared distances and dyadic rank \
              weights are exact in both the reference and the kd-tree path"
)]

use core::num::NonZero;

use super::{HardNegativeMiner, MinedFrame, MinerOptions, SpatialField, SpatialFieldError};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    salt::{
        policy::ClassProbabilities,
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::AttractionOptions,
            protection::{ChannelConfig, ProtectionConfig, ProtectionView},
        },
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

fn nonzero(value: usize) -> NonZero<usize> {
    NonZero::new(value).expect("test counts are nonzero")
}

fn options(neighbors: usize, margin: usize, maximum_weight: f32, exponent: f32) -> MinerOptions {
    MinerOptions::new(
        nonzero(neighbors),
        nonzero(margin),
        maximum_weight,
        exponent,
    )
    .expect("test options are valid")
}

/// Builds a symmetric semantic graph from undirected weighted edges.
fn semantic_graph(rows: usize, edges: &[(usize, usize, f32)]) -> SemanticGraph {
    let mut adjacency = vec![Vec::new(); rows];
    for &(one, other, weight) in edges {
        adjacency[one].push((other, weight));
        adjacency[other].push((one, weight));
    }
    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut weights = Vec::new();
    for row in &mut adjacency {
        row.sort_unstable_by_key(|&(column, _)| column);
        for &(column, weight) in row.iter() {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            weights.push(weight);
        }
        indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
    }
    let matrix = SemanticMatrix::try_new((rows, rows), indptr, columns, weights)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is structurally valid");
    SemanticGraph::new(matrix).expect("the fixture graph is a valid semantic graph")
}

/// A full-Proximal, full-applicability, unit-strength policy.
fn proximal_policy(relation: u64) -> RelationPolicy {
    RelationPolicy {
        relation: OntologyRowId::new(relation),
        attraction: ClassProbabilities {
            coincident: 0.0,
            proximal: 1.0,
        },
        selected: ClassProbabilities {
            coincident: 0.0,
            proximal: 1.0,
        },
        applicability: 1.0,
        strength: 1.0,
    }
}

/// An instance of `relation` between `source` and `target` with the
/// given link confidence (`None` is unscored, the neutral 1).
fn instance(
    edge: u64,
    relation: u64,
    source: u64,
    target: u64,
    link: Option<f32>,
) -> RelationInstance {
    RelationInstance {
        edge: EdgeRowId::new(edge),
        relation: OntologyRowId::new(relation),
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        confidence: RelationConfidence {
            link,
            ..RelationConfidence::default()
        },
    }
}

fn relation_indexes(rows: usize, instances: Vec<RelationInstance>) -> RelationIndexes {
    let mut instances = instances;
    RelationIndexes::build(
        rows,
        Policies::new(&[proximal_policy(0)]).expect("the fixture policies are certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture instances satisfy the input contract")
}

/// A hard channel tripping at the given evidence mass.
fn hard_config(threshold: f32) -> ProtectionConfig {
    ProtectionConfig::new(
        ChannelConfig::new(0.0, threshold).expect("the fixture channel is in domain"),
        ChannelConfig::new(0.0, threshold).expect("the fixture channel is in domain"),
        true,
    )
    .expect("the fixture channels are ordered")
}

/// Eight collinear points at triangular-number positions: every
/// coordinate and squared distance is a small exact integer, and row 2
/// sees rows 0 and 3 at the same distance, exercising the row
/// tie-break.
fn line_frame() -> Vec<Vec2> {
    [0.0_f32, 1.0, 3.0, 6.0, 10.0, 15.0, 21.0, 28.0]
        .into_iter()
        .map(|x| Vec2::new(x, 0.0))
        .collect()
}

/// Brute-force reference: sort every row by `(squared distance, row)`,
/// truncate to the search size, filter the exclusions in order, accept
/// up to the quota with rank weights.
fn reference_mine(
    coordinates: &[Vec2],
    semantic: &SemanticGraph,
    protection: &ProtectionView<'_>,
    config: ProtectionConfig,
    options: MinerOptions,
) -> Vec<Vec<(u32, f32)>> {
    let quota = options.neighbors().get();
    (0..coordinates.len())
        .map(|row| {
            let mut candidates: Vec<(f32, usize)> = (0..coordinates.len())
                .map(|other| (coordinates[row].distance_squared(coordinates[other]), other))
                .collect();
            candidates.sort_unstable_by(
                |(left_distance, left_row), (right_distance, right_row)| {
                    left_distance
                        .total_cmp(right_distance)
                        .then(left_row.cmp(right_row))
                },
            );
            candidates.truncate(options.search_size().min(coordinates.len()));

            let mut accepted = Vec::new();
            for (_, candidate) in candidates {
                if candidate == row {
                    continue;
                }
                let candidate_id = NodeRowId::new(candidate as u64);
                if semantic.view().row(row).any(|edge| edge.id == candidate_id) {
                    continue;
                }
                let pair = crate::salt::relation::protection::NodePair::new(
                    NodeRowId::new(row as u64),
                    candidate_id,
                );
                if protection.judge(pair, config).hard {
                    continue;
                }
                let weight = options.weight(accepted.len());
                accepted.push((
                    u32::try_from(candidate).expect("fixture rows fit u32"),
                    weight,
                ));
                if accepted.len() == quota {
                    break;
                }
            }
            accepted
        })
        .collect()
}

#[test]
fn options_reject_invalid_coefficients() {
    assert!(MinerOptions::new(nonzero(4), nonzero(2), 0.0, 1.0).is_none());
    assert!(MinerOptions::new(nonzero(4), nonzero(2), 1.0, 0.0).is_none());
    assert!(MinerOptions::new(nonzero(4), nonzero(2), f32::NAN, 1.0).is_none());
    assert!(MinerOptions::new(nonzero(4), nonzero(2), 1.0, f32::INFINITY).is_none());
    assert!(MinerOptions::new(nonzero(4), nonzero(2), 1.0, 1.0).is_some());
}

#[test]
fn spatial_field_rejects_non_finite_coordinates() {
    let mut coordinates = line_frame();
    coordinates[3] = Vec2::new(f32::NAN, 0.0);

    assert_eq!(
        SpatialField::new(&coordinates).err(),
        Some(SpatialFieldError::NonFinite { row: 3 }),
    );
}

#[test]
fn mined_rows_match_a_brute_force_reference() {
    let coordinates = line_frame();
    // Semantic edges (0, 1) and (2, 3); links (4, 5) at full mass
    // (hard-protected at threshold 0.5) and (1, 2) at mass 0.25
    // (linked but minable).
    let semantic = semantic_graph(8, &[(0, 1, 0.5), (2, 3, 1.0)]);
    let indexes = relation_indexes(
        8,
        vec![instance(0, 0, 4, 5, None), instance(1, 0, 1, 2, Some(0.25))],
    );
    let config = hard_config(0.5);
    let options = options(3, 2, 1.0, 1.0);

    let field = SpatialField::new(&coordinates).expect("the fixture frame is finite");
    let miner = HardNegativeMiner::new(semantic.view(), indexes.protection.view(), config, options);
    let mined = miner.mine(&field);

    let reference = reference_mine(
        &coordinates,
        &semantic,
        &indexes.protection.view(),
        config,
        options,
    );

    assert_eq!(mined.rows(), 8);
    for (row, expected) in reference.iter().enumerate() {
        let actual: Vec<_> = mined
            .row(row)
            .map(|(pair, weight)| {
                let target = if pair.first().usize() == row {
                    pair.second()
                } else {
                    pair.first()
                };
                (
                    u32::try_from(target.get()).expect("fixture rows fit u32"),
                    weight,
                )
            })
            .collect();
        assert_eq!(actual, *expected, "row {row}");

        // Every weight satisfies the bounded rank-weight contract.
        for &(_, weight) in expected {
            assert!(weight > 0.0);
            assert!(weight <= options.maximum_weight());
        }
    }

    // Spot contracts on top of the reference agreement: nothing mines
    // itself, the hard-protected pair is vetoed, the weakly linked
    // pair and the semantic edge behave by their own evidence.
    for row in 0..8_usize {
        assert!(
            mined
                .row(row)
                .all(|(pair, _)| { pair.first().usize() != pair.second().usize() })
        );
    }
    assert!(mined.row(4).all(|(pair, _)| pair.second().usize() != 5));
    assert!(mined.row(5).all(|(pair, _)| pair.first().usize() != 4));
    assert!(mined.row(1).any(|(pair, _)| pair.second().usize() == 2));
    assert!(mined.row(1).all(|(pair, _)| pair.first().usize() != 0));
}

#[test]
fn rank_weights_are_dyadic_at_unit_exponent() {
    // Five points, no exclusions: row 0 fills its quota of four, and
    // the unit-exponent weights are exactly 1, 3/4, 1/2, 1/4.
    let coordinates = line_frame()[..5].to_vec();
    let semantic = semantic_graph(5, &[]);
    let indexes = relation_indexes(5, Vec::new());
    let options = options(4, 2, 1.0, 1.0);

    let field = SpatialField::new(&coordinates).expect("the fixture frame is finite");
    let miner = HardNegativeMiner::new(
        semantic.view(),
        indexes.protection.view(),
        hard_config(0.5),
        options,
    );
    let mined = miner.mine(&field);

    let weights: Vec<f32> = mined.row(0).map(|(_, weight)| weight).collect();
    assert_eq!(weights, [1.0, 0.75, 0.5, 0.25]);
}

#[test]
fn fully_explained_neighbourhoods_yield_honest_short_sets() {
    // Row 0's every candidate is a semantic edge: the honest result is
    // an empty set, not farther candidates at inflated rank weights.
    let coordinates = line_frame()[..4].to_vec();
    let semantic = semantic_graph(4, &[(0, 1, 0.5), (0, 2, 0.5), (0, 3, 0.5)]);
    let indexes = relation_indexes(4, Vec::new());

    let field = SpatialField::new(&coordinates).expect("the fixture frame is finite");
    let miner = HardNegativeMiner::new(
        semantic.view(),
        indexes.protection.view(),
        hard_config(0.5),
        options(3, 1, 1.0, 1.0),
    );
    let mined = miner.mine(&field);

    assert_eq!(mined.row(0).len(), 0);
    // The other rows still mine their own admissible neighbours.
    assert!(mined.row(3).len() > 0);
}

#[test]
fn mining_is_deterministic() {
    let coordinates = line_frame();
    let semantic = semantic_graph(8, &[(0, 1, 0.5)]);
    let indexes = relation_indexes(8, vec![instance(0, 0, 4, 5, None)]);
    let options = options(3, 2, 1.0, 1.0);

    let field = SpatialField::new(&coordinates).expect("the fixture frame is finite");
    let miner = HardNegativeMiner::new(
        semantic.view(),
        indexes.protection.view(),
        hard_config(0.5),
        options,
    );

    assert_eq!(miner.mine(&field), miner.mine(&field));
}

#[test]
fn pooled_frames_keep_the_maximum_weight() {
    // Row 0: target 2 mined in both frames (weights 0.5 and 0.25) and
    // target 1 mined only in the second; row 1 mined only in the
    // first. Pooled rows order by ascending target.
    let first = MinedFrame {
        offsets: vec![0, 1, 2].into_boxed_slice(),
        targets: vec![2, 0].into_boxed_slice(),
        weights: vec![0.5, 1.0].into_boxed_slice(),
    };
    let second = MinedFrame {
        offsets: vec![0, 2, 2].into_boxed_slice(),
        targets: vec![2, 1].into_boxed_slice(),
        weights: vec![0.25, 1.0].into_boxed_slice(),
    };

    let pooled = first.pool(&second);

    assert_eq!(pooled.rows(), 2);
    let row: Vec<_> = pooled.row(0).collect();
    assert_eq!(row.len(), 2);
    assert_eq!(row[0].0.second().get(), 1);
    assert_eq!(row[0].1, 1.0);
    assert_eq!(row[1].0.second().get(), 2);
    assert_eq!(row[1].1, 0.5);
    let row: Vec<_> = pooled.row(1).collect();
    assert_eq!(row.len(), 1);
    assert_eq!(row[0].1, 1.0);

    // Pooling is symmetric in everything but tie provenance.
    assert_eq!(first.pool(&second), second.pool(&first));
}
