mod error;

use std::{
    collections::HashMap,
    fs::{self, File},
    io::BufReader,
    iter,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use error_stack::{bail, ensure, IntoReport, Report, ResultExt};
use execution::{
    package::experiment::{ExperimentId, ExperimentName},
    runner::Language,
};
use experiment_control::environment::{LogFormat, LogLevel, OutputLocation};
use experiment_structure::{ExperimentType, Manifest};
use orchestrator::{ExperimentConfig, Server};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use tracing_subscriber::fmt::time::Uptime;

use self::error::{Result, TestContext};
use crate::experiment::error::TestError;

pub type AgentStates = Value;
pub type Globals = Value;
pub type Analysis = Value;

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct ExpectedOutput {
    #[serde(default)]
    pub json_state: HashMap<String, AgentStates>,
    #[serde(default)]
    pub globals: Option<Globals>,
    #[serde(default)]
    pub analysis_outputs: Option<Analysis>,
}

/// Loads the manifest from `project_path` and optionally loads language specific intial states.
///
/// If `language` is specified, it searches for an `init` file with the language appended, so for
/// example when [`Python`](Language::Python) is passed, it searches for the files `init-py.js`,
/// `init-py.py`, and `init-py.json`. If more than one initial state is specified, the function
/// fails.
fn load_manifest<P: AsRef<Path>>(project_path: P, language: Option<Language>) -> Result<Manifest> {
    let project_path = project_path.as_ref();

    // We read the behaviors and datasets like loading a dependency
    let mut manifest = Manifest::from_dependency(project_path)
        .attach_printable_lazy(|| format!("Could not load manifest from {project_path:?}"))
        .change_context(TestContext::ExperimentSetup)?;

    // Now load globals and experiments as specified in the documentation of `Manifest`
    let globals_path = project_path.join("src").join("globals.json");
    if globals_path.exists() {
        manifest
            .set_globals_from_file(globals_path)
            .change_context(TestContext::ExperimentSetup)?;
    }
    let experiments_path = project_path.join("experiments.json");
    if experiments_path.exists() {
        manifest
            .set_experiments_from_file(experiments_path)
            .change_context(TestContext::ExperimentSetup)?;
    }

    // Load the initial state based on the language. if it is specified, use a `-lang` suffix
    let suffix = match language {
        Some(Language::JavaScript) => "-js",
        Some(Language::Python) => "-py",
        Some(Language::Rust) => "-rs",
        None => "",
    };
    let initial_states: Vec<_> = ["js", "py", "json"]
        .into_iter()
        .map(|ext| project_path.join("src").join(format!("init{suffix}.{ext}")))
        .filter(|p| p.is_file())
        .collect();
    ensure!(
        initial_states.len() == 1,
        Report::from(TestError::MultipleLanguages).change_context(TestContext::TestSetup)
    );
    manifest
        .set_initial_state_from_file(&initial_states[0])
        .change_context(TestContext::ExperimentSetup)?;

    Ok(manifest)
}

pub struct TestOutput {
    outputs: Vec<(AgentStates, Globals, Analysis)>,
    duration: Duration,
}

#[derive(Serialize)]
pub struct Timings {
    lower_bound: u128,
    upper_bound: u128,
    estimate: u128,
    median: u128,
    samples: usize,
}

#[derive(Serialize)]
pub struct TestTiming {
    timings: Timings,
    project_name: String,
    project_path: PathBuf,
    test_path: &'static str,
    language: Option<Language>,
    experiment: Option<&'static str>,
}

/// Removes the output directory if not specified by `OUTPUT_DIRECTORY`.
struct OutputDirectoryDropper<'p>(&'p Path);
impl Drop for OutputDirectoryDropper<'_> {
    fn drop(&mut self) {
        if std::env::var("OUTPUT_DIRECTORY").is_err() {
            let _ = fs::remove_dir_all(self.0);
        }
    }
}

pub async fn run_test_suite(
    project_path: PathBuf,
    test_path: &'static str,
    language: Option<Language>,
    experiment: Option<&'static str>,
    target_max_group_size: Option<usize>,
) {
    // If this is an Err then the logger has already been initialised in another thread which is
    // okay
    let _ = tracing_subscriber::fmt()
        .with_timer(Uptime::default())
        .with_target(true)
        .with_test_writer()
        .try_init();

    // If `RUST_LOG` is set, only run it once, otherwise run with `warn` and `trace` on failure
    let log_levels = if std::env::var("RUST_LOG").is_ok() {
        vec![None]
    } else {
        vec![Some(LogLevel::Warning), Some(LogLevel::Trace)]
    };

    let start_timeout = std::env::var("ENGINE_START_TIMEOUT").map_or(10., |val| {
        val.parse::<f64>()
            .expect("ENGINE_START_TIMEOUT couldn't be parsed as a f64")
    });
    let wait_timeout = std::env::var("ENGINE_WAIT_TIMEOUT").map_or(60., |val| {
        val.parse::<f64>()
            .expect("ENGINE_WAIT_TIMEOUT couldn't be parsed as a f64")
    });

    let project_name = project_path
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let experiments = read_config(project_path.join("integration-test.json"))
        .expect("Could not read experiments")
        .into_iter()
        .filter(|(ty, _)| match (&experiment, ty) {
            (None, _) => true,
            (Some(experiment), ExperimentType::Simple { name }) if *experiment == name.as_str() => {
                true
            }
            _ => false,
        });

    let samples = std::env::var("SAMPLES")
        .map(|n| n.parse::<usize>().unwrap())
        .unwrap_or(1);
    assert_ne!(samples, 0, "SAMPLES must be at least 1");

    for (experiment_type, expected_outputs) in experiments {
        // Use `OUTPUT_DIRECTORY` as output directory. If it's not set, cargo's
        // `CARGO_TARGET_TMPDIR` is used.
        let mut output_folder = PathBuf::from(
            std::env::var("OUTPUT_DIRECTORY")
                .unwrap_or_else(|_| env!("CARGO_TARGET_TMPDIR").to_string()),
        );
        for module in test_path.split("::") {
            output_folder.push(module);
        }
        let _output_folder_guard = OutputDirectoryDropper(&output_folder);

        let mut timings = Vec::with_capacity(samples);
        for run in 1..=samples {
            let output_folder = output_folder.join(format!("run-{run}"));
            let log_file_path = output_folder.join("log").join("output.log");
            // Remove log file in case it's already existing
            let _ = fs::remove_file(&log_file_path);

            let mut test_output = None;
            for log_level in &log_levels {
                if let Some(log_level) = log_level {
                    tracing::info!("Running test with log level `{log_level}`... ");
                }

                let output = output_folder.clone();

                let experiment_config = ExperimentConfig {
                    num_workers: num_cpus::get(),
                    log_format: LogFormat::Pretty,
                    log_folder: output.join("log"),
                    log_level: *log_level,
                    output_folder: output,
                    output_location: OutputLocation::File {
                        path: "output.log".into(),
                    },
                    start_timeout,
                    wait_timeout,
                    js_runner_initial_heap_constraint: None,
                    js_runner_max_heap_size: None,
                };

                let test_result = run_test(
                    experiment_type.clone(),
                    &project_path,
                    project_name.clone(),
                    experiment_config,
                    language,
                    target_max_group_size,
                )
                .await;

                match test_result {
                    Ok(outputs) => {
                        if expected_outputs.len() == outputs.outputs.len() {
                            test_output = Some(outputs);
                            break;
                        }

                        if let Ok(log) = fs::read_to_string(&log_file_path) {
                            tracing::error!("Logs:");
                            eprintln!("{log}");
                        }
                        tracing::error!("Test failed");
                        tracing::error!(
                            "Number of expected outputs does not match number of returned \
                             simulation results for experiment, expected {} found {}.",
                            expected_outputs.len(),
                            outputs.outputs.len()
                        );
                    }
                    Err(err) => {
                        tracing::error!("Test failed");
                        tracing::error!("Err:\n{err:?}");
                        if let Ok(log) = fs::read_to_string(&log_file_path) {
                            tracing::error!("Logs:");
                            eprintln!("{log}");
                        }
                    }
                }
            }

            let test_output =
                test_output.expect("Could not run experiment or unexpected number of outputs");

            for (output_idx, ((states, globals, analysis), expected)) in test_output
                .outputs
                .into_iter()
                .zip(expected_outputs.iter())
                .enumerate()
            {
                expected
                    .assert_subset_of(&states, &globals, &analysis)
                    .change_context(TestContext::ExperimentOutput)
                    .unwrap_or_else(|err| {
                        if let Ok(log) = fs::read_to_string(&log_file_path) {
                            eprintln!("{log}");
                        }
                        tracing::error!("{err:?}");
                        panic!(
                            "Output of simulation {} does not match expected output in experiment",
                            output_idx + 1
                        )
                    });
            }
            timings.push(test_output.duration.as_nanos());
        }
        timings.sort_unstable();

        let timings = TestTiming {
            experiment,
            timings: Timings {
                lower_bound: timings.iter().cloned().min().unwrap(),
                upper_bound: timings.iter().cloned().max().unwrap(),
                estimate: timings.iter().sum::<u128>() / samples as u128,
                median: timings[timings.len() / 2],
                samples,
            },
            project_name: project_name.clone(),
            project_path: project_path
                .strip_prefix(env!("CARGO_MANIFEST_DIR"))
                .unwrap()
                .to_path_buf(),
            test_path,
            language,
        };
        fs::write(
            output_folder.join("timing.json"),
            serde_json::to_string_pretty(&timings).unwrap(),
        )
        .expect("Could not write test timings");
    }
}

pub async fn run_test<P: AsRef<Path>>(
    experiment_type: ExperimentType,
    project_path: P,
    project_name: String,
    experiment_config: ExperimentConfig,
    language: Option<Language>,
    target_max_group_size: Option<usize>,
) -> Result<TestOutput> {
    let project_path = project_path.as_ref();

    let nng_listen_url = {
        let uuid = ExperimentId::generate();
        if let Some(language) = language {
            format!("ipc://integration-test-suite-{project_name}-{language}-{uuid}")
        } else {
            format!("ipc://integration-test-suite-{project_name}-{uuid}")
        }
    };

    let (mut experiment_server, handler) = Server::create(nng_listen_url);
    tokio::spawn(async move { experiment_server.run().await });

    let manifest = load_manifest(project_path, language)
        .attach_printable_lazy(|| format!("Could not read project {project_path:?}"))?;
    let experiment_run = manifest
        .read(experiment_type)
        .attach_printable("Could not read manifest")
        .change_context(TestContext::ExperimentSetup)?;

    let experiment = orchestrator::Experiment::new(experiment_config);

    let output_base_directory = experiment
        .config
        .output_folder
        .join(experiment_run.name().as_str())
        .join(experiment_run.id().to_string());

    let now = Instant::now();
    experiment
        .run(experiment_run, handler, target_max_group_size)
        .await
        .change_context(TestContext::ExperimentRun)?;
    let duration = now.elapsed();

    let outputs = iter::repeat(output_base_directory)
        .enumerate()
        .map(|(sim_id, base_dir)| base_dir.join((sim_id + 1).to_string()))
        .take_while(|output_dir| output_dir.exists())
        .map(|output_dir| {
            let json_state = parse_file(Path::new(&output_dir).join("json_state.json"))
                .attach_printable("Could not read JSON state")?;
            let globals = parse_file(Path::new(&output_dir).join("globals.json"))
                .attach_printable("Could not read globals")?;
            let analysis_outputs = parse_file(Path::new(&output_dir).join("analysis_outputs.json"))
                .attach_printable("Could not read analysis outputs`")?;

            Ok((json_state, globals, analysis_outputs))
        })
        .collect::<Result<_, TestError>>()
        .change_context(TestContext::ExperimentOutput)?;

    Ok(TestOutput { outputs, duration })
}

fn parse_file<T: DeserializeOwned, P: AsRef<Path>>(path: P) -> Result<T, TestError> {
    let path = path.as_ref();
    serde_json::from_reader(BufReader::new(
        File::open(path)
            .into_report()
            .change_context_lazy(|| TestError::parse_error(path))?,
    ))
    .into_report()
    .change_context_lazy(|| TestError::parse_error(path))
}

pub fn read_config<P: AsRef<Path>>(path: P) -> Result<Vec<(ExperimentType, Vec<ExpectedOutput>)>> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    pub enum ConfigValue {
        #[serde(rename_all = "kebab-case")]
        Simple {
            experiment: ExperimentName,
            expected_outputs: Vec<ExpectedOutput>,
        },
        #[serde(rename_all = "kebab-case")]
        SingleRun {
            steps: usize,
            expected_output: ExpectedOutput,
        },
    }

    Ok(parse_file::<Vec<ConfigValue>, P>(path)
        .attach_printable("Could not read integration test configuration")
        .change_context(TestContext::TestSetup)?
        .into_iter()
        .map(|config_value| match config_value {
            ConfigValue::Simple {
                experiment,
                expected_outputs,
            } => (
                ExperimentType::Simple { name: experiment },
                expected_outputs,
            ),
            ConfigValue::SingleRun {
                steps,
                expected_output,
            } => (ExperimentType::SingleRun { num_steps: steps }, vec![
                expected_output,
            ]),
        })
        .collect())
}

/// Implementation for [`ExpectedOutput::assert_subset_of`]
fn assert_subset_value(subset: &Value, superset: &Value, path: String) -> Result<(), TestError> {
    match (subset, superset) {
        (Value::Number(a), Value::Number(b)) if a.is_f64() && b.is_f64() => {
            ensure!(
                (a.as_f64().unwrap() - b.as_f64().unwrap()).abs() < f64::EPSILON,
                TestError::unexpected_output_value(path, subset.clone(), superset.clone())
            );
        }
        (Value::Array(a), Value::Array(b)) => {
            ensure!(
                a.len() == b.len(),
                TestError::unexpected_output_length(path, a.clone(), b.clone())
            );
            for (i, (sub_value, super_value)) in a.iter().zip(b.iter()).enumerate() {
                assert_subset_value(sub_value, super_value, format!("{path}[{i}]"))?;
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            for (key, expected) in a {
                match b.get(key) {
                    Some(value) => assert_subset_value(expected, value, format!("{path}.{key}"))?,
                    None => bail!(TestError::output_missing(path, expected.clone())),
                }
            }
        }
        _ => {
            ensure!(
                subset == superset,
                TestError::unexpected_output_value(path, subset.clone(), superset.clone())
            );
        }
    }

    Ok(())
}

impl ExpectedOutput {
    /// Compares to an experiment output and returns [`Err`], if this output is not a subset
    /// of `superset`.
    ///
    /// It's considered a subset if for any output (`json_state`, `globals`, `analysis_output`) the
    /// following conditions are true:
    /// - All non-array and non-object values must be equal to the corresponding value in `superset`
    /// - For arrays, the length must match and for each element this list applies
    /// - For objects, for each key present in the subset there must be a corresponding key in
    ///   `superset`, for which the value needs to be equal as in this list
    pub fn assert_subset_of(
        &self,
        agent_states: &AgentStates,
        globals: &Globals,
        analysis: &Analysis,
    ) -> Result<(), TestError> {
        let mut json_state = self.json_state.iter().collect::<Vec<_>>();
        json_state.sort_unstable_by(|(lhs, _), (rhs, _)| Ord::cmp(lhs, rhs));
        for (step, expected_states) in json_state {
            let step = step
                .parse::<usize>()
                .into_report()
                .change_context_lazy(|| TestError::invalid_step(step.clone()))?;
            let result_states = agent_states
                .get(step)
                .ok_or_else(|| TestError::missing_step(step))?;
            assert_subset_value(
                expected_states,
                result_states,
                format!("json_state[{step}]"),
            )?;
        }

        if let Some(expected_globals) = &self.globals {
            assert_subset_value(expected_globals, globals, String::from("globals"))?;
        }

        if let Some(expected_analysis) = &self.analysis_outputs {
            assert_subset_value(
                expected_analysis,
                analysis,
                String::from("analysis_outputs"),
            )?;
        }

        Ok(())
    }
}

#[test]
fn test_subset() {
    // Note, that the function is also implicitly tested by integration tests

    // Compare nulls
    let lhs = serde_json::json!(null);
    let rhs = serde_json::json!(null);
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();

    // Compare boolean
    let lhs = serde_json::json!(true);
    let rhs = serde_json::json!(true);
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();

    // Compare different types
    let lhs = serde_json::json!(false);
    let rhs = serde_json::json!(null);
    let _ = assert_subset_value(&lhs, &rhs, String::new()).unwrap_err();

    // Compare numbers
    let lhs = serde_json::json!(0.5_f64);
    let rhs = serde_json::json!(0.5_f64);
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();
    let lhs = serde_json::json!(5_u32);
    let rhs = serde_json::json!(5_u32);
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();
    let lhs = serde_json::json!(5_i32);
    let rhs = serde_json::json!(5_i32);
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();

    // Compare strings
    let lhs = serde_json::json!("a");
    let rhs = serde_json::json!("a");
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();

    // Compare objects
    let lhs = serde_json::json!({"a": "string"});
    let rhs = serde_json::json!({"a": "string"});
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();
    let lhs = serde_json::json!({"a": "string"});
    let rhs = serde_json::json!({});
    let _ = assert_subset_value(&lhs, &rhs, String::new()).unwrap_err();

    // Compare arrays
    let lhs = serde_json::json!(["1", "2", "3"]);
    let rhs = serde_json::json!(["1", "2"]);
    let _ = assert_subset_value(&lhs, &rhs, String::new()).unwrap_err();
    let lhs = serde_json::json!([{"1": null}, {"2": "2"}, {"3": true}]);
    let rhs = serde_json::json!([{"1": null}, {"2": "2"}, {"3": true, "_": false}]);
    assert_subset_value(&lhs, &rhs, String::new()).unwrap();
}
