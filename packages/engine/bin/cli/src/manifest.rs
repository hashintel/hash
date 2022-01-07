use std::{
    collections::HashMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

use error::{bail, report, Result, ResultExt};
use hash_engine::{
    fetch::parse_raw_csv_into_json,
    proto::{
        ExperimentPackageConfig, ExperimentRun, ExperimentRunBase, InitialState, InitialStateName,
        ProjectBase, SharedBehavior, SharedDataset, SimPackageArgs, SimpleExperimentConfig,
        SingleRunExperimentConfig,
    },
};
use rand::{Rng, RngCore};
use rand_distr::{Beta, Distribution, LogNormal, Normal, Poisson};
use serde::{self, Deserialize, Serialize};
use serde_json::{json, Map as SerdeMap, Value as SerdeValue};

use crate::{ExperimentType, SimpleExperimentArgs};

lazy_static! {
    static ref BEHAVIOR_FILE_EXTENSIONS: [&'static OsStr; 3] =
        [OsStr::new("js"), OsStr::new("py"), OsStr::new("rs")];
    static ref DATASET_FILE_EXTENSIONS: [&'static OsStr; 2] =
        [OsStr::new("csv"), OsStr::new("json")];
}

pub fn read_manifest(
    project_path: &Path,
    experiment_type: &ExperimentType,
) -> Result<ExperimentRun> {
    let project_base = read_project(project_path)
        .wrap_err_lazy(|| format!("Could not read project: {project_path:?}"))?;
    let experiment_run_id = create_experiment_run_id(experiment_type);
    let base = ExperimentRunBase {
        id: experiment_run_id,
        project_base,
    };

    let package_config = get_package_config(&base, experiment_type)
        .wrap_err_lazy(|| format!("Could not read package config: {project_path:?}"))?;
    let experiment_run = ExperimentRun {
        base,
        package_config,
    };
    Ok(experiment_run)
}

fn create_experiment_run_id(experiment_type: &ExperimentType) -> String {
    // Generates a 6-digit hexadecimal and concats with the experiment name by
    // {experiment_name}-{6-digit hex}
    let mut rng = rand::thread_rng();
    let num = rng.gen_range(0_usize..16_777_216);
    let name = match experiment_type {
        ExperimentType::SingleRunExperiment(_) => "single_run",
        ExperimentType::SimpleExperiment(simple) => &simple.experiment_name,
    };
    return format!("{name}-{num:06x}");
}

#[derive(Debug)]
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

fn get_file_contents(path: &Path) -> Result<String> {
    debug!("Reading contents at path: {path:?}");
    fs::read_to_string(path).wrap_err_lazy(|| format!("Could not read file: {path:?}"))
}

fn get_file_contents_opt(path: &Path) -> Result<Option<String>> {
    if !path.exists() {
        Ok(None)
    } else {
        Some(get_file_contents(path)).transpose()
    }
}

fn read_local_project(project_path: &Path) -> Result<Project> {
    debug!(
        "Reading local project at: {}",
        project_path.to_string_lossy()
    );
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

    Ok(Project {
        path: project_path.into(),
        behaviors: read_local_behaviors(&behaviors_folder)
            .wrap_err("Could not read local behaviors")?,
        initial_state: read_local_init_file(init_json, init_js, init_py)
            .wrap_err("Could not read local init file")?,
        globals_json: get_file_contents_opt(&globals_json).wrap_err("Could not read globals")?,
        analysis_json: get_file_contents_opt(&analysis_json)
            .wrap_err("Could not read analysis data")?,
        experiments_json: get_file_contents_opt(&experiments_json)
            .wrap_err("Could not read experiments")?,
        dependencies_json: get_file_contents_opt(&dependencies_json)
            .wrap_err("Could not read dependencies")?,
        datasets: read_local_datasets(data_folder).wrap_err("Could not read local datasets")?,
    })
}

fn read_local_init_file(
    init_json: PathBuf,
    init_js: PathBuf,
    init_py: PathBuf,
) -> Result<Option<InitialState>> {
    let init_path: PathBuf;
    let state_name: InitialStateName;

    debug!("Reading local init files");
    if init_js.is_file() {
        init_path = init_js;
        state_name = InitialStateName::InitJs;

        if init_py.is_file() {
            warn!("init.py was supplied with init.js, ignoring init.py")
        }
        if init_json.is_file() {
            warn!("init.json was supplied with init.js, ignoring init.json")
        }
    } else if init_py.is_file() {
        init_path = init_py;
        state_name = InitialStateName::InitPy;

        if init_json.is_file() {
            warn!("init.json was supplied with init.py, ignoring init.json")
        }
    } else if init_json.is_file() {
        init_path = init_json;
        state_name = InitialStateName::InitJson;
    } else {
        return Ok(None);
    }

    Ok(Some(InitialState {
        name: state_name,
        src: get_file_contents(&init_path)?,
    }))
}

fn read_local_datasets(data_folder: PathBuf) -> Result<Vec<SharedDataset>> {
    debug!("Reading local datasets in {:?}", &data_folder);
    if !data_folder.is_dir() {
        Ok(vec![])
    } else {
        data_folder
            .read_dir()
            .wrap_err_lazy(|| format!("Could not read directory: {data_folder:?}"))?
            .filter_map(|entry| match entry {
                Ok(entry) => {
                    if !entry.path().is_file() {
                        warn!("Not a dataset file: {:?}", entry.path());
                        return None;
                    }
                    let file_name = entry.file_name();
                    let lossy_file_name = file_name.to_string_lossy();
                    if !lossy_file_name.ends_with(".json") && !lossy_file_name.ends_with(".csv") {
                        warn!("Not a valid dataset extension: {file_name:?}");
                        return None;
                    }

                    let mut data =
                        match get_file_contents(&entry.path()).wrap_err("Could not read dataset") {
                            Ok(data) => data,
                            Err(err) => {
                                warn!("{err:?}");
                                return None;
                            }
                        };

                    if lossy_file_name.ends_with(".csv") {
                        data = match parse_raw_csv_into_json(data).wrap_err_lazy(|| {
                            format!("Could not convert csv into json: {file_name:?}")
                        }) {
                            Ok(data) => data,
                            Err(err) => {
                                warn!("{err:?}");
                                return None;
                            }
                        }
                    }

                    Some(Ok(SharedDataset {
                        name: Some(lossy_file_name.to_string()),
                        shortname: lossy_file_name.to_string(),
                        filename: lossy_file_name.to_string(),
                        url: None,
                        raw_csv: lossy_file_name.ends_with(".csv"),
                        data: Some(data),
                    }))
                }
                Err(err) => {
                    warn!("Could not ready directory entry: {err}");
                    None
                }
            })
            .collect()
    }
}

fn read_local_behaviors(behaviors_folder: &Path) -> Result<Vec<SharedBehavior>> {
    debug!("Reading local behaviors");
    let mut behavior_files = vec![];

    if !behaviors_folder.is_dir() {
        return Ok(vec![]);
    }

    for entry in std::fs::read_dir(behaviors_folder)? {
        let path = entry?.path();
        if let Some(extension) = path.extension() {
            if BEHAVIOR_FILE_EXTENSIONS.contains(&extension) {
                if extension == OsStr::new(".rs") {
                    warn!("Custom Rust behaviors are currently unsupported, ignoring {path:?}");
                } else {
                    behavior_files.push(path);
                }
            }
        };
    }

    let mut behaviors = Vec::with_capacity(behavior_files.len());

    for behavior_file_path in behavior_files {
        let behavior_file_name = behavior_file_path
            .file_name()
            .ok_or_else(|| report!("behavior file expected to have proper file name"))?
            .to_string_lossy()
            .to_string();
        let behavior_key_file_name = format!("{behavior_file_name}.json");
        let behavior_key_file_path = behaviors_folder.join(&behavior_key_file_name);

        let behavior = SharedBehavior {
            // `id`, `name` and `shortnames` may be updated later if this behavior is a dependency
            id: behavior_file_name.clone(),
            name: behavior_file_name,
            shortnames: vec![], // if this is a dependency, then these will be updated later
            behavior_src: get_file_contents_opt(&behavior_file_path)
                .wrap_err("Could not read behavior")?,
            // this may not return anything if file doesn't exist
            behavior_keys_src: get_file_contents_opt(&behavior_key_file_path)
                .wrap_err("Could not read behavior keys")?,
        };
        behaviors.push(behavior);
    }
    Ok(behaviors)
}

fn _try_read_local_dependencies(local_project: &Project) -> Result<Vec<PathBuf>> {
    let mut dependency_path = local_project.path.clone();
    dependency_path.push("dependencies/");
    debug!("Parsing the dependencies folder: {dependency_path:?}");

    let mut entries = dependency_path
        .read_dir()?
        .filter_map(|dir_res| {
            if let Ok(entry) = dir_res {
                // check it's a folder and matches the pattern of a user namespace (i.e. `@user`)
                if entry.path().is_dir() && entry.file_name().to_str()?.starts_with('@') {
                    return Some(entry);
                }
            }
            None
        })
        .map(|user_dir| user_dir.path().read_dir().wrap_err_lazy(|| format!("Could not read directory {:?}", user_dir.path())))
        .collect::<Result<Vec<_>>>()? // Intermediary collect and iter to handle errors from read_dir
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
    // TODO: OS: do we want this wrapper to provide a default, or should we just unwrap
    _try_read_local_dependencies(local_project).unwrap_or_default()
}

// TODO: Should these Strings be swapped with their own enums like BehaviorType::JavaScript
enum DependencyType {
    Behavior(String),
    Dataset(String),
}

fn get_dependency_type_from_name(dependency_name: &str) -> Result<DependencyType> {
    // TODO: dependency names aren't real paths, is this safe?
    let extension = std::path::Path::new(dependency_name)
        .extension()
        .ok_or_else(|| report!("Dependency has no file extension"))?;

    if BEHAVIOR_FILE_EXTENSIONS.contains(&extension) {
        Ok(DependencyType::Behavior(
            extension.to_str().unwrap().to_string(),
        ))
    } else if DATASET_FILE_EXTENSIONS.contains(&extension) {
        Ok(DependencyType::Dataset(
            extension.to_str().unwrap().to_string(),
        ))
    } else {
        bail!("Dependency has unknown file extension: {extension:?}");
    }
}

fn get_behavior_from_dependency_projects(
    dependency_name: &str,
    dependency_projects: &HashMap<PathBuf, Project>,
) -> Result<SharedBehavior> {
    let mut name = dependency_name.to_string();
    let mut possible_names = Vec::with_capacity(4);

    // is a Hash behavior
    // TODO: Could be cleaned up
    if name.starts_with("@hash") {
        let full_parts = name.split('/').collect::<Vec<_>>();
        let file_name = full_parts[full_parts.len() - 1];
        let file_parts = file_name.split('.').collect::<Vec<_>>();
        if file_parts.len() != 2 {
            // return Err("Expected shared behavior name to have a file extension".into());
            panic!();
        }

        let name_root = file_parts[0];
        let file_extension = file_parts[1];
        let dir = if full_parts.len() == 3 {
            full_parts[1].to_string()
        } else {
            name_root.replace('_', "-")
        };
        let full_name = "@hash/".to_string() + &dir + "/" + file_name;

        if file_extension == "rs" {
            possible_names.push(name_root.to_string());
        }
        possible_names.push(file_name.to_string());
        possible_names.push("@hash/".to_string() + file_name);

        // Unfortunately, sometimes the longest name from the API is not actually the full name, so
        // set it manually here.
        name = full_name;
    }

    let mut dependency_path = PathBuf::from(&name);
    dependency_path.pop();

    match dependency_projects
        .iter()
        .find(|(path, _proj)| path.ends_with(&dependency_path))
        .and_then(|(_path, proj)| {
            proj.behaviors.iter().find(|behavior| {
                // TODO: Are all of these checks necessary
                behavior.name == name
                    || behavior.shortnames.contains(&name)
                    || possible_names.contains(&behavior.name)
                    || possible_names
                        .iter()
                        .any(|possible_name| behavior.shortnames.contains(possible_name))
            })
        }) {
        None => bail!("Couldn't find dependency in project dependencies: {name}"),
        Some(behavior) => {
            let mut behavior = behavior.clone();
            behavior.name = name;
            behavior.shortnames = possible_names;

            Ok(behavior)
        }
    }
}

fn get_dataset_from_dependency_projects(
    dependency_name: &str,
    dependency_projects: &HashMap<PathBuf, Project>,
) -> Result<SharedDataset> {
    let mut dependency_path = PathBuf::from(&dependency_name);
    let file_name = dependency_path
        .file_name()
        .ok_or_else(|| {
            report!(
                "Expected there to be a filename component of the dataset dependency path: \
                 {dependency_path:?}"
            )
        })?
        .to_os_string()
        .into_string()
        .unwrap();
    dependency_path.pop();
    let name = dependency_name.to_string();

    match dependency_projects
        .iter()
        .find(|(path, _proj)| path.ends_with(&dependency_path))
        .and_then(|(_path, proj)| {
            proj.datasets.iter().find(|dataset| {
                // TODO: Are all of these checks necessary
                dataset.name == Some(name.clone())
                    || dataset.shortname == name.clone()
                    || dataset.filename == name.clone()
                    || dataset.name == Some(file_name.clone())
                    || dataset.filename == file_name.clone()
                    || dataset.shortname == file_name.clone()
            })
        }) {
        None => bail!("Couldn't find dependency in project dependencies: {name}"),
        Some(dataset) => {
            let mut dataset = dataset.clone();
            // Using these, because locally they are not in the right format
            dataset.name = Some(name.clone());
            dataset.shortname = name.clone();
            dataset.filename = name.clone();

            Ok(dataset)
        }
    }
}

fn read_dependencies_from_json(json: &str) -> Result<serde_json::Map<String, SerdeValue>> {
    match serde_json::from_str(json)? {
        serde_json::Value::Object(dependencies_map) => Ok(dependencies_map),
        value => bail!("Unexpected value for dependencies: {value}"),
    }
}

fn add_dependencies_to_project(
    local_project: &mut Project,
    dependency_projects: HashMap<PathBuf, Project>,
) -> Result<()> {
    if let Some(dependencies_str) = &local_project.dependencies_json {
        let dependencies_map = read_dependencies_from_json(dependencies_str)
            .wrap_err("Could not read dependencies")?;

        // TODO: How to handle versions
        for (dependency_name, _version) in dependencies_map {
            match get_dependency_type_from_name(&dependency_name)
                .wrap_err_lazy(|| format!("Could not read dependency: {dependency_name}"))?
            {
                DependencyType::Behavior(extension) => {
                    let behavior = if &extension == ".rs" {
                        SharedBehavior {
                            id: dependency_name.to_string(),
                            name: dependency_name.to_string(),
                            shortnames: vec![],
                            behavior_src: None,
                            behavior_keys_src: None,
                        }
                    } else {
                        get_behavior_from_dependency_projects(
                            &dependency_name,
                            &dependency_projects,
                        )
                        .wrap_err_lazy(|| {
                            format!("Could not get behavior from dependency: {dependency_name}")
                        })?
                    };

                    local_project.behaviors.push(behavior);
                }
                DependencyType::Dataset(_extension) => {
                    let dataset = get_dataset_from_dependency_projects(
                        &dependency_name,
                        &dependency_projects,
                    )?;
                    local_project.datasets.push(dataset)
                }
            }
        }
    };
    Ok(())
}

fn read_project(project_path: &Path) -> Result<ProjectBase> {
    let mut local_project = read_local_project(project_path)?;
    let behaviors_deps_folders = local_dependencies_folders(&local_project);
    let dep_projects = behaviors_deps_folders
        .into_iter()
        .map(|path| match read_local_project(&path) {
            Ok(project) => Ok((path, project)),
            Err(err) => Err(err),
        })
        .collect::<Result<HashMap<PathBuf, Project>>>()
        .wrap_err("TS")?;
    add_dependencies_to_project(&mut local_project, dep_projects)?;

    let project_base = ProjectBase {
        initial_state: local_project
            .initial_state
            .ok_or_else(|| report!("Project must specify an initial state file."))?,
        globals_src: local_project
            .globals_json
            .ok_or_else(|| report!("Project must contain a `globals.json` file"))?,
        dependencies_src: local_project.dependencies_json,
        experiments_src: local_project.experiments_json,
        behaviors: local_project.behaviors,
        datasets: local_project.datasets,
        // TODO: allow packages themselves to implement resolvers for local projects to build this
        // field
        packages: vec![SimPackageArgs {
            name: "analysis".into(),
            data: SerdeValue::String(local_project.analysis_json.unwrap_or_default()),
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
        .ok_or_else(|| report!("Experiment configuration not found: experiments.json"))?;
    let parsed = serde_json::from_str::<SerdeMap<String, SerdeValue>>(&experiments_manifest)
        .wrap_err("Could not parse experiment manifest")?;
    let plan = create_experiment_plan(&parsed, &args.experiment_name)
        .wrap_err("Could not read experiment plan")?;

    let max_sims_in_parallel = parsed
        .get("max_sims_in_parallel")
        .and_then(|val| val.as_u64())
        .map(|val| val as usize);

    let config = SimpleExperimentConfig {
        experiment_name: args.experiment_name.clone(),
        changed_properties: plan
            .inner
            .into_iter()
            .flat_map(|v| {
                v.fields
                    .into_iter()
                    .map(|(property_path, changed_value)| json!({ property_path: changed_value }))
            })
            .collect(),
        num_steps: plan.num_steps,
        max_sims_in_parallel,
    };
    Ok(config)
}

fn create_experiment_plan(
    experiments: &SerdeMap<String, SerdeValue>,
    experiment_name: &str,
) -> Result<SimpleExperimentPlan> {
    let selected_experiment = experiments.get(experiment_name).ok_or_else(|| {
        report!(
            "Expected experiments.json to contain the specified experiment definition for \
             experiment with name: {experiment_name}"
        )
    })?;
    let experiment_type = selected_experiment
        .get("type")
        .ok_or_else(|| report!("Expected experiment definition to contain an experiment type"))?
        .as_str()
        .ok_or_else(|| report!("Expected experiment definition type to have a string value"))?;
    match experiment_type {
        "group" => create_group_variant(selected_experiment, experiments),
        "multiparameter" => create_multiparameter_variant(selected_experiment, experiments),
        "optimization" => bail!("Not implemented for optimization experiment types"),
        _ => create_basic_variant(selected_experiment, experiment_type)
            .wrap_err("Could not parse basic variant"),
    }
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

    let var: MultiparameterVariant = serde_json::from_value(selected_experiment.clone())
        .wrap_err("Could not parse multiparameter variant")?;
    let subplans = var
        .runs
        .iter()
        .map(|run_name| {
            let selected = experiments
                .get(run_name)
                .ok_or_else(|| {
                    report!("Experiment plan does not define the specified experiment: {run_name}")
                })
                .wrap_err("Could not parse experiment file")?;
            create_basic_variant(selected, run_name).wrap_err("Could not parse basic variant")
        })
        .collect::<Result<Vec<SimpleExperimentPlan>>>()
        .wrap_err("Unable to create sub plans")?;

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
        // TODO: move ALL variants to proto, experiment plan creation to simple exp controller def
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        runs: Vec<String>,
    }
    let var: GroupVariant = serde_json::from_value(selected_experiment.clone())?;
    var.runs.iter().try_fold(
        SimpleExperimentPlan::new(var.steps as usize),
        |mut acc, name| {
            let variants = create_experiment_plan(experiments, name)
                .wrap_err("Could not read experiment plan")?;
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
    match experiment_type {
        "monte-carlo" => create_monte_carlo_variant_plan(selected_experiment),
        "values" => create_value_variant_plan(selected_experiment),
        "linspace" => create_linspace_variant_plan(selected_experiment),
        "arange" => create_arange_variant_plan(selected_experiment),
        "meshgrid" => create_meshgrid_variant_plan(selected_experiment),
        _ => bail!("Unknown experiment type: {}", experiment_type),
    }
}

pub type Mapper = Box<dyn Fn(SerdeValue, usize) -> SerdeValue>;

fn create_variant_with_mapped_value(
    field: &str,
    items: &[SerdeValue],
    mapper: &Mapper,
    num_steps: usize,
) -> SimpleExperimentPlan {
    items.iter().enumerate().fold(
        SimpleExperimentPlan::new(num_steps),
        |mut acc, (index, val)| {
            let mapped_value = mapper(val.clone(), index);
            acc.push(HashMap::from([(field.to_string(), mapped_value)]).into());
            acc
        },
    )
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

    // Needed trait objects of distributions, solution from:
    // https://users.rust-lang.org/t/vec-of-rand-distribution-trait-objects/58727/2
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
                    Normal::new(self.mean.unwrap_or(1.0), self.std.unwrap_or(1.0))
                        .wrap_err("Unable to create normal distribution")?,
                ) as Box<dyn DynDistribution<f64>>,
                "log-normal" => Box::new(
                    LogNormal::new(self.mu.unwrap_or(1.0), self.sigma.unwrap_or(1.0))
                        .wrap_err("Unable to create log-normal distribution")?,
                ),
                "poisson" => Box::new(
                    Poisson::new(self.rate.unwrap_or(1.0))
                        .wrap_err("Unable to create poisson distribution")?,
                ),
                "beta" => Box::new(
                    Beta::new(self.alpha.unwrap_or(1.0), self.beta.unwrap_or(1.0))
                        .wrap_err("Unable to create beta distribution")?,
                ),
                "gamma" => Box::new(
                    rand_distr::Gamma::new(self.shape.unwrap_or(1.0), self.scale.unwrap_or(1.0))
                        .wrap_err("Unable to create gamma distribution")?,
                ),
                _ => Box::new(
                    Normal::new(1.0, 1.0).wrap_err("Unable to create normal distribution")?,
                ),
            };
            Ok(Box::new(move |_, _| {
                let mut rng = rand::thread_rng();
                distribution.sample(&mut rng).into()
            }))
        }
    }

    let var: MonteCarloVariant = serde_json::from_value(selected_experiment.clone())?;
    let values: Vec<_> = (0..var.samples as usize).map(|_| 0.into()).collect();
    Ok(create_variant_with_mapped_value(
        &var.field,
        &values,
        &var.sample_distribution_fn()?,
        var.steps as usize,
    ))
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

    let var: ValueVariant = serde_json::from_value(selected_experiment.clone())
        .wrap_err("Could not parse value variant")?;
    let mapper: Mapper = Box::new(|val, _index| val);
    Ok(create_variant_with_mapped_value(
        &var.field,
        &var.values,
        &mapper,
        var.steps as usize,
    ))
}

fn create_linspace_variant_plan(selected_experiment: &SerdeValue) -> Result<SimpleExperimentPlan> {
    #[derive(Clone, Serialize, Deserialize, Debug)]
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
    let values: Vec<_> = (0..var.samples as usize).map(|_| 0.into()).collect();

    let closure_var = var.clone();
    let mapper: Mapper = Box::new(move |_val, index| {
        let denominator = if closure_var.samples > 1.0 {
            (closure_var.samples - 1.0) as f64
        } else {
            1.0
        };
        let x = closure_var.start
            + (index as f64 * (closure_var.stop - closure_var.start)) / denominator;
        x.into()
    });

    Ok(create_variant_with_mapped_value(
        &var.field,
        &values,
        &mapper,
        var.steps as usize,
    ))
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
    let mapper: Mapper = Box::new(|val, _index| val);
    Ok(create_variant_with_mapped_value(
        &var.field,
        &values,
        &mapper,
        var.steps as usize,
    ))
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
        for y_val in &y_space {
            let entry = HashMap::from([
                (var.x_field.clone(), x_val.into()),
                (var.y_field.clone(), (*y_val).into()),
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

#[derive(Clone, Debug)]
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
