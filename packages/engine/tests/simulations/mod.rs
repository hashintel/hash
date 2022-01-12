mod experiment;

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
                    expected.assert_subset_of(&got);
                }
            }
        }
    };
}

run_test!(message_sending);
