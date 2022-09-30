//! The HASH Engine integration test suite runs a variety of specially-designed simulations
//! and experiments of specific functionalities to verify outputs.

/// Helper for parsing an experiment and run it.
mod experiment;

mod examples;
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
///
/// Optionally, a [`Language`] can be specified. Then the test searches for an `init` file with the
/// language appended, so for example when [`Python`](Language::Python) is passed, it searches for
/// the files `init-py.js`, `init-py.py`, and `init-py.json`. If more than one initial state is
/// specified, the test fails. When no language is specified, it omits the language suffix.
#[macro_export]
macro_rules! run_test {
    ($project:ident $(,)? $(#[$attr:meta])* ) => {
        $(#[$attr])*
        #[tokio::test]
        #[cfg_attr(miri, ignore, allow(unused_attributes))]
        async fn $project() {
            let project_path = std::path::Path::new(file!())
                .parent()
                .unwrap()
                .join(stringify!($project))
                .canonicalize()
                .unwrap();

            $crate::experiment::run_test_suite(
                project_path,
                concat!(module_path!(), "::", stringify!($project)),
                None,
                None,
                None
            ).await
        }
    };
    ($project:ident, $language:ident $(,)? $(#[$attr:meta])* ) => {
        // Enable syntax highlighting and code completion
        #[allow(unused)]
        use execution::runner::Language::$language as _;

        $(#[$attr])*
        #[tokio::test]
        #[cfg_attr(miri, ignore, allow(unused_attributes))]
        async fn $project() {
            let project_path = std::path::Path::new(file!())
                .parent()
                .unwrap()
                .join(stringify!($project))
                .canonicalize()
                .unwrap();

            $crate::experiment::run_test_suite(
                project_path,
                concat!(module_path!(), "::", stringify!($project)),
                Some(execution::runner::Language::$language),
                None,
                None
            ).await
        }
    };
    ($project:ident, experiment: $experiment:ident $(,)? $(#[$attr:meta])* ) => {
        $(#[$attr])*
        #[tokio::test]
        #[cfg_attr(miri, ignore, allow(unused_attributes))]
        async fn $experiment() {
            let project_path = std::path::Path::new(file!())
                .parent()
                .unwrap()
                .join(stringify!($project))
                .canonicalize()
                .unwrap();

            $crate::experiment::run_test_suite(
                project_path, concat!(module_path!(), "::", stringify!($experiment)),
                None,
                Some(stringify!($experiment)),
                None
            ).await
        }
    };
    ($project:ident, $language:ident, experiment: $experiment:ident $(,)? $(#[$attr:meta])* ) => {
        // Enable syntax highlighting and code completion
        #[allow(unused)]
        use execution::runner::Language::$language as _;

        $(#[$attr])*
        #[tokio::test]
        #[cfg_attr(miri, ignore, allow(unused_attributes))]
        async fn $experiment() {
            let project_path = std::path::Path::new(file!())
                .parent()
                .unwrap()
                .join(stringify!($project))
                .canonicalize()
                .unwrap();

            $crate::experiment::run_test_suite(
                project_path,
                concat!(module_path!(), "::", stringify!($experiment)),
                Some(execution::runner::Language::$language),
                Some(stringify!($experiment)),
                None
            ).await
        }
    };
}
