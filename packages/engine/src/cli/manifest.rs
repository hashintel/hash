use crate::{ExperimentType, SimpleExperimentArgs};
use hash_prime::fetch::parse_raw_csv_into_json;
use hash_prime::proto::{
    ExperimentPackageConfig, ExperimentRun, ExperimentRunBase, InitialState, InitialStateName,
    ProjectBase, SharedBehavior, SharedDataset, SimPackageArgs, SimpleExperimentConfig,
    SingleRunExperimentConfig,
};
use rand::{Rng, RngCore};
use rand_distr::{Beta, Distribution, LogNormal, Normal, Poisson};
use serde;
use serde::{Deserialize, Serialize};
use serde_json::{Map as SerdeMap, Value as SerdeValue};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs::read_to_string;
use std::io::Read;
use std::path::{Path, PathBuf};

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("Error in `experiments.json`: {0}")]
    Unique(String),

    #[error("Deserialization error for `experiments.json`: {0}")]
    Serde(String),

    #[error("Deserialization error for `experiments.json`: {0}")]
    FromSerde(#[from] serde_json::Error),

    #[error("Expected an `experiments.json` file")]
    ExpectedExperimentsManifest,

    #[error("I/O Error: {0}")]
    IO(#[from] std::io::Error),
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Unique(s)
    }
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Unique(s.to_string())
    }
}

pub fn read_manifest(
    project_path: PathBuf,
    experiment_type: &ExperimentType,
) -> Result<ExperimentRun> {
    let project_base = read_project(project_path)?;
    let experiment_run_id = create_experiment_run_id(experiment_type);
    let base = ExperimentRunBase {
        id: experiment_run_id.to_string(),
        project_base,
    };

    let package_config = get_package_config(&base, experiment_type)?;
    let experiment_run = ExperimentRun {
        base,
        package_config,
    };
    Ok(experiment_run)
}

fn create_experiment_run_id(experiment_type: &ExperimentType) -> String {
    // Generates a 6-digit hexadecimal and concats with the experiment name
    // by {experiment_name}-{6-digit hex}
    let mut rng = rand::thread_rng();
    let num = rng.gen_range(0_usize..16_777_216);
    let name = match experiment_type {
        ExperimentType::SingleRunExperiment(_) => "single_run",
        ExperimentType::SimpleExperiment(simple) => &simple.experiment_name,
    };
    return format!("{}-{:06x}", name, num);
}

struct Project {
    path: PathBuf,
    behaviors: Vec<SharedBehavior>,
    initial_state: Option<InitialState>,
    globals_json: Option<String>,
    analysis_json: Option<String>,
    experiments_json: Option<String>,
    dependencies_json: Option<String>,
    datasets: Vec<SharedDataset>,
}

fn get_file_contents(path: &Path) -> Option<String> {
    let res = std::fs::File::open(&path).map(|mut file| {
        let mut contents = String::new();
        file.read_to_string(&mut contents).map(|_| contents)
    });
    if let Ok(Ok(res)) = res {
        return Some(res);
    }
    None
}

fn read_local_project(project_path: &Path) -> Result<Project> {
    let experiments_json = project_path.join("experiments.json");
    let dependencies_json = project_path.join("dependencies.json");
    let src_folder = project_path.join("src");
    let behaviors_folder = src_folder.join("behaviors");
    let init_json = src_folder.join("init.json");
    let init_js = src_folder.join("init.js");
    let init_py = src_folder.join("init.py");
    let globals_json = src_folder.join("globals.json");
    let views_folder = project_path.join("views");
    let analysis_json = views_folder.join("analysis.json");
    let data_folder = project_path.join("data");

    let project = Project {
        path: project_path.into(),
        behaviors: read_local_behaviors(&behaviors_folder)?,
        initial_state: read_local_init_file(init_json, init_js, init_py),
        globals_json: get_file_contents(&globals_json),
        analysis_json: get_file_contents(&analysis_json),
        experiments_json: get_file_contents(&experiments_json),
        dependencies_json: get_file_contents(&dependencies_json),
        datasets: read_local_datasets(data_folder)?,
    };

    Ok(project)
}

fn read_local_init_file(
    init_json: PathBuf,
    init_js: PathBuf,
    init_py: PathBuf,
) -> Option<InitialState> {
    let mut init_path: PathBuf;
    let state_name: InitialStateName;

    if init_js.is_file() {
        init_path = init_js;
        state_name = InitialStateName::InitJs;

        if init_py.is_file() {
            log::warn!("init.py was supplied with init.js, ignoring init.py")
        }
        if init_json.is_file() {
            log::warn!("init.json was supplied with init.js, ignoring init.json")
        }
    } else if init_py.is_file() {
        init_path = init_py;
        state_name = InitialStateName::InitPy;

        if init_json.is_file() {
            log::warn!("init.json was supplied with init.py, ignoring init.json")
        }
    } else if init_json.is_file() {
        init_path = init_json;
        state_name = InitialStateName::InitJson;
    } else {
        return None;
    }

    Some(InitialState {
        name: state_name,
        src: read_to_string(init_path).unwrap(),
    })
}

fn read_local_datasets(data_folder: PathBuf) -> Result<Vec<SharedDataset>> {
    Ok(data_folder
        .read_dir()?
        .filter_map(|entry| {
            if let Ok(entry) = entry {
                if entry.path().is_file() {
                    let file_name = entry.file_name().to_str().unwrap().to_string();
                    if file_name.ends_with(".json") || file_name.ends_with(".csv") {
                        let mut data = read_to_string(entry.path()).unwrap();
                        if file_name.ends_with(".csv") {
                            data = parse_raw_csv_into_json(data).unwrap()
                        }
                        return Some(SharedDataset {
                            name: Some(file_name.clone()),
                            shortname: file_name.clone(),
                            filename: file_name.clone(),
                            url: None,
                            raw_csv: file_name.ends_with(".csv"),
                            data: Some(data),
                        });
                    }
                }
            }
            None
        })
        .collect::<Vec<_>>())
}

fn read_local_behaviors(behaviors_folder: &Path) -> Result<Vec<SharedBehavior>> {
    let mut behavior_files = vec![];
    for entry in std::fs::read_dir(behaviors_folder)? {
        let path = entry?.path();
        let extension = path.extension();
        if extension == Some(OsStr::new("js")) || extension == Some(OsStr::new("py")) {
            behavior_files.push(path);
        }
    }

    let mut behaviors = Vec::with_capacity(behavior_files.len());

    for behavior_file_path in behavior_files {
        let behavior_file_name = behavior_file_path
            .file_name()
            .ok_or_else(|| Error::from("behavior file expected to have proper file name"))?
            .to_string_lossy()
            .to_string();
        let behavior_key_file_name = format!("{}.json", behavior_file_name);
        let behavior_key_file_path = behaviors_folder.join(&behavior_key_file_name);

        let behavior = SharedBehavior {
            // `id`, `name` and `shortnames` may be updated later if this behavior is a dependency
            id: behavior_file_name,
            name: behavior_file_name.clone(),
            shortnames: vec![], // if this is a dependency, then these will be updated later
            behavior_src: get_file_contents(&behavior_file_path),
            // this may not return anything if file doesn't exist
            behavior_keys_src: get_file_contents(&behavior_key_file_path),
        };
        behaviors.push(behavior);
    }
    Ok(behaviors)
}

fn _try_read_local_dependencies(local_project: &Project) -> std::io::Result<Vec<PathBuf>> {
    let mut dependency_path = local_project.path.clone();
    dependency_path.push("dependencies/");

    let mut entries = dependency_path
        .read_dir()?
        .filter_map(|dir_res| {
            if let Ok(entry) = dir_res {
                // check it's a folder and matches the pattern of a user namespace (i.e. `@user`)
                if entry.path().is_dir() && entry.file_name().to_str()?.starts_with("@") {
                    return Some(entry);
                }
            }
            None
        })
        .map(|user_dir| user_dir.path().read_dir())
        .collect::<Result<Vec<_>, _>>()? // Intermediary collect and iter to handle errors from read_dir
        .into_iter()
        .flatten()
        .filter_map(|dir_res| {
            if let Ok(entry) = dir_res {
                entry.path().canonicalize().ok()
            } else {
                None
            }
        })
        .collect::<Vec<PathBuf>>();

    entries.sort();
    Ok(entries)
}

fn local_dependencies_folders(local_project: &Project) -> Vec<PathBuf> {
    // TODO do we want this wrapper to provide a default, or should we just unwrap
    _try_read_local_dependencies(local_project).unwrap_or(vec![])
}

fn add_dependencies_to_project(
    local_project: &mut Project,
    dependency_projects: HashMap<PathBuf, Project>,
) -> Result<()> {
    // This is a bit complex to write down -- easier for me (joh) to implement myself
    // need to special merge behaviors
    // need to special merge datasets too
    // projects don't contain rust behaviors by default,
    //      if dependencies.json has a rust dep, add it as a rust behavior shell

    // iter over dependencies in local_project.dependencies_json
    // for each dep path
    //   find dependency project within dependency_projects
    //   @user/*.js depth search for the *.js within behaviors folders
    // packages/apiclient/src/client.rs:295
    todo!()
}

fn read_project(project_path: PathBuf) -> Result<ProjectBase> {
    let mut local_project = read_local_project(&project_path)?;
    let behaviors_deps_folders = local_dependencies_folders(&local_project);
    let dep_projects = behaviors_deps_folders
        .into_iter()
        .map(|path| match read_local_project(&path) {
            Ok(project) => Ok((path, project)),
            Err(err) => Err(err),
        })
        .collect::<Result<HashMap<PathBuf, Project>>>()?;
    add_dependencies_to_project(&mut local_project, dep_projects)?;

    let project_base = ProjectBase {
        initial_state: local_project
            .initial_state
            .ok_or_else(|| Error::from("Project must specify an initial state file."))?,
        globals_src: local_project
            .globals_json
            .ok_or_else(|| Error::from("Project must contain a `globals.json` file"))?,
        dependencies_src: local_project.dependencies_json,
        experiments_src: local_project.experiments_json,
        behaviors: local_project.behaviors,
        datasets: local_project.datasets,
        // TODO allow packages themselves to implement resolvers for local projects to build this field
        packages: vec![SimPackageArgs {
            name: "analysis".into(),
            data: SerdeValue::String(local_project.analysis_json.unwrap_or("".into())),
        }],
    };

    Ok(project_base)
}

fn get_package_config(
    base: &ExperimentRunBase,
    experiment_type: &ExperimentType,
) -> Result<ExperimentPackageConfig> {
    match experiment_type {
        ExperimentType::SingleRunExperiment(single) => Ok(ExperimentPackageConfig::SingleRun(
            SingleRunExperimentConfig {
                num_steps: single.num_steps,
            },
        )),
        ExperimentType::SimpleExperiment(simple) => Ok(ExperimentPackageConfig::Simple(
            get_simple_experiment_config(base, simple)?,
        )),
    }
}

fn get_simple_experiment_config(
    base: &ExperimentRunBase,
    args: &SimpleExperimentArgs,
) -> Result<SimpleExperimentConfig> {
    let experiments_manifest = base
        .project_base
        .experiments_src
        .clone()
        .ok_or_else(|| Error::ExpectedExperimentsManifest)?;
    let parsed = serde_json::from_str::<SerdeMap<String, SerdeValue>>(&experiments_manifest)
        .map_err(|_| Error::Serde("Expected experiments.json to contain a json object".into()))?; // TODO OS - why not just use derived from
    let plan = create_experiment_plan(&parsed, &args.experiment_name)?;
    let config = SimpleExperimentConfig {
        experiment_name: args.experiment_name.clone(),
        changed_properties: plan
            .inner
            .into_iter()
            .flat_map(|mut v| v.fields.into_values())
            .collect(),
        num_steps: plan.num_steps,
    };
    Ok(config)
}

fn create_experiment_plan(
    experiments: &SerdeMap<String, SerdeValue>,
    experiment_name: &str,
) -> Result<SimpleExperimentPlan> {
    let selected_experiment = experiments.get(experiment_name).ok_or_else(|| Error::Serde(format!("Expected experiments.json to contain the specified experiment definition for experiment with name: {}", &experiment_name)))?;
    let experiment_type = selected_experiment
        .get("type")
        .ok_or_else(|| {
            Error::Serde("Expected experiment definition to contain an experiment type".into())
        })?
        .as_str()
        .ok_or_else(|| {
            Error::Serde("Expected experiment definition type to have a string value".into())
        })?;
    return match experiment_type {
        "group" => create_group_variant(selected_experiment, &experiments),
        "multiparameter" => create_multiparameter_variant(selected_experiment, &experiments),
        "optimization" => Err(Error::Serde(
            "Not implemented for optimization experiment types".into(),
        )),
        _ => create_basic_variant(selected_experiment, experiment_type),
    };
}

fn create_multiparameter_variant(
    selected_experiment: &SerdeValue,
    experiments: &SerdeMap<String, SerdeValue>,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct MultiparameterVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: usize,
        runs: Vec<String>,
    }

    let var: MultiparameterVariant = serde_json::from_value(selected_experiment.clone())?;
    let subplans = var.runs.iter().map(|run_name| {
        let selected = experiments.get(run_name).ok_or_else(|| Error::Serde(format!("Expected experiments.json to contain the specified experiment definition for experiment with name: {}", run_name)))?;
        create_basic_variant(selected, run_name)
    }).collect::<Result<Vec<_>>>()?;

    let mut variant_list: Vec<ExperimentPlanEntry> = vec![];
    for (i, subplan) in subplans.into_iter().enumerate() {
        if i == 0 {
            variant_list = subplan.inner;
        } else {
            let mut new_variant_list: Vec<ExperimentPlanEntry> = vec![];
            for entry in subplan.inner.into_iter().map(|v| v.fields) {
                for existing_entry in &variant_list {
                    let mut merged = existing_entry.clone();
                    entry.iter().for_each(|(name, value)| {
                        merged.fields.insert(name.clone(), value.clone());
                    });
                    new_variant_list.push(merged);
                }
            }
            variant_list = new_variant_list;
        }
    }

    let mut plan = SimpleExperimentPlan::new(var.steps);
    plan.inner = variant_list;
    Ok(plan)
}

fn create_group_variant(
    selected_experiment: &SerdeValue,
    experiments: &SerdeMap<String, SerdeValue>,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct GroupVariant {
        // TODO move ALL variants to proto, experiment plan creation to simple exp controller def
        #[serde(rename = "type")]
        _type: String,
        steps: f64, // TODO OS - Why is steps an f64 instead of usize
        runs: Vec<String>,
    }
    let var: GroupVariant = serde_json::from_value(selected_experiment.clone())?;
    var.runs.iter().try_fold(
        SimpleExperimentPlan::new(var.steps as usize),
        |mut acc, name| {
            let variants = create_experiment_plan(experiments, name)?;
            variants.inner.into_iter().for_each(|v| {
                acc.push(v);
            });
            Ok(acc)
        },
    )
}

fn create_basic_variant(
    selected_experiment: &SerdeValue,
    experiment_type: &str,
) -> Result<SimpleExperimentPlan> {
    return match experiment_type {
        "monte-carlo" => create_monte_carlo_variant_plan(selected_experiment),
        "values" => create_value_variant_plan(selected_experiment),
        "linspace" => create_linspace_variant_plan(selected_experiment),
        "arange" => create_arange_variant_plan(selected_experiment),
        "meshgrid" => create_meshgrid_variant_plan(selected_experiment),
        _ => Err(Error::Serde(format!(
            "Unexpected experiment type: {}",
            experiment_type
        ))),
    };
}

pub type Mapper = Box<dyn Fn(SerdeValue, usize) -> SerdeValue>;

fn create_variant_with_mapped_value(
    field: &str,
    items: &Vec<SerdeValue>,
    mapper: &Mapper,
    num_steps: usize,
) -> Result<SimpleExperimentPlan> {
    let plan = items.iter().enumerate().fold(
        SimpleExperimentPlan::new(num_steps),
        |mut acc, (index, val)| {
            let mapped_value = mapper(val.clone(), index);
            acc.push(HashMap::from([(field.to_string(), mapped_value)]).into());
            acc
        },
    );

    Ok(plan)
}

fn create_monte_carlo_variant_plan(
    selected_experiment: &SerdeValue,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct MonteCarloVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        samples: f64,
        distribution: String,
        mean: Option<f64>,
        std: Option<f64>,
        mu: Option<f64>,
        sigma: Option<f64>,
        rate: Option<f64>,
        alpha: Option<f64>,
        beta: Option<f64>,
        shape: Option<f64>,
        scale: Option<f64>,
    }

    // Needed trait objects of distributions, solution from: https://users.rust-lang.org/t/vec-of-rand-distribution-trait-objects/58727/2
    pub trait DynDistribution<T> {
        fn sample_(&self, rng: &mut dyn RngCore) -> T;
    }

    impl<D, T> DynDistribution<T> for D
    where
        D: Distribution<T>,
    {
        fn sample_(&self, rng: &mut dyn RngCore) -> T {
            <Self as Distribution<T>>::sample(self, rng)
        }
    }

    impl<T> Distribution<T> for dyn DynDistribution<T> + '_ {
        fn sample<R: Rng + ?Sized>(&self, mut rng: &mut R) -> T {
            self.sample_(&mut rng)
        }
    }

    impl MonteCarloVariant {
        fn sample_distribution_fn(&self) -> Result<Mapper> {
            let distribution = match self.distribution.as_str() {
                "normal" => Box::new(
                    Normal::new(self.mean.unwrap_or(1.0), self.std.unwrap_or(1.0)).map_err(
                        |e| Error::from(format!("failed to create distribution: {:?}", e)),
                    )?,
                ) as Box<dyn DynDistribution<f64>>,
                "log-normal" => Box::new(
                    LogNormal::new(self.mu.unwrap_or(1.0), self.sigma.unwrap_or(1.0)).map_err(
                        |e| Error::from(format!("failed to create distribution: {:?}", e)),
                    )?,
                ),
                "poisson" => {
                    Box::new(Poisson::new(self.rate.unwrap_or(1.0)).map_err(|e| {
                        Error::from(format!("failed to create distribution: {:?}", e))
                    })?)
                }
                "beta" => Box::new(
                    Beta::new(self.alpha.unwrap_or(1.0), self.beta.unwrap_or(1.0)).map_err(
                        |e| Error::from(format!("failed to create distribution: {:?}", e)),
                    )?,
                ),
                "gamma" => Box::new(
                    rand_distr::Gamma::new(self.shape.unwrap_or(1.0), self.scale.unwrap_or(1.0))
                        .map_err(|e| {
                            Error::from(format!("failed to create distribution: {:?}", e))
                        })?,
                ),
                _ => {
                    Box::new(Normal::new(1.0, 1.0).map_err(|e| {
                        Error::from(format!("failed to create distribution: {:?}", e))
                    })?)
                }
            };
            let mut rng = rand::thread_rng();
            Ok(Box::new(move || distribution.sample(&mut rng).into()))
        }
    }

    let var: MonteCarloVariant = serde_json::from_value(selected_experiment.clone())?;
    let values = (0..var.samples as usize).map(|_| 0.into()).collect();
    create_variant_with_mapped_value(
        &var.field,
        &values,
        &var.sample_distribution_fn()?,
        var.steps as usize,
    )
}

fn create_value_variant_plan(selected_experiment: &SerdeValue) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct ValueVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        values: Vec<SerdeValue>,
    }

    let var: ValueVariant = serde_json::from_value(selected_experiment.clone())?;
    create_variant_with_mapped_value(
        &var.field,
        &var.values,
        &Box::new(|val, index| val),
        var.steps as usize,
    )
}

fn create_linspace_variant_plan(selected_experiment: &SerdeValue) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct LinspaceVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        samples: f64,
        start: f64,
        stop: f64,
    }
    let var: LinspaceVariant = serde_json::from_value(selected_experiment.clone())?;
    let values = (0..var.samples as usize).map(|_| 0.into()).collect();
    create_variant_with_mapped_value(
        &var.field,
        &values,
        &Box::new(|val, index| {
            (var.start + (index as f64 * (var.stop - var.start)) / ((var.samples - 1) as f64))
                .into()
        }),
        var.steps as usize,
    )
}

fn create_arange_variant_plan(selected_experiment: &SerdeValue) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct ArangeVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        increment: f64,
        start: f64,
        stop: f64,
    }
    let var: ArangeVariant = serde_json::from_value(selected_experiment.clone())?;
    let mut values = vec![];
    let mut cur = var.start;
    while cur <= var.stop {
        values.push(cur.into());
        cur += var.increment;
    }
    create_variant_with_mapped_value(
        &var.field,
        &values,
        &Box::new(|val, index| val),
        var.steps as usize,
    )
}

fn create_meshgrid_variant_plan(selected_experiment: &SerdeValue) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct MeshgridVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        x_field: String,
        y_field: String,
        x: [f64; 3], // [start, stop, num_samples]
        y: [f64; 3], // [start, stop, num_samples]
    }
    let var: MeshgridVariant = serde_json::from_value(selected_experiment.clone())?;

    let mut plan = SimpleExperimentPlan::new(var.steps as usize);
    let x_space = linspace(var.x[0], var.x[1], var.x[2] as usize);
    let y_space = linspace(var.y[0], var.y[1], var.y[2] as usize);

    for x_val in x_space {
        for y_val in y_space {
            let entry = HashMap::from([
                (var.x_field.clone(), x_val.into()),
                (var.y_field.clon(), y_val.into()),
            ])
            .into();
            plan.push(entry);
        }
    }

    Ok(plan)
}

fn linspace(start: f64, stop: f64, num_samples: usize) -> Vec<f64> {
    let mut samples = vec![];
    let length = (stop - start) / (num_samples - 1) as f64;
    let mut index = start;
    while index <= stop {
        samples.push(start + length * index);
        index += length;
    }
    samples
}

#[derive(Clone)]
struct ExperimentPlanEntry {
    fields: HashMap<String, SerdeValue>,
}

impl From<HashMap<String, SerdeValue>> for ExperimentPlanEntry {
    fn from(fields: HashMap<String, SerdeValue>) -> Self {
        ExperimentPlanEntry { fields }
    }
}

#[derive(Clone)]
struct SimpleExperimentPlan {
    inner: Vec<ExperimentPlanEntry>,
    num_steps: usize,
}

impl SimpleExperimentPlan {
    pub fn new(num_steps: usize) -> SimpleExperimentPlan {
        SimpleExperimentPlan {
            inner: Vec::new(),
            num_steps,
        }
    }

    pub fn push(&mut self, value: ExperimentPlanEntry) {
        self.inner.push(value);
    }
}
