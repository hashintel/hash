use std::{
    fs::{self, File},
    io::BufReader,
    path::{Path, PathBuf},
};

use ::error::{ensure, Result, ResultExt};
use hash_engine::utils::OutputFormat;
use regex::Regex;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone)]
pub enum ExperimentType {
    SingleRun { num_runs: u64 },
    Simple { experiment_name: String },
}

fn parse_file<T: DeserializeOwned>(path: impl AsRef<Path>) -> Result<T> {
    let path = path.as_ref();
    serde_json::from_reader(BufReader::new(
        File::open(path).wrap_err_lazy(|| format!("Could not open file {path:?}"))?,
    ))
    .wrap_err_lazy(|| format!("Could not parse {path:?}"))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct ExperimentOutput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub json_state: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub globals: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_outputs: Option<Value>,
}

fn assert_subset_object(subset: &Value, superset: &Value, path: String) {
    match (subset, superset) {
        (Value::Null, Value::Null) => {}
        (Value::Bool(a), Value::Bool(b)) => assert_eq!(a, b, "{path:?}: Expected `{a} == {b}`"),
        (Value::Number(a), Value::Number(b)) => match (a.as_f64(), b.as_f64()) {
            (Some(a), Some(b)) if (a - b).abs() < f64::EPSILON => {}
            // Also match floats if they are not equal to keep output from `assert_eq!`
            _ => assert_eq!(a, b, "Expected `{a} == {b}` at {path:?}"),
        },
        (Value::String(a), Value::String(b)) => {
            assert_eq!(a, b, "{path:?}: Expected `{a:?} == {b:?}`")
        }
        (Value::Array(a), Value::Array(b)) if a.len() == b.len() => a
            .iter()
            .zip(b.iter())
            .enumerate()
            .for_each(|(i, (a, b))| assert_subset_object(a, b, format!("{path}.{i}"))),
        (Value::Array(a), Value::Array(b)) => {
            panic!(
                "{path:?}: expected length {}, got {}.\nexpected: {}\ngot: {}",
                a.len(),
                b.len(),
                serde_json::to_string_pretty(a).unwrap(),
                serde_json::to_string_pretty(b).unwrap(),
            )
        }
        (Value::Object(a), Value::Object(b)) => a.into_iter().for_each(|(key, sub_value)| {
            if let Some(super_value) = b.get(key) {
                assert_subset_object(sub_value, super_value, format!("{path}.{key}"));
            } else {
                panic!(
                    "{path:?}: {key:?} is not present output.\nexpected: {}\ngot: {}",
                    serde_json::to_string_pretty(a).unwrap(),
                    serde_json::to_string_pretty(b).unwrap(),
                )
            }
        }),
        _ => {
            panic!(
                "{path:?}: Expected `{} == {}`",
                serde_json::to_string_pretty(subset).unwrap(),
                serde_json::to_string_pretty(superset).unwrap()
            );
        }
    }
}

impl ExperimentOutput {
    pub fn assert_subset_of(&self, superset: &Self) {
        if let Some(sub_value) = &self.json_state {
            assert_subset_object(
                sub_value,
                superset.json_state.as_ref().unwrap(),
                String::from("json_state.json: "),
            )
        }
        if let Some(sub_value) = &self.globals {
            assert_subset_object(
                sub_value,
                superset.globals.as_ref().unwrap(),
                String::from("globals.json: "),
            )
        }
        if let Some(sub_value) = &self.analysis_outputs {
            assert_subset_object(
                sub_value,
                superset.analysis_outputs.as_ref().unwrap(),
                String::from("analysis_outputs.json: "),
            )
        }
    }
}

pub fn read_config(path: impl AsRef<Path>) -> Result<Vec<(ExperimentType, Vec<ExperimentOutput>)>> {
    #[derive(Deserialize)]
    #[serde(rename_all = "kebab-case")]
    struct Simple {
        experiment_name: String,
        expected_outputs: Vec<ExperimentOutput>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "kebab-case")]
    struct SingleRun {
        num_runs: u64,
        expected_output: ExperimentOutput,
    }

    #[derive(Deserialize)]
    struct Config {
        #[serde(default)]
        experiments: Vec<Simple>,
        #[serde(default)]
        runs: Vec<SingleRun>,
    }

    let config: Config = parse_file(path).wrap_err("Could not read configuration")?;
    let simple_iter = config.experiments.into_iter().map(
        |Simple {
             experiment_name,
             expected_outputs,
         }| { (ExperimentType::Simple { experiment_name }, expected_outputs) },
    );
    let single_run_iter = config.runs.into_iter().map(
        |SingleRun {
             num_runs,
             expected_output,
         }| {
            (ExperimentType::SingleRun { num_runs }, vec![
                expected_output,
            ])
        },
    );
    Ok(simple_iter.chain(single_run_iter).collect())
}

pub fn run_experiment(
    project: impl AsRef<Path>,
    experiment: &ExperimentType,
) -> Result<Vec<ExperimentOutput>> {
    let output = std::env::var("OUT_DIR").wrap_err("$OUT_DIR is not set")?;

    let mut cmd = std::process::Command::new("target/debug/cli");
    cmd.env("RUST_LOG", "trace")
        .arg("--project")
        .arg(project.as_ref())
        .arg("--output")
        .arg(output)
        .arg("--emit")
        .arg(OutputFormat::Full.to_string())
        .arg("--num-workers")
        .arg("1");

    match experiment {
        ExperimentType::SingleRun { num_runs } => {
            cmd.arg("single-run")
                .arg("--num-steps")
                .arg(num_runs.to_string());
        }
        ExperimentType::Simple { experiment_name } => {
            cmd.arg("simple")
                .arg("--experiment-name")
                .arg(experiment_name);
        }
    }

    let experiment = cmd.output().wrap_err("Could not run experiment command")?;
    if !experiment.stdout.is_empty() {
        println!("{}", String::from_utf8_lossy(&experiment.stdout));
    }
    if !experiment.stderr.is_empty() {
        println!("{}", String::from_utf8_lossy(&experiment.stderr));
    }

    ensure!(experiment.status.success(), "Could not run experiment");

    let mut outputs = Regex::new(r#"Making new output directory: "(.*)""#)
        .wrap_err("Could not compile regex")?
        .captures_iter(&String::from_utf8_lossy(&experiment.stderr))
        .map(|output_dir_capture| PathBuf::from(&output_dir_capture[1]))
        .collect::<Vec<_>>();
    outputs.sort_unstable();
    outputs
        .into_iter()
        .map(|output_dir| {
            let json_state = parse_file(Path::new(&output_dir).join("json_state.json"))
                .wrap_err("Could not read JSON state")?;
            let globals = parse_file(Path::new(&output_dir).join("globals.json"))
                .wrap_err("Could not read globals")?;
            let analysis_outputs = parse_file(Path::new(&output_dir).join("analysis_outputs.json"))
                .wrap_err("Could not read analysis outputs`")?;

            let _ = fs::remove_dir_all(&output_dir);

            Ok(ExperimentOutput {
                globals: Some(globals),
                json_state: Some(json_state),
                analysis_outputs: Some(analysis_outputs),
            })
        })
        .collect()
}
