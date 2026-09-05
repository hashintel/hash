//! Every observation folded into the model, and everything the renderer reads back out of it.
//!
//! The reduction carries no clock of its own beyond the run's start, so each question here names
//! the elapsed time it asks at ([`RunState::complete_at`]) and answers it without a terminal or a
//! running fit.

use core::time::Duration;

use super::{
    ClassifierFolds, EmbeddingWorkload, KnnActivity, LOG_CAPACITY, LOSS_CAPACITY, PlacementMap,
    RunState, StageStatus,
};
use crate::{
    math::{Vec2, d_non_negative, open_unit_fraction, unit_fraction},
    progress::{Batch, Stage},
    salt::{
        embedding::CardEmbeddingStats, knn::recall::RecallSpotCheck,
        projector::train::LossBreakdown, quality::QualityMetric,
    },
};

/// A spot check whose aggregate recall is `recall`, over ten thousand compared neighbours.
fn check(recall: f64) -> RecallSpotCheck {
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the fixture's recall is chosen to scale to a whole match count"
    )]
    let matched = (recall * 10_000.0).round() as u64;

    RecallSpotCheck {
        sampled_rows: 200,
        neighbours_per_row: 50,
        matched,
        expected: 10_000,
        deviation: d_non_negative!(0.289),
        minimum_recall: unit_fraction!(0.89),
        // z(0.99) · 0.289 / sqrt(200), the resolution such a sample
        // reaches.
        resolution: d_non_negative!(0.0475),
        confidence: open_unit_fraction!(0.99),
    }
}

/// A breakdown whose composite total is `total`, carried by its semantic term.
fn loss(total: f32) -> LossBreakdown {
    LossBreakdown {
        semantic: total,
        ..LossBreakdown::default()
    }
}

/// Seconds as a duration, for readable expectations.
fn secs(seconds: u64) -> Duration {
    Duration::from_secs(seconds)
}

#[test]
fn a_fresh_run_is_inside_its_first_stage() {
    let state = RunState::new();

    assert_eq!(state.status(0, secs(3)), StageStatus::Running(secs(3)));
    assert_eq!(state.status(1, secs(3)), StageStatus::Pending);
    assert_eq!(state.completed_stages(), 0);
}

#[test]
fn spans_are_differences_between_completions() {
    let mut state = RunState::new();
    state.complete_at(Stage::Ingest, secs(10));
    state.complete_at(Stage::Classifier, secs(25));

    // Ingest carries the run's opening ten seconds, the
    // classifier the fifteen after it, and the policy stage the
    // five since the last completion.
    assert_eq!(state.status(0, secs(30)), StageStatus::Done(secs(10)));
    assert_eq!(state.status(1, secs(30)), StageStatus::Done(secs(15)));
    assert_eq!(state.status(2, secs(30)), StageStatus::Running(secs(5)));
    assert_eq!(state.status(3, secs(30)), StageStatus::Pending);
    assert_eq!(state.completed_stages(), 2);
}

#[test]
fn the_running_span_grows_with_the_clock() {
    let mut state = RunState::new();
    state.complete_at(Stage::Ingest, secs(10));

    assert_eq!(state.status(1, secs(12)), StageStatus::Running(secs(2)));
    assert_eq!(state.status(1, secs(70)), StageStatus::Running(secs(60)));
}

#[test]
fn a_split_opens_the_counter_and_requests_advance_it() {
    let mut state = RunState::new();
    assert_eq!(state.embedding(), None);

    state.start_embedding(&CardEmbeddingStats {
        reused: 900,
        embedded: 100,
    });
    assert_eq!(
        state.embedding(),
        Some(EmbeddingWorkload {
            reused: 900,
            embedded: 100,
            done: 0,
        })
    );

    state.advance_embedding(Batch {
        done: 64,
        total: 100,
    });
    assert_eq!(
        state.embedding(),
        Some(EmbeddingWorkload {
            reused: 900,
            embedded: 100,
            done: 64,
        })
    );
}

#[test]
fn a_second_workload_replaces_the_first() {
    let mut state = RunState::new();
    state.start_embedding(&CardEmbeddingStats {
        reused: 0,
        embedded: 49,
    });
    state.advance_embedding(Batch {
        done: 49,
        total: 49,
    });

    // The corpus finished; the cards are their own workload and the
    // counter must not carry the corpus's progress into them.
    state.start_embedding(&CardEmbeddingStats {
        reused: 12,
        embedded: 8,
    });

    assert_eq!(
        state.embedding(),
        Some(EmbeddingWorkload {
            reused: 12,
            embedded: 8,
            done: 0,
        })
    );
}

#[test]
fn an_announced_fold_count_opens_the_counter_and_completions_advance_it() {
    let mut state = RunState::new();
    assert_eq!(state.classifier(), None);

    state.start_classifier(5);
    state.complete_classifier_fold();
    state.complete_classifier_fold();

    assert_eq!(
        state.classifier(),
        Some(ClassifierFolds { total: 5, done: 2 })
    );
}

#[test]
fn a_fold_completion_without_an_announced_count_is_dropped() {
    let mut state = RunState::new();
    state.complete_classifier_fold();

    assert_eq!(state.classifier(), None);
}

#[test]
fn each_construction_activity_replaces_the_one_before_it() {
    let mut state = RunState::new();
    assert_eq!(state.knn(), None);

    // A construction runs its rows in, then the backend's linking,
    // then its rows out, then the verdict.
    state.report_knn(KnnActivity::Inserting(Batch {
        done: 4_096,
        total: 9_000,
    }));
    state.report_knn(KnnActivity::Building("building the graph".to_owned()));
    state.report_knn(KnnActivity::Reading(Batch {
        done: 9_000,
        total: 9_000,
    }));

    assert_eq!(
        state.knn(),
        Some(&KnnActivity::Reading(Batch {
            done: 9_000,
            total: 9_000,
        })),
    );

    state.report_knn(KnnActivity::Measured(check(0.9021)));

    assert_eq!(state.knn(), Some(&KnnActivity::Measured(check(0.9021))));
}

#[test]
fn the_first_training_step_opens_the_curve_and_the_rest_extend_it() {
    let mut state = RunState::new();
    assert_eq!(state.projector(), None);

    for step in 0..4 {
        #[expect(
            clippy::cast_precision_loss,
            reason = "four fixture steps are exactly representable"
        )]
        state.advance_projector(step, 300, &loss(8.0 - step as f32));
    }

    let training = state.projector().expect("four steps opened the curve");
    assert_eq!(training.steps, 300);
    // Steps are zero-based, so the fourth one reports index three.
    assert_eq!(training.done, 4);
    assert_eq!(training.losses, [8.0, 7.0, 6.0, 5.0]);
    assert_eq!(training.last, loss(5.0));
}

#[expect(
    clippy::cast_precision_loss,
    reason = "the fixture's step count is exactly representable"
)]
#[test]
fn the_curve_scrolls_rather_than_growing_without_limit() {
    let mut state = RunState::new();
    let steps = LOSS_CAPACITY + 2;
    for step in 0..steps {
        state.advance_projector(step, steps, &loss(step as f32));
    }

    let training = state.projector().expect("the curve opened");
    assert_eq!(training.losses.len(), LOSS_CAPACITY);
    // The run went two steps past the window, so the two oldest
    // losses are the ones that left and the window holds steps two
    // onward.
    assert_eq!(training.losses.front(), Some(&2.0));
    assert_eq!(training.losses.back(), Some(&(steps as f32 - 1.0)));
    assert_eq!(training.done, steps);
}

#[test]
fn a_second_training_run_does_not_inherit_the_first_curve() {
    let mut state = RunState::new();
    state.advance_projector(0, 300, &loss(8.0));
    state.advance_projector(1, 300, &loss(7.0));

    state.advance_projector(0, 120, &loss(4.0));

    let training = state.projector().expect("the second run opened its curve");
    assert_eq!(training.steps, 120);
    assert_eq!(training.done, 1);
    assert_eq!(training.losses, [4.0]);
}

#[test]
fn a_snapshot_replaces_the_one_before_it() {
    let mut state = RunState::new();
    assert_eq!(state.placement(), None);

    state.place_projector(vec![Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0)], 1);
    state.place_projector(vec![Vec2::new(2.0, 2.0), Vec2::new(3.0, 3.0)], 1);

    // The map says where the placement is, not where it has been.
    assert_eq!(
        state.placement(),
        Some(&PlacementMap {
            positions: vec![Vec2::new(2.0, 2.0), Vec2::new(3.0, 3.0)],
            landmarks: 1,
        })
    );
}

#[test]
fn a_landmark_count_past_the_reported_rows_is_clamped() {
    let mut state = RunState::new();
    state.place_projector(vec![Vec2::new(0.0, 0.0)], 9);

    // The renderer splits the prefix off, and a count past the rows it received would slice past
    // the end of them.
    let placement = state.placement().expect("the snapshot opened the map");
    assert_eq!(placement.landmarks, 1);
}

#[test]
fn a_request_without_a_split_is_dropped() {
    let mut state = RunState::new();
    state.advance_embedding(Batch { done: 2, total: 5 });

    assert_eq!(state.embedding(), None);
}

#[test]
fn the_batterys_burst_lands_in_metric_order_however_it_arrives() {
    let mut state = RunState::new();
    assert_eq!(state.quality().count(), 0);

    // The probe reports its readings as its report reduces them; the model owes the renderer
    // the battery's own order, not the arrival order.
    state.probe_quality(QualityMetric::TripletAgreement, 0.7820);
    state.probe_quality(QualityMetric::Recall, 0.9021);
    state.probe_quality(QualityMetric::DensitySpread, 1.83);

    assert_eq!(
        state.quality().collect::<Vec<_>>(),
        [
            (QualityMetric::Recall, 0.9021),
            (QualityMetric::DensitySpread, 1.83),
            (QualityMetric::TripletAgreement, 0.7820),
        ]
    );
}

#[test]
fn a_second_reading_of_one_metric_replaces_the_first() {
    let mut state = RunState::new();
    state.probe_quality(QualityMetric::Continuity, 0.8000);
    state.probe_quality(QualityMetric::Continuity, 0.9104);

    // One reduction over the probe's steps answers one question,
    // so a repeat is a fresher answer and never a second row.
    assert_eq!(
        state.quality().collect::<Vec<_>>(),
        [(QualityMetric::Continuity, 0.9104)]
    );
}

#[test]
fn the_log_tail_evicts_its_oldest_line() {
    let mut state = RunState::new();
    for line in 0..=LOG_CAPACITY {
        state.push_log(format!("line {line}"));
    }

    assert_eq!(state.log().len(), LOG_CAPACITY);
    assert_eq!(state.log().next(), Some("line 1"));
    assert_eq!(
        state.log().last(),
        Some(format!("line {LOG_CAPACITY}").as_str())
    );
}
