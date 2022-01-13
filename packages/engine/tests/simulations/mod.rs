mod experiment;

/// Opens `$project` relatively to this file as HASH project and uses
/// `$project/integration-test.json` as configuration for the test.
///
/// The configuration contains the following (optional) values:
/// - "experiments": List of objects describing an experiment:
///   - "experiment-name": Name of the experiment to run specified in `experiments.json`
///   - "expected-outputs": List of expected outputs from the experiment run. The length of the list
///     is expected to be equal to the number of simulations run in the experiment. Each element in
///     the list is an object with these (optional) elements:
///     - "json-state": subset of the values expected in the `json_state.json` output
///     - "globals": subset of the values expected in the `globals.json` output
///     - "analysis-outputs": subset of the values expected in the `analysis_outputs.json` output
/// - "single": Runs a single simulation with described as:
///   - "num-steps": Number of steps to run
///   - "expected-output": Expected output of the simulation containing the same (optional) objects
///     as one element in "expected-outputs": "json-state", "globals", "analysis-outputs"
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
                let outputs =
                    run_experiment(&project_path, &experiment).expect("Could not run experiment");

                assert_eq!(
                    expected_outputs.len(),
                    outputs.len(),
                    "Number of expected outputs does not match number of returned simulation \
             results"
                );

                for (got, expected) in outputs.into_iter().zip(expected_outputs.into_iter()) {
                    expected
                        .assert_subset_of(&got)
                        .expect("Output does not match expected output");
                }
            }
        }
    };
}

run_test!(message_sending);
