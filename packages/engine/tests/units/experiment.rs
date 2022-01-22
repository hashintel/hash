use std::{
    collections::HashMap,
    fs::{self, File},
    io::BufReader,
    iter,
    path::Path,
    time::Duration,
};

use error::{bail, ensure, report, Result, ResultExt};
use hash_engine::{proto::ExperimentName, utils::OutputFormat, Language};
use orchestrator::{create_server, ExperimentConfig, ExperimentType, Manifest};
use serde::{de::DeserializeOwned, Deserialize};
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

fn load_manifest<P: AsRef<Path>>(project_path: P, language: Option<Language>) -> Result<Manifest> {
    let project_path = project_path.as_ref();

    let experiments_json = project_path.join("experiments.json");
    let src_folder = project_path.join("src");
    let behaviors_folder = src_folder.join("behaviors");
    let globals_json = src_folder.join("globals.json");
    let views_folder = project_path.join("views");
    let analysis_json = views_folder.join("analysis.json");
    let data_folder = project_path.join("data");

    let mut project = Manifest::new();

    let (init_js, init_py, init_json) = match language {
        Some(Language::JavaScript) => (
            src_folder.join("init-js.js"),
            src_folder.join("init-js.py"),
            src_folder.join("init-js.json"),
        ),
        Some(Language::Python) => (
            src_folder.join("init-py.js"),
            src_folder.join("init-py.py"),
            src_folder.join("init-py.json"),
        ),
        Some(Language::Rust) => (
            src_folder.join("init-rs.js"),
            src_folder.join("init-rs.py"),
            src_folder.join("init-rs.json"),
        ),
        None => (
            src_folder.join("init.js"),
            src_folder.join("init.py"),
            src_folder.join("init.json"),
        ),
    };
    if init_js.is_file() {
        project.set_initial_state_from_file(init_js)?;
    } else if init_py.is_file() {
        project.set_initial_state_from_file(init_py)?;
    } else if init_json.is_file() {
        project.set_initial_state_from_file(init_json)?;
    }

    if globals_json.exists() {
        project
            .set_globals_from_file(globals_json)
            .wrap_err("Could not read globals")?;
    }
    if analysis_json.exists() {
        project
            .set_analysis_from_file(analysis_json)
            .wrap_err("Could not read analysis view")?;
    }
    if experiments_json.exists() {
        project
            .set_experiments_from_file(experiments_json)
            .wrap_err("Could not read experiments")?;
    }
    if behaviors_folder.exists() {
        project
            .add_behaviors_from_directory(behaviors_folder)
            .wrap_err("Could not read local behaviors")?;
    }
    if data_folder.exists() {
        project
            .add_datasets_from_directory(data_folder)
            .wrap_err("Could not read local datasets")?;
    }

    Ok(project)
}

pub async fn run_test_suite<P: AsRef<Path>>(project_path: P, language: Option<Language>) {
    std::env::set_var("RUST_LOG", "info");

    let project_path = project_path.as_ref();

    let experiments = read_config(project_path.join("integration-test.json"))
        .expect("Could not read experiments");
    for (experiment_type, expected_outputs) in experiments {
        // TODO: Remove attempting strategy
        let mut outputs = None;
        let attempts = 5;
        for attempt in 1..=attempts {
            if attempt > 1 {
                std::env::set_var("RUST_LOG", "trace");
            }
            println!(
                "\n\n\nRunning test {:?} attempt {attempt}/{attempts}:\n",
                project_path.file_name().unwrap()
            );
            let test_result = run_test(
                experiment_type.clone(),
                &project_path,
                language,
                expected_outputs.len(),
            );
            match test_result.await {
                Ok(out) => {
                    outputs.replace(out);
                    break;
                }
                Err(err) => eprintln!("\n\n{err:?}\n\n"),
            }
        }
        let outputs = outputs.expect(&format!("Could not run experiment"));

        assert_eq!(
            expected_outputs.len(),
            outputs.len(),
            "Number of expected outputs does not match number of returned simulation results for \
             experiment"
        );

        for (output_idx, ((states, globals, analysis), expected)) in outputs
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
    }
}

pub async fn run_test<P: AsRef<Path>>(
    experiment_type: ExperimentType,
    project_path: P,
    language: Option<Language>,
    num_outputs_expected: usize,
) -> Result<Vec<(AgentStates, Globals, Analysis)>> {
    let project_path = project_path.as_ref();
    let project_name = project_path
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

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

    let (mut experiment_server, handler) = create_server(nng_listen_url)?;
    tokio::spawn(async move { experiment_server.run().await });

    let manifest = load_manifest(project_path, language)
        .wrap_err_lazy(|| format!("Could not read project {project_path:?}"))?;
    let experiment_run = manifest
        .read(experiment_type)
        .wrap_err("Could not read manifest")?;

    let experiment = orchestrator::Experiment::new(ExperimentConfig {
        num_workers: num_cpus::get(),
        emit: OutputFormat::Full,
        output_folder: std::env::var("OUT_DIR")
            .wrap_err("$OUT_DIR is not set")?
            .into(),
        engine_start_timeout: Duration::from_secs(10),
        engine_wait_timeout: Duration::from_secs(10 * 60),
    });

    let output_base_directory = experiment
        .config
        .output_folder
        .join(experiment_run.base.name.as_str())
        .join(experiment_run.base.id.to_string());

    experiment
        .run(experiment_run, project_name, handler)
        .await
        .wrap_err("Could not run experiment")?;

    iter::repeat(output_base_directory)
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

            let _ = fs::remove_dir_all(&output_dir);

            Ok((json_state, globals, analysis_outputs))
        })
        .collect()
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
                "{path:?}: Expected `{a} == {b}`"
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
                "{path:?}: Expected `{} == {}`",
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
        for (step, expected_states) in &self.json_state {
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
