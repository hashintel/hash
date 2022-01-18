use std::{
    collections::HashMap,
    fs::{self, File},
    io::BufReader,
    path::Path,
};

use error::{bail, ensure, report, Result, ResultExt};
use hash_engine::utils::OutputFormat;
use regex::Regex;
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

pub enum Experiment {
    Simple { experiment: String },
    SingleRun { steps: u64 },
}

impl Experiment {
    pub fn run(&self, project: impl AsRef<Path>) -> Result<Vec<(AgentStates, Globals, Analysis)>> {
        let output = std::env::var("OUT_DIR").wrap_err("$OUT_DIR is not set")?;
        let manifest_path =
            std::env::var("CARGO_MANIFEST_DIR").wrap_err("$CARGO_MANIFEST_DIR is not set")?;
        let manifest_path = Path::new(&manifest_path);

        let mut cmd = std::process::Command::new(manifest_path.join("target/debug/cli"));
        // TODO: Consider running with `RUST_LOG=info` and rerun with `trace` on failure
        cmd.env("RUST_LOG", "info")
            .arg("--project")
            .arg(project.as_ref())
            .arg("--output")
            .arg(output)
            .arg("--emit")
            .arg(OutputFormat::Full.to_string())
            .arg("--num-workers")
            .arg("1");

        match self {
            Experiment::SingleRun { steps } => {
                cmd.arg("single-run")
                    .arg("--num-steps")
                    .arg(steps.to_string());
            }
            Experiment::Simple { experiment } => {
                cmd.arg("simple").arg("--experiment-name").arg(experiment);
            }
        }

        let experiment = cmd.output().wrap_err("Could not run experiment command")?;
        if !experiment.stdout.is_empty() {
            println!("{}", String::from_utf8_lossy(&experiment.stdout));
        }
        if !experiment.stderr.is_empty() {
            eprintln!("{}", String::from_utf8_lossy(&experiment.stderr));
        }

        ensure!(experiment.status.success(), "Could not run experiment");

        // Split output directory into `path/to/simulation/` and `<num>` to make it sortable
        // We need to be able to sort it as outputs happen in any order and it has to be mapped
        // properly to the order of the expected outputs that are given
        let mut outputs = Regex::new(r#"Making new output directory: "(.*)""#)
            .wrap_err("Could not compile regex")?
            .captures_iter(&String::from_utf8_lossy(&experiment.stderr))
            .map(|output_dir_capture| {
                let output_dir = Path::new(&output_dir_capture[1]);
                let output_dir_base = output_dir.parent().unwrap().to_path_buf();
                let simulation_number = output_dir
                    .strip_prefix(&output_dir_base)
                    .unwrap()
                    .to_string_lossy()
                    .parse::<u64>()
                    .expect("Unable to parse simulation run ID as integer");
                (output_dir_base, simulation_number)
            })
            .collect::<Vec<_>>();
        outputs.sort_unstable();
        outputs
            .into_iter()
            .map(|(output_dir_base, simulation_number)| {
                let output_dir = output_dir_base.join(simulation_number.to_string());
                let json_state = parse_file(Path::new(&output_dir).join("json_state.json"))
                    .wrap_err("Could not read JSON state")?;
                let globals = parse_file(Path::new(&output_dir).join("globals.json"))
                    .wrap_err("Could not read globals")?;
                let analysis_outputs =
                    parse_file(Path::new(&output_dir).join("analysis_outputs.json"))
                        .wrap_err("Could not read analysis outputs`")?;

                let _ = fs::remove_dir_all(&output_dir);

                Ok((json_state, globals, analysis_outputs))
            })
            .collect()
    }
}

fn parse_file<T: DeserializeOwned, P: AsRef<Path>>(path: P) -> Result<T> {
    let path = path.as_ref();
    serde_json::from_reader(BufReader::new(
        File::open(path).wrap_err_lazy(|| format!("Could not open file {path:?}"))?,
    ))
    .wrap_err_lazy(|| format!("Could not parse {path:?}"))
}

pub fn read_config<P: AsRef<Path>>(path: P) -> Result<Vec<(Experiment, Vec<ExpectedOutput>)>> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    pub enum ConfigValue {
        #[serde(rename_all = "kebab-case")]
        Simple {
            experiment: String,
            expected_outputs: Vec<ExpectedOutput>,
        },
        #[serde(rename_all = "kebab-case")]
        SingleRun {
            steps: u64,
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
            } => (Experiment::Simple { experiment }, expected_outputs),
            ConfigValue::SingleRun {
                steps,
                expected_output,
            } => (Experiment::SingleRun { steps }, vec![expected_output]),
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
                assert_subset_value(sub_value, super_value, format!("{path}.{i}"))?;
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
            assert_subset_value(expected_states, result_states, String::from("json_state"))
                .wrap_err_lazy(|| {
                    format!("`json_state.json` does not match expected output in step {step}")
                })?;
        }

        if let Some(expected_globals) = &self.globals {
            assert_subset_value(expected_globals, globals, String::from("globals"))
                .wrap_err("`globals.json` does not contain expected output")?;
        }

        if let Some(expected_analysis) = &self.analysis_outputs {
            assert_subset_value(
                expected_analysis,
                analysis,
                String::from("analysis_outputs"),
            )
            .wrap_err("`analysis_outputs.json` does not contain expected output")?;
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
