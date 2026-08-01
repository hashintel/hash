//! Whole frames drawn over a [`TestBackend`], read back as rows.
//!
//! [`TestBackend`]: ratatui::backend::TestBackend
use core::time::Duration;

use ratatui::{Terminal, backend::TestBackend, buffer::Buffer, layout::Rect, style::Color};

use super::{
    ACCENT, frame,
    loss::{curve, step_bounds, value_bounds},
    map::{SKELETON, map_bounds},
    rail::duration,
};
use crate::{
    cli::tui::state::{KnnActivity, RunState},
    math::Vec2,
    progress::{
        Batch, CardEmbeddingStats, DescentIteration, LossBreakdown, QualityMetric, RecallSpotCheck,
        Stage,
    },
};

/// The drawn frame as one string per row, trailing blanks trimmed.
fn rows(buffer: &Buffer) -> Vec<String> {
    (0..buffer.area.height)
        .map(|y| {
            let row: String = (0..buffer.area.width)
                .map(|x| buffer[(x, y)].symbol())
                .collect();
            row.trim_end().to_owned()
        })
        .collect()
}

/// Draws one frame of a state over a terminal wide enough for the rail.
fn draw(state: &RunState, tick: usize) -> Vec<String> {
    draw_on(state, tick, 60, 20)
}

/// Draws one frame of a state over a terminal of the given shape.
fn draw_on(state: &RunState, tick: usize, width: u16, height: u16) -> Vec<String> {
    rows(&buffer_on(state, tick, width, height))
}

/// The drawn buffer itself, for the assertions that read style rather than text.
fn buffer_on(state: &RunState, tick: usize, width: u16, height: u16) -> Buffer {
    let mut terminal =
        Terminal::new(TestBackend::new(width, height)).expect("should open a terminal");
    terminal
        .draw(|target| frame(target, state, tick))
        .expect("should draw a frame");

    terminal.backend().buffer().clone()
}

/// A grid of interior rows around the origin, and the two landmarks that lead the sample.
fn placement() -> Vec<Vec2> {
    let mut positions = vec![Vec2::new(-2.0, 0.0), Vec2::new(2.0, 0.0)];
    for column in 0..8_u8 {
        for row in 0..8_u8 {
            positions.push(Vec2::new(
                f32::from(column).mul_add(0.5, -2.0),
                f32::from(row).mul_add(0.25, -1.0),
            ));
        }
    }

    positions
}

/// A run standing in the placement stage with a snapshot reported.
fn placed() -> RunState {
    let mut state = training(150, 600);
    state.place_projector(placement(), 2);

    state
}

/// A run standing in the placement stage, `steps` of `total` reported.
#[expect(
    clippy::cast_precision_loss,
    reason = "the fixture runs a few hundred steps, exactly representable"
)]
fn training(steps: usize, total: usize) -> RunState {
    let mut state = RunState::new();
    for (index, stage) in Stage::ALL.into_iter().take(8).enumerate() {
        state.complete_at(stage, Duration::from_secs(index as u64 + 1));
    }
    for step in 0..steps {
        // A decaying curve, so the chart has a real range to label.
        let decay = 0.5_f32.powf(step as f32 / 16.0);
        state.advance_projector(
            step,
            total,
            &LossBreakdown {
                semantic: 8.0 * decay,
                ordinary: 1.0 * decay,
                hard: 0.5 * decay,
                relation: 2.0 * decay,
                anchor: 0.0,
                landmark: 0.5 * decay,
            },
        );
    }

    state
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn a_fresh_run_shows_every_stage_with_the_first_one_running() {
    let drawn = draw(&RunState::new(), 0);

    // The rail is the run's whole shape from the first frame: the
    // opening stage spins, the other eleven wait.
    assert!(drawn[1].starts_with("│ ⠋ ingest"), "{drawn:#?}");
    assert!(drawn[2].starts_with("│ · classifier"), "{drawn:#?}");
    assert!(drawn[12].contains("admission"), "{drawn:#?}");
    assert!(drawn[13].contains("stages 0/12"), "{drawn:#?}");
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn a_completed_stage_carries_its_glyph_span_and_leader_dots() {
    let mut state = RunState::new();
    state.complete_at(Stage::Ingest, Duration::from_millis(12_400));

    let drawn = draw(&state, 1);

    assert!(drawn[1].starts_with("│ ✓ ingest"), "{drawn:#?}");
    assert!(drawn[1].contains('·'), "{drawn:#?}");
    assert!(drawn[1].ends_with("12.4s │"), "{drawn:#?}");
    assert!(drawn[2].starts_with("│ ⠙ classifier"), "{drawn:#?}");
    assert!(drawn[13].contains("stages 1/12"), "{drawn:#?}");
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_running_ingest_row_carries_the_embedding_counter() {
    let mut state = RunState::new();
    state.start_embedding(&CardEmbeddingStats {
        reused: 3_072,
        embedded: 1_024,
    });
    state.advance_embedding(Batch {
        done: 512,
        total: 1_024,
    });

    let drawn = draw(&state, 0);

    // Half the paid workload is back, so half the bar is lit and the
    // counter sits between the label and the leader dots.
    assert!(
        drawn[1].starts_with("│ ⠋ ingest      ████░░░░ 512/1024"),
        "{drawn:#?}"
    );
    assert!(drawn[1].ends_with('│'), "{drawn:#?}");
    // The counter belongs to the running stage alone.
    assert!(!drawn[2].contains('░'), "{drawn:#?}");
}

#[test]
fn a_wholly_reused_workload_says_so_instead_of_drawing_an_empty_bar() {
    let mut state = RunState::new();
    state.start_embedding(&CardEmbeddingStats {
        reused: 4_096,
        embedded: 0,
    });

    let drawn = draw(&state, 0);

    assert!(drawn[1].contains("4096 reused"), "{drawn:#?}");
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn a_completed_ingest_stage_drops_its_counter_for_its_span() {
    let mut state = RunState::new();
    state.start_embedding(&CardEmbeddingStats {
        reused: 0,
        embedded: 1_024,
    });
    state.advance_embedding(Batch {
        done: 1_024,
        total: 1_024,
    });
    state.complete_at(Stage::Ingest, Duration::from_millis(12_400));

    let drawn = draw(&state, 0);

    assert!(!drawn[1].contains("1024"), "{drawn:#?}");
    assert!(drawn[1].ends_with("12.4s │"), "{drawn:#?}");
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_running_classifier_row_carries_its_fold_counter() {
    let mut state = RunState::new();
    state.complete_at(Stage::Ingest, Duration::from_secs(1));
    state.start_classifier(4);
    state.complete_classifier_fold();
    state.complete_classifier_fold();
    state.complete_classifier_fold();

    let drawn = draw(&state, 0);

    assert!(
        drawn[2].starts_with("│ ⠋ classifier  ██████░░ 3/4 folds"),
        "{drawn:#?}"
    );
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_classifier_row_carries_the_derived_boundary_until_the_folds_start() {
    let mut state = RunState::new();
    state.complete_at(Stage::Ingest, Duration::from_secs(1));
    state.derive_assembly_boundary(3.6218e-4);

    let drawn = draw(&state, 0);

    assert!(
        drawn[2].starts_with("│ ⠋ classifier  ε 3.62e-4"),
        "{drawn:#?}"
    );

    // The folds counter supersedes the boundary the moment the fit announces itself.
    state.start_classifier(4);
    let drawn = draw(&state, 0);
    assert!(
        drawn[2].starts_with("│ ⠋ classifier  ░░░░░░░░ 0/4 folds"),
        "{drawn:#?}"
    );
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_classifier_row_carries_the_selected_strength_once_chosen() {
    let mut state = RunState::new();
    state.complete_at(Stage::Ingest, Duration::from_secs(1));
    state.start_classifier(4);
    state.complete_classifier_fold();
    state.complete_classifier_fold();
    state.complete_classifier_fold();
    state.complete_classifier_fold();
    state.select_regularization(0.3);

    let drawn = draw(&state, 0);

    assert!(
        drawn[2].starts_with("│ ⠋ classifier  ████████ 4/4 folds λ 0.3"),
        "{drawn:#?}"
    );
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_running_knn_row_carries_whichever_part_of_the_construction_reported() {
    let mut state = RunState::new();
    for stage in [
        Stage::Ingest,
        Stage::Classifier,
        Stage::Policy,
        Stage::Adjacency,
        Stage::Relations,
    ] {
        state.complete_at(stage, Duration::from_secs(1));
    }

    state.report_knn(KnnActivity::Inserting(Batch {
        done: 3_000,
        total: 4_000,
    }));
    // Three quarters of the corpus is in, so six of the eight cells
    // are lit and the row says which loop is counting.
    assert!(
        draw(&state, 0)[6].starts_with("│ ⠋ knn         ██████░░ 3000/4000 inserted"),
        "{:#?}",
        draw(&state, 0),
    );

    // A phase the backend named replaces the bar: the linking counts
    // nothing this side of the seam.
    state.report_knn(KnnActivity::Building("building the graph".to_owned()));
    assert!(
        draw(&state, 0)[6].starts_with("│ ⠋ knn         building the graph"),
        "{:#?}",
        draw(&state, 0),
    );

    state.report_knn(KnnActivity::Descending(DescentIteration {
        iteration: 3,
        accepted_per_entry: 0.0142,
        threshold: 0.001,
    }));
    assert!(
        draw(&state, 0)[6].starts_with("│ ⠋ knn         descent 3 0.0142 -> 0.0010"),
        "{:#?}",
        draw(&state, 0),
    );

    state.report_knn(KnnActivity::Measured(RecallSpotCheck {
        sampled_rows: 200,
        neighbours_per_row: 50,
        matched: 9_021,
        expected: 10_000,
        deviation: 0.289,
        minimum_recall: 0.89,
        resolution: 0.0475,
        confidence: 0.99,
    }));
    assert!(
        draw(&state, 0)[6].starts_with("│ ⠋ knn         recall 0.9021"),
        "{:#?}",
        draw(&state, 0),
    );
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_running_projector_row_carries_its_step_counter() {
    let drawn = draw(&training(150, 600), 0);

    // A quarter of the schedule is behind it, so two of the eight
    // cells are lit.
    assert!(
        drawn[9].starts_with("│ ⠋ projector   ██░░░░░░ 150/600"),
        "{drawn:#?}"
    );
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_loss_chart_labels_the_floor_and_the_peak_the_run_reached() {
    let drawn = draw_on(&training(150, 600), 0, 96, 30);
    let chart = drawn[14..23].join("\n");

    // The curve runs from 12.0 at step zero to 12.0 * 0.5^(149/16)
    // = 0.0189 at the last. The axis spans the objective's floor to
    // the peak the run took, and the title carries the latest value
    // to four places.
    assert!(chart.contains(" loss "), "{chart}");
    assert!(chart.contains("12.00"), "{chart}");
    assert!(chart.contains("0.00"), "{chart}");
    assert!(chart.contains("0.0189"), "{chart}");
    assert!(chart.contains("semantic 0.013"), "{chart}");
    assert!(chart.contains('⠉') || chart.contains('⣀'), "{chart}");
}

#[test]
fn a_pane_too_narrow_for_the_breakdown_drops_it_rather_than_the_corner() {
    let drawn = draw_on(&training(150, 600), 0, 60, 30);

    assert!(drawn[14].contains(" loss "), "{drawn:#?}");
    // The widget draws a title wider than its frame from the left corner outward, so the footer row
    // is unbroken border or it is a truncated sentence starting mid-word. Absence of the whole
    // breakdown is not enough to tell those apart.
    assert!(
        drawn[22]
            .chars()
            .all(|glyph| matches!(glyph, '╰' | '─' | '╯')),
        "{drawn:#?}"
    );
}

/// Whether a glyph is one of the canvas's braille dots.
fn is_dot(glyph: char) -> bool {
    matches!(glyph, '⠁'..='⣿')
}

#[test]
fn the_map_draws_beside_the_curve_on_a_wide_pane() {
    let drawn = draw_on(&placed(), 0, 120, 30);
    let band = drawn[14..23].join("\n");

    // One band, two frames. The descent goes on the left and the placement itself on the right,
    // with the sample it draws named under it.
    assert!(drawn[14].contains(" loss "), "{drawn:#?}");
    assert!(drawn[14].contains(" map "), "{drawn:#?}");
    assert!(band.contains("66 rows"), "{band}");
    assert!(band.contains("2 landmarks"), "{band}");
    // The dots are in the right-hand frame, not the chart's.
    assert!(
        drawn[15..22]
            .iter()
            .any(|line| line.chars().skip(58).any(is_dot)),
        "{band}"
    );
}

#[test]
fn a_pane_too_narrow_for_both_keeps_the_curve_alone() {
    let drawn = draw_on(&placed(), 0, 70, 30);

    // The curve is the reading an operator acts on, so a narrow
    // pane gives up the map rather than the descent.
    assert!(drawn[14].contains(" loss "), "{drawn:#?}");
    assert!(!drawn[14].contains(" map "), "{drawn:#?}");
}

#[test]
fn a_run_with_no_snapshot_leaves_the_curve_the_whole_band() {
    let drawn = draw_on(&training(150, 600), 0, 120, 30);

    assert!(drawn[14].contains(" loss "), "{drawn:#?}");
    assert!(!drawn[14].contains(" map "), "{drawn:#?}");
    // The chart has the room the map would have taken, so its
    // per-family footer fits.
    assert!(drawn[22].contains("semantic 0.013"), "{drawn:#?}");
}

#[test]
fn a_landmark_colors_the_cell_it_lands_in() {
    let buffer = buffer_on(&placed(), 0, 120, 30);
    let colors: Vec<Color> = buffer
        .content()
        .iter()
        .filter(|cell| cell.symbol().chars().all(is_dot))
        .map(|cell| cell.fg)
        .collect();

    // The map draws the skeleton after the interior, so a cell holding a landmark reads as skeleton
    // and the rest as the sample. Both colors are present: the map distinguishes them.
    assert!(colors.contains(&SKELETON), "{colors:?}");
    assert!(colors.contains(&ACCENT), "{colors:?}");
}

#[test]
fn the_map_keeps_the_placement_square() {
    let inner = Rect::new(0, 0, 40, 7);

    // A braille dot is as tall as it is wide, so equal data units
    // per dot on both axes is what keeps the atlas its own shape
    // instead of one stretched to fill the frame. Whichever axis
    // needs the most units per dot sets the scale, so the other one
    // gets slack and the placement always fits: asserted from both
    // sides, because a scale read off one axis alone is square too
    // and lets the other axis run off the frame.
    for placement in [
        [Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0)],
        [Vec2::new(-0.5, -12.0), Vec2::new(0.5, 12.0)],
    ] {
        let [horizontal, vertical] = map_bounds(&placement, inner);

        let across = (horizontal[1] - horizontal[0]) / (f64::from(inner.width) * 2.0);
        let down = (vertical[1] - vertical[0]) / (f64::from(inner.height) * 4.0);
        // The map builds the viewport in `f32` and widens it for the canvas, so the two readings
        // agree to within a rounding of the extent they were rebuilt from.
        let tolerance = 4.0 * f64::from(f32::EPSILON) * across;
        assert!(
            (across - down).abs() <= tolerance,
            "{across} against {down}, {horizontal:?} {vertical:?}"
        );
        for point in placement {
            assert!(
                horizontal[0] < f64::from(point.x()) && f64::from(point.x()) < horizontal[1],
                "{horizontal:?}"
            );
            assert!(
                vertical[0] < f64::from(point.y()) && f64::from(point.y()) < vertical[1],
                "{vertical:?}"
            );
        }
    }
}

#[test]
fn a_row_the_canvas_cannot_place_is_dropped_rather_than_drawn() {
    let mut state = training(150, 600);
    let mut positions = placement();
    positions.push(Vec2::new(f32::NAN, 0.0));
    state.place_projector(positions, 2);

    let drawn = draw_on(&state, 0, 120, 30);
    let placeable = draw_on(&placed(), 0, 120, 30);

    // The canvas clamps what it cannot compare into the corner of
    // the frame, which would draw a row somewhere it is not.
    assert_eq!(drawn[15..22], placeable[15..22], "{drawn:#?}");
}

#[test]
fn a_placement_with_no_extent_still_has_a_viewport() {
    let inner = Rect::new(0, 0, 40, 7);

    // A collapsed placement and a frame with nothing finite in it
    // both draw a box rather than a degenerate one.
    let [horizontal, vertical] = map_bounds(&[Vec2::new(3.0, 3.0); 4], inner);
    assert!(horizontal[0] < horizontal[1], "{horizontal:?}");
    assert!(vertical[0] < vertical[1], "{vertical:?}");

    let [horizontal, vertical] = map_bounds(&[Vec2::new(f32::NAN, 0.0)], inner);
    assert!(horizontal[0] < horizontal[1], "{horizontal:?}");
    assert!(vertical[0] < vertical[1], "{vertical:?}");
}

/// A run whose stages have all landed, carrying `readings` of the admission battery.
fn probed(readings: usize) -> RunState {
    let mut state = RunState::new();
    for (index, stage) in Stage::ALL.into_iter().enumerate() {
        state.complete_at(stage, Duration::from_secs(index as u64 + 1));
    }
    for (metric, reading) in [
        (QualityMetric::Recall, 0.9021),
        (QualityMetric::Trustworthiness, 0.8712),
        (QualityMetric::Continuity, 0.9104),
        (QualityMetric::IntrusionRate, 0.0413),
        (QualityMetric::DensitySpread, 1.83),
        (QualityMetric::TripletAgreement, 0.7820),
    ]
    .into_iter()
    .take(readings)
    {
        state.probe_quality(metric, reading);
    }

    state
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn the_admission_readings_hang_under_the_stage_that_measured_them() {
    let drawn = draw_on(&probed(6), 0, 60, 26);

    // The battery's readings are the admission stage's detail: indented
    // under its row, in the battery's own order, each one carrying its
    // leader dots out to the reading.
    assert!(drawn[12].contains("✓ admission"), "{drawn:#?}");
    assert!(drawn[13].starts_with("│   recall"), "{drawn:#?}");
    assert!(drawn[13].ends_with("0.9021 │"), "{drawn:#?}");
    assert!(drawn[13].contains('·'), "{drawn:#?}");
    assert!(drawn[16].starts_with("│   intrusion rate"), "{drawn:#?}");
    assert!(drawn[16].ends_with("0.0413 │"), "{drawn:#?}");
    // A spread is not a fraction, and the row renders what it is.
    assert!(drawn[17].ends_with("1.8300 │"), "{drawn:#?}");
    assert!(drawn[18].starts_with("│   triplet agreement"), "{drawn:#?}");
    // The rail's own bar is still the frame's bottom edge, under the
    // block the readings grew it by.
    assert!(drawn[19].contains("stages 12/12"), "{drawn:#?}");
    assert!(drawn.join("\n").contains(" log "), "{drawn:#?}");
}

#[expect(
    clippy::non_ascii_literal,
    reason = "the assertions read the dashboard's own glyphs"
)]
#[test]
fn a_battery_missing_evidence_draws_only_the_readings_it_has() {
    let drawn = draw_on(&probed(2), 0, 60, 26);

    // An absent reading is absent evidence, which the report refuses
    // over. The rail invents no row and no zero for it.
    assert!(drawn[13].starts_with("│   recall"), "{drawn:#?}");
    assert!(drawn[14].starts_with("│   trustworthiness"), "{drawn:#?}");
    assert!(drawn[15].contains("stages 12/12"), "{drawn:#?}");
    assert!(!drawn.join("\n").contains("continuity"), "{drawn:#?}");
}

#[test]
fn readings_a_short_pane_cannot_hold_whole_stay_out_of_the_rail() {
    let drawn = draw_on(&probed(6), 0, 60, 20);
    let pane = drawn.join("\n");

    // Half a battery would read as evidence the probe could not
    // measure, so a pane that cannot spare a row per reading shows
    // none of them - and the log keeps its voice either way.
    assert!(drawn[13].contains("stages 12/12"), "{drawn:#?}");
    assert!(!pane.contains("recall"), "{pane}");
    assert!(!pane.contains("triplet agreement"), "{pane}");
    assert!(pane.contains(" log "), "{pane}");
}

#[test]
fn a_pane_too_short_for_a_chart_keeps_the_rail_and_the_log() {
    let drawn = draw(&training(150, 600), 0);
    let pane = drawn.join("\n");

    // The rail is the run's shape and the log is its voice; the
    // chart is the first thing to go.
    assert!(!pane.contains(" loss "), "{pane}");
    assert!(pane.contains("admission"), "{pane}");
    assert!(pane.contains(" log "), "{pane}");
}

#[test]
fn the_step_axis_spans_exactly_the_curve_it_draws() {
    let state = training(150, 600);
    let plotted = state.projector().expect("the fixture reported its steps");
    let points: Vec<(f64, f64)> = curve(plotted).into_iter().collect();
    let [first, last] = step_bounds(plotted);

    // One point per reported step, the first on the axis's left edge and the last on its right. The
    // frame would clip a curve drawn past either bound.
    assert_eq!(points.len(), 150);
    assert_eq!(points.first().map(|&(step, _)| step), Some(first));
    assert_eq!(points.last().map(|&(step, _)| step), Some(last));
}

#[expect(
    clippy::float_cmp,
    reason = "the bounds are exactly the fixture's own values and the unit fallback"
)]
#[test]
fn the_value_axis_spans_zero_to_the_highest_loss_observed() {
    assert_eq!(value_bounds([3.0, 1.0, 2.0]), [0.0, 3.0]);
    // A flat curve draws along the top of its own axis.
    assert_eq!(value_bounds([2.0, 2.0]), [0.0, 2.0]);
    // Nothing positive to plot yet: an objective already at zero, a
    // window of non-finite values, and an empty one.
    assert_eq!(value_bounds([0.0, 0.0]), [0.0, 1.0]);
    assert_eq!(value_bounds([f64::NAN]), [0.0, 1.0]);
    assert_eq!(value_bounds([]), [0.0, 1.0]);
}

#[test]
fn the_log_pane_shows_the_newest_lines_that_fit() {
    let mut state = RunState::new();
    for line in 0..40 {
        state.push_log(format!("INFO line {line}"));
    }

    let drawn = draw(&state, 0);
    let pane = drawn[15..].join("\n");

    // The pane is a tail rather than a scrollback, so the newest line is always visible and the
    // pane drops the oldest off the top.
    assert!(pane.contains("line 39"), "{pane}");
    assert!(!pane.contains("line 0 "), "{pane}");
}

#[test]
fn spans_read_as_a_clock() {
    assert_eq!(duration(Duration::from_millis(400)), "0.4s");
    assert_eq!(duration(Duration::from_millis(12_400)), "12.4s");
    assert_eq!(duration(Duration::from_secs(59)), "59.0s");
    assert_eq!(duration(Duration::from_millis(64_200)), "1m 04.2s");
    assert_eq!(duration(Duration::from_secs(3_600)), "60m 00.0s");
}
