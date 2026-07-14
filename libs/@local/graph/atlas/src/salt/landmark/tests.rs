use std::num::NonZeroUsize;

use super::{
    LandmarkCandidate, LandmarkConfig, LandmarkError, Stratum, StratumDimension, SubgroupMinimum,
    select_landmarks,
};
use crate::salt::identity::GenerationRowId;

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
