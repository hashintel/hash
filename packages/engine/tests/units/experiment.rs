use std::{
    collections::HashMap,
    fs::{self, File},
    io::BufReader,
    iter,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use error::{bail, ensure, report, Result, ResultExt};
use hash_engine::{
    proto::ExperimentName,
    utils::{LogFormat, OutputLocation},
    Language,
};
use orchestrator::{ExperimentConfig, ExperimentType, Manifest, Server};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

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
        .wrap_err_lazy(|| format!("Could not load manifest from {project_path:?}"))?;

    // Now load globals and experiments as specified in the documentation of `Manifest`
    let globals_path = project_path.join("src").join("globals.json");
    if globals_path.exists() {
        manifest.set_globals_from_file(globals_path)?;
    }
    let experiments_path = project_path.join("experiments.json");
    if experiments_path.exists() {
        manifest.set_experiments_from_file(experiments_path)?;
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
        "Exactly one initial state has to be provided for the given language"
    );
    manifest.set_initial_state_from_file(&initial_states[0])?;

    Ok(manifest)
}

pub struct TestOutput {
    outputs: Vec<(AgentStates, Globals, Analysis)>,
    duration: Duration,
}

#[derive(Serialize)]
pub struct TestTiming {
    times: u128,
    project_name: String,
    project_path: PathBuf,
    test_path: &'static str,
    language: Option<Language>,
    experiment: Option<&'static str>,
}

pub async fn run_test_suite(
    project_path: PathBuf,
    test_path: &'static str,
    language: Option<Language>,
    experiment: Option<&'static str>,
) {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }

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
    for (experiment_type, expected_outputs) in experiments {
        // TODO: Remove attempting strategy
        let mut outputs = None;
        let attempts = 10;

        // Use `OUTPUT_DIRECTORY` as output directory. If it's not set, cargo's `OUT_DIR` is
        // used.
        let mut output_folder = PathBuf::from(
            std::env::var("OUTPUT_DIRECTORY").unwrap_or_else(|_| env!("OUT_DIR").to_string()),
        );
        for module in test_path.split("::") {
            output_folder.push(module);
        }

        for attempt in 1..=attempts {
            if attempt > 1 {
                std::env::set_var("RUST_LOG", "trace");
            }

            let test_result = run_test(
                experiment_type.clone(),
                &project_path,
                project_name.clone(),
                output_folder.join(format!("attempt-{attempt}")),
                language,
                expected_outputs.len(),
            );
            let output = test_result.await;
            let success = output.is_ok();
            outputs.replace(output);
            if success {
                break;
            }
        }

        let log_file_path = output_folder
            .join(format!("attempt-{attempts}"))
            .join("log")
            .join("output.log");

        let log_output = fs::read_to_string(&log_file_path);
        // Remove the output directory if it was not set manually
        if std::env::var("OUTPUT_DIRECTORY").is_err() {
            let _ = fs::remove_dir_all(&output_folder);
        }

        let test_result = match outputs.unwrap() {
            Ok(outputs) => outputs,
            Err(err) => {
                match log_output {
                    Ok(log) => eprintln!("{log}"),
                    Err(err) => eprintln!("Could not read {log_file_path:?}: {err}"),
                }
                panic!("{:?}", err.wrap("Could not run experiment"));
            }
        };

        assert_eq!(
            expected_outputs.len(),
            test_result.outputs.len(),
            "Number of expected outputs does not match number of returned simulation results for \
             experiment"
        );

        for (output_idx, ((states, globals, analysis), expected)) in test_result
            .outputs
            .into_iter()
            .zip(expected_outputs.into_iter())
            .enumerate()
        {
            expected
                .assert_subset_of(&states, &globals, &analysis)
                .expect(&format!(
                    "Output of simulation {} does not match expected output in experiment",
                    output_idx + 1
                ));
        }

        let timings = TestTiming {
            experiment,
            times: test_result.duration.as_nanos(),
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
    output: PathBuf,
    language: Option<Language>,
    num_outputs_expected: usize,
) -> Result<TestOutput> {
    let project_path = project_path.as_ref();

    let nng_listen_url = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        if let Some(language) = language {
            format!("ipc://integration-test-suite-{project_name}-{language}-{now}")
        } else {
            format!("ipc://integration-test-suite-{project_name}-{now}")
        }
    };

    let (mut experiment_server, handler) = Server::create(nng_listen_url);
    tokio::spawn(async move { experiment_server.run().await });

    let manifest = load_manifest(project_path, language)
        .wrap_err_lazy(|| format!("Could not read project {project_path:?}"))?;
    let experiment_run = manifest
        .read(experiment_type)
        .wrap_err("Could not read manifest")?;

    let experiment = orchestrator::Experiment::new(ExperimentConfig {
        num_workers: num_cpus::get(),
        log_format: LogFormat::Pretty,
        log_folder: output.join("log"),
        output_folder: output,
        output_location: OutputLocation::File("output.log".into()),
        start_timeout: 10,
        wait_timeout: 10 * 60,
    });

    let output_base_directory = experiment
        .config
        .output_folder
        .join(experiment_run.base.name.as_str())
        .join(experiment_run.base.id.to_string());

    let now = Instant::now();
    experiment
        .run(experiment_run, handler)
        .await
        .wrap_err("Could not run experiment")?;
    let duration = now.elapsed();

    let outputs = iter::repeat(output_base_directory)
        .enumerate()
        .take(num_outputs_expected)
        .map(|(sim_id, base_dir)| {
            let output_dir = base_dir.join((sim_id + 1).to_string());

            let json_state = parse_file(Path::new(&output_dir).join("json_state.json"))
                .wrap_err("Could not read JSON state")?;
            let globals = parse_file(Path::new(&output_dir).join("globals.json"))
                .wrap_err("Could not read globals")?;
            let analysis_outputs = parse_file(Path::new(&output_dir).join("analysis_outputs.json"))
                .wrap_err("Could not read analysis outputs`")?;

            Ok((json_state, globals, analysis_outputs))
        })
        .collect::<Result<_>>()?;
    Ok(TestOutput { outputs, duration })
}

fn parse_file<T: DeserializeOwned, P: AsRef<Path>>(path: P) -> Result<T> {
    let path = path.as_ref();
    serde_json::from_reader(BufReader::new(
        File::open(path).wrap_err_lazy(|| format!("Could not open file {path:?}"))?,
    ))
    .wrap_err_lazy(|| format!("Could not parse {path:?}"))
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
        .wrap_err("Could not read integration test configuration")?
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
fn assert_subset_value(subset: &Value, superset: &Value, path: String) -> Result<()> {
    match (subset, superset) {
        (Value::Number(a), Value::Number(b)) if a.is_f64() && b.is_f64() => {
            ensure!(
                (a.as_f64().unwrap() - b.as_f64().unwrap()).abs() < f64::EPSILON,
                "Expected `{path} == {a}` but it was `{b}`"
            );
        }
        (Value::Array(a), Value::Array(b)) => {
            ensure!(
                a.len() == b.len(),
                "{path:?}: expected length {}, got {}.\nexpected: {}\ngot: {}",
                a.len(),
                b.len(),
                serde_json::to_string_pretty(a).unwrap(),
                serde_json::to_string_pretty(b).unwrap(),
            );
            for (i, (sub_value, super_value)) in a.iter().zip(b.iter()).enumerate() {
                assert_subset_value(sub_value, super_value, format!("{path}[{i}]"))?;
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            for (key, sub_value) in a {
                if let Some(super_value) = b.get(key) {
                    assert_subset_value(sub_value, super_value, format!("{path}.{key}"))?;
                } else {
                    bail!("{path:?}: {key:?} is not present output")
                }
            }
        }
        _ => {
            ensure!(
                subset == superset,
                "Expected `{path} == {}` but it was `{}`",
                serde_json::to_string_pretty(subset).unwrap(),
                serde_json::to_string_pretty(superset).unwrap()
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
    ) -> Result<()> {
        let mut json_state = self.json_state.iter().collect::<Vec<_>>();
        json_state.sort_unstable_by(|(lhs, _), (rhs, _)| Ord::cmp(lhs, rhs));
        for (step, expected_states) in json_state {
            let step = step
                .parse::<usize>()
                .wrap_err_lazy(|| format!("Could not parse {step:?} as number of a step"))?;
            let result_states = agent_states
                .get(step)
                .ok_or_else(|| report!("Experiment output does not contain {step} steps"))?;
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
