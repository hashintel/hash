//! The hEngine integration test suite is based on whole simulation runs.

mod units;

/// Opens `$project` relative to the caller's file as a HASH simulation project and expects
/// `$project/integration-test.json` to exist and be configuration for the test.
///
/// The configuration contains a list of objects, where each object has the following values:
/// - for a simple experiment:
///   - "experiment": Name of the experiment to run as specified in `experiments.json`
///   - "expected-outputs": List of expected outputs, where the length of the list must be equal to
///     the number of simulations of the experiment. Each entry of the list is an object with the
///     step number as its key mapped to the expected outputs of the corresponding step in the
///     simulation run as its value:
///     - "json-state": set of values required to exist and match for the given step in the
///       simulation output
///     - "globals": set of values required to exist and match the `globals.json` output
///     - "analysis-outputs": set of values required to exist and match the `analysis_outputs.json`
///       output
/// - for single-run experiments:
///   - "steps": Number of steps to run
///   - "expected-output": Expected output of the simulation containing with the same schema as one
///     element in "expected-outputs"
#[macro_export]
macro_rules! run_test {
    ($project:tt) => {
        #[test]
        fn $project() {
            use $crate::units::experiment::*;

            let project_path = std::path::Path::new(file!())
                .parent()
                .unwrap()
                .join(stringify!($project))
                .canonicalize()
                .unwrap();

            let experiments = read_config(project_path.join("integration-test.json"))
                .expect("Could not read experiments");

            for (experiment, expected_outputs) in experiments {
                // TODO: Remove attempting strategy
                let mut outputs = None;
                let attempts = 3;
                for attempt in 1..=attempts {
                    println!(
                        "\n\n\nRunning {} attempt {attempt}/{attempts}:\n",
                        stringify!($project)
                    );
                    match experiment.run(&project_path) {
                        Ok(out) => {
                            outputs.replace(out);
                            break;
                        }
                        Err(err) => eprintln!("\n\n{err:?}\n\n"),
                    }
                }
                let outputs = outputs.expect("Could not run experiment");

                assert_eq!(
                    expected_outputs.len(),
                    outputs.len(),
                    "Number of expected outputs does not match number of returned simulation \
             results"
                );

                for ((states, globals, analysis), expected) in
                    outputs.into_iter().zip(expected_outputs.into_iter())
                {
                    expected
                        .assert_subset_of(&states, &globals, &analysis)
                        .expect("Output does not match expected output");
                }
            }
        }
    };
}
