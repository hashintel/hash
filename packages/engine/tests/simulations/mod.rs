mod experiment;

/// Opens `$project` relatively to this file as HASH project and uses
/// `$project/integration-test.json` as configuration for the test.
///
/// The configuration contains a list of objects, where each object has the following values:
/// - for a simple experiment:
///   - "experiment": Name of the experiment to run as specified in `experiments.json`
///   - "expected-outputs": List of expected outputs, where the length of the list must be equal to
///     the number of simulations of the experiment. Each entry of the list is an objects with the
///     step number as key mapping to the expected outputs of the corresponding step in the
///     simulation run:
///     - "json-state": subset of the values expected in the `json_state.json` output
///     - "globals": subset of the values expected in the `globals.json` output
///     - "analysis-outputs": subset of the values expected in the `analysis_outputs.json` output
/// - for single-run experiments:
///   - "steps": Number of steps to run
///   - "expected-output": Expected output of the simulation containing with the same schema as one
///     element in "expected-outputs"
macro_rules! run_test {
    ($project:tt) => {
        #[test]
        fn $project() {
            use $crate::simulations::experiment::*;

            let project_path = std::path::Path::new(file!())
                .parent()
                .unwrap()
                .join(stringify!($project))
                .canonicalize()
                .unwrap();

            let experiments = read_config(project_path.join("integration-test.json"))
                .expect("Could not read experiments");

            for (experiment, expected_outputs) in experiments {
                let outputs = experiment
                    .run(&project_path)
                    .expect("Could not run experiment");

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

run_test!(message_sending);
run_test!(edit_state_number);
