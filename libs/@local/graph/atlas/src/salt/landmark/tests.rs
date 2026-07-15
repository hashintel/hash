use std::num::NonZeroUsize;

use super::{
    LandmarkCandidate, LandmarkConfig, LandmarkError, LandmarkFitConfig, Stratum, StratumDimension,
    SubgroupMinimum, assign_landmarks, fit_landmark_skeleton, select_landmarks,
};
use crate::salt::{
    graph::{KnnTable, ProjectorEmbeddings, SemanticEdgeWeights, USearchConfig},
    identity::GenerationRowId,
    representation::PROJECTOR_DIMENSIONS,
};

#[test]
fn subgroup_minimums_precede_retention_without_exceeding_capacity() {
    let candidates = (0..10).map(candidate).collect::<Vec<_>>();
    let rare_source = Stratum {
        dimension: StratumDimension::Source,
        value: 9,
    };
    let selection = select_landmarks(
        &candidates,
        config(4),
        &[SubgroupMinimum {
            stratum: rare_source,
            count: NonZeroUsize::new(2).expect("minimum should be non-zero"),
        }],
    )
    .expect("selection should be feasible");

    assert!(selection.rows().contains(&row(8)));
    assert!(selection.rows().contains(&row(9)));
    assert_eq!(selection.retained_count(), 2);
}

#[test]
fn selection_and_hash_are_independent_of_input_order() {
    let candidates = (0..20).map(candidate).collect::<Vec<_>>();
    let forward = select_landmarks(&candidates, config(7), &[]).expect("selection should succeed");
    let mut reversed_candidates = candidates;
    reversed_candidates.reverse();
    let reversed =
        select_landmarks(&reversed_candidates, config(7), &[]).expect("selection should succeed");

    assert_eq!(forward.rows(), reversed.rows());
    assert_eq!(forward.content_hash(), reversed.content_hash());
}

#[test]
fn impossible_subgroup_minimum_reports_observed_availability() {
    let candidates = (0..6).map(candidate).collect::<Vec<_>>();
    let stratum = Stratum {
        dimension: StratumDimension::Community,
        value: 1,
    };

    assert_eq!(
        select_landmarks(
            &candidates,
            config(4),
            &[SubgroupMinimum {
                stratum,
                count: NonZeroUsize::new(2).expect("minimum should be non-zero"),
            }],
        ),
        Err(LandmarkError::InsufficientSubgroup {
            stratum,
            required: 2,
            available: 1,
        })
    );
}

#[test]
fn weighted_priority_can_change_the_selected_row() {
    let mut candidates = (0..8).map(candidate).collect::<Vec<_>>();
    let baseline = select_landmarks(&candidates, config(1), &[]).expect("selection should succeed");
    let favored = candidates
        .iter()
        .position(|candidate| !baseline.rows().contains(&candidate.row))
        .expect("capacity should leave candidates unselected");
    candidates[favored].sampling_weight = 1.0e12;

    let weighted = select_landmarks(&candidates, config(1), &[]).expect("selection should succeed");
    assert_eq!(weighted.rows(), &[candidates[favored].row]);
}

#[test]
fn quotient_skeleton_is_repeatable_and_keeps_selected_self_assignments() {
    let candidates = (0..6).map(candidate).collect::<Vec<_>>();
    let selection =
        select_landmarks(&candidates, config(3), &[]).expect("selection should succeed");
    let mut values = vec![0.0_f32; 6 * PROJECTOR_DIMENSIONS];
    for row in 0..6 {
        let angle = core::f32::consts::TAU * row as f32 / 6.0;
        values[row * PROJECTOR_DIMENSIONS] = angle.cos();
        values[row * PROJECTOR_DIMENSIONS + 1] = angle.sin();
    }
    let embeddings = ProjectorEmbeddings::new(&values).expect("embeddings should validate");
    let mut indices = Vec::new();
    for row in 0..6_u32 {
        let mut neighbors = [(row + 5) % 6, (row + 1) % 6];
        neighbors.sort_unstable();
        indices.extend(neighbors);
    }
    let semantic =
        KnnTable::new(6, 2, indices, vec![0.5; 12]).expect("semantic graph should validate");
    let weights =
        SemanticEdgeWeights::new(&semantic, vec![1.0; 12]).expect("weights should validate");
    let assignment = assign_landmarks(embeddings, selection.rows(), USearchConfig::default())
        .expect("landmarks should assign");
    for (ordinal, selected) in selection.rows().iter().enumerate() {
        assert_eq!(
            assignment.get(*selected),
            u32::try_from(ordinal).expect("ordinal should fit u32")
        );
    }
    let fit_config = LandmarkFitConfig {
        maximum_neighbors: NonZeroUsize::new(2).expect("neighbor count should be non-zero"),
        epochs: NonZeroUsize::new(5).expect("epoch count should be non-zero"),
        initial_learning_rate: 0.5,
        repulsion_strength: 1.0,
        negative_sample_rate: NonZeroUsize::new(2).expect("sample rate should be non-zero"),
        spread: 1.0,
        minimum_distance: 0.1,
        seed: 93,
    };
    let first = fit_landmark_skeleton(&selection, assignment, &semantic, &weights, fit_config)
        .expect("landmark skeleton should fit");
    let second = fit_landmark_skeleton(
        &selection,
        assign_landmarks(embeddings, selection.rows(), USearchConfig::default())
            .expect("landmarks should reassign"),
        &semantic,
        &weights,
        fit_config,
    )
    .expect("landmark skeleton should refit");

    assert_eq!(first.coordinates(), second.coordinates());
    assert_eq!(first.content_hash(), second.content_hash());
    assert!(
        first
            .coordinates()
            .iter()
            .flatten()
            .all(|coordinate| coordinate.is_finite())
    );
}

fn config(maximum_count: usize) -> LandmarkConfig {
    LandmarkConfig {
        maximum_count: NonZeroUsize::new(maximum_count).expect("capacity should be non-zero"),
        retained_fraction: 0.5,
        seed: 0xD3A5_91C7_2F04_8B6E,
    }
}

fn candidate(index: u32) -> LandmarkCandidate {
    LandmarkCandidate {
        row: row(index),
        sampling_weight: 1.0,
        density: index % 3,
        language: index % 2,
        source: if index >= 8 { 9 } else { 0 },
        entity_role: index % 2,
        type_family: index % 4,
        community: if index == 5 { 1 } else { 0 },
        temporal_cohort: index % 3,
        prior_landmark: index < 2,
    }
}

fn row(index: u32) -> GenerationRowId {
    GenerationRowId::from_u32(index).expect("fixture row should be valid")
}
