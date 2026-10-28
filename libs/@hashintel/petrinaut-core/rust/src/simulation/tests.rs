use super::{ArcKind, Config, Input, Output, Simulation, Transition};

fn make_simulation() -> Simulation {
    Simulation::new(Config {
        parameters: vec![],
        counts: vec![2, 0],
        capacities: vec![None, Some(1)],
        transitions: vec![Transition {
            inputs: vec![Input {
                place: 0,
                weight: 1,
                kind: ArcKind::Standard,
            }],
            outputs: vec![Output {
                place: 1,
                weight: 1,
            }],
        }],
        dt: 0.1,
        max_frames: 10,
        seed: 42,
    })
    .expect("simulation should accept valid buffers")
}

#[test]
fn capacity_blocks_and_deadlocks() {
    let mut simulation = make_simulation();
    assert!(simulation.begin(), "first frame should begin");
    simulation.fire(0, f64::INFINITY);
    simulation.finish();
    assert_eq!(
        &simulation.values()[..4],
        &[1.0, 1.0, 1.0, 1.0],
        "firing should move one token and update its counters"
    );
    let rng = simulation.rng;
    assert!(simulation.begin(), "second frame should check for deadlock");
    simulation.fire(0, f64::INFINITY);
    simulation.finish();
    assert_eq!(simulation.status, 3, "full output should deadlock the run");
    assert_eq!(
        simulation.rng, rng,
        "disabled transition should preserve RNG state"
    );
    assert!(!simulation.begin(), "completed run should stop advancing");
}

#[test]
fn enabled_rejection_consumes_randomness() {
    let mut simulation = make_simulation();
    simulation.begin();
    simulation.fire(0, 0.0);
    simulation.finish();
    assert_eq!(
        simulation.rng, 1_250_496_027,
        "enabled transition should consume the exact LCG draw"
    );
    assert_eq!(
        &simulation.values()[..2],
        &[2.0, 0.0],
        "zero rate should preserve counts"
    );
    assert_eq!(
        simulation.status, 1,
        "zero rate should remain structurally enabled"
    );
}

#[test]
fn output_waits_until_frame_end() {
    let mut simulation = make_simulation();
    simulation.config.transitions.push(Transition {
        inputs: vec![Input {
            place: 1,
            weight: 1,
            kind: ArcKind::Standard,
        }],
        outputs: vec![],
    });
    let mut simulation =
        Simulation::new(simulation.config).expect("simulation should accept the second transition");
    simulation.begin();
    simulation.fire(0, f64::INFINITY);
    simulation.fire(1, f64::INFINITY);
    simulation.finish();
    assert_eq!(
        &simulation.values()[..4],
        &[1.0, 1.0, 1.0, 0.0],
        "new output should become available in the next frame"
    );
}

#[test]
fn duplicate_arcs_are_rejected_before_consuming_tokens() {
    let mut config = make_simulation().config;
    config.transitions[0].inputs.push(Input {
        place: 0,
        weight: 2,
        kind: ArcKind::Standard,
    });
    assert!(
        Simulation::new(config).is_err(),
        "duplicate inputs could consume more tokens than the place holds"
    );

    let mut config = make_simulation().config;
    config.transitions[0].outputs.push(Output {
        place: 1,
        weight: 1,
    });
    assert!(
        Simulation::new(config).is_err(),
        "native callers should use the same single-arc contract as the Wasm adapter"
    );
}
