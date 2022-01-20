use std::{
    borrow::Borrow,
    collections::HashMap,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
};

use error::{bail, ensure, report, Result, ResultExt};
use hash_engine::{
    fetch::parse_raw_csv_into_json,
    proto::{
        ExperimentRun, ExperimentRunBase, InitialState, InitialStateName, ProjectBase,
        SharedBehavior, SharedDataset, SimPackageArgs,
    },
};
use serde::{self, de::DeserializeOwned};
use serde_json::Value as SerdeValue;

use crate::ExperimentType;

const BEHAVIOR_FILE_EXTENSIONS: [&str; 3] = ["js", "py", "rs"];
const DATASET_FILE_EXTENSIONS: [&str; 2] = ["csv", "json"];

#[derive(Debug, Default, Clone)]
pub struct Manifest {
    pub initial_state: Option<InitialState>,
    pub behaviors: Vec<SharedBehavior>,
    pub datasets: Vec<SharedDataset>,
    pub globals_json: Option<String>,
    pub analysis_json: Option<String>,
    pub experiments_json: Option<String>,
    pub dependencies: HashMap<String, SerdeValue>,
}

impl Manifest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_initial_state_from_file<P: AsRef<Path>>(
        &mut self,
        path: P,
    ) -> Result<Option<InitialState>> {
        let path = path.as_ref();
        ensure!(path.is_file(), "Not a behavior file: {path:?}");

        Ok(self.initial_state.replace(InitialState {
            name: match file_extension(&path)?.as_str() {
                "js" => InitialStateName::InitJs,
                "py" => InitialStateName::InitPy,
                "json" => InitialStateName::InitJson,
                _ => bail!("Not a valid initial state file: {path:?}"),
            },
            src: file_contents(path)?,
        }))
    }

    pub fn set_initial_state_from_files<P1: AsRef<Path>, P2: AsRef<Path>, P3: AsRef<Path>>(
        &mut self,
        js_path: P1,
        py_path: P2,
        json_path: P3,
    ) -> Result<Option<InitialState>> {
        let js_path = js_path.as_ref();
        let py_path = py_path.as_ref();
        let json_path = json_path.as_ref();

        debug!("Reading initial state files");
        if js_path.is_file() {
            if py_path.is_file() {
                warn!("{py_path:?} was supplied with {js_path:?}, ignoring {py_path:?}");
            }
            if json_path.is_file() {
                warn!("{json_path:?} was supplied with {js_path:?}, ignoring {json_path:?}");
            }
            self.set_initial_state_from_file(js_path)
        } else if py_path.is_file() {
            if json_path.is_file() {
                warn!("{json_path:?} was supplied with {py_path:?}, ignoring {json_path:?}");
            }
            self.set_initial_state_from_file(py_path)
        } else if json_path.is_file() {
            self.set_initial_state_from_file(json_path)
        } else {
            bail!("No initial state found in {js_path:?}, {py_path:?}, or {json_path:?}");
        }
    }

    pub fn set_globals_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.globals_json.replace(file_contents(path)?);
        Ok(())
    }

    pub fn set_analysis_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.analysis_json.replace(file_contents(path)?);
        Ok(())
    }

    pub fn set_experiments_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.experiments_json.replace(file_contents(path)?);
        Ok(())
    }

    pub fn set_dependencies_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.dependencies = parse_file(path)?;
        Ok(())
    }

    pub fn add_dependency_projects(
        &mut self,
        dependency_projects: HashMap<PathBuf, Self>,
    ) -> Result<()> {
        // TODO: How to handle versions
        for dependency_name in self.dependencies.keys() {
            match get_dependency_type_from_name(dependency_name)
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
                        get_behavior_from_dependency_projects(dependency_name, &dependency_projects)
                            .wrap_err_lazy(|| {
                                format!("Could not get behavior from dependency: {dependency_name}")
                            })?
                    };

                    self.behaviors.push(behavior);
                }
                DependencyType::Dataset(_extension) => {
                    let dataset = get_dataset_from_dependency_projects(
                        dependency_name,
                        &dependency_projects,
                    )?;
                    self.datasets.push(dataset)
                }
            }
        }

        Ok(())
    }

    pub fn add_behavior(&mut self, behavior: SharedBehavior) {
        self.behaviors.push(behavior);
    }

    pub fn add_behavior_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure!(path.is_file(), "Not a behavior file: {path:?}");

        let file_extension = file_extension(&path)?;
        ensure!(
            BEHAVIOR_FILE_EXTENSIONS.contains(&file_extension.as_str()),
            "Not a valid behavior extension: {path:?}"
        );
        ensure!(
            file_extension != "rs",
            "Custom Rust behaviors are currently unsupported"
        );

        let file_name = path
            .file_name()
            .ok_or_else(|| report!("behavior file expected to have proper file name"))?
            .to_string_lossy()
            .to_string();
        let folder_path = path
            .parent()
            .ok_or_else(|| report!("Could not find parent folder for behavior file: {path:?}"))?;
        let key_path = folder_path.join(&format!("{file_name}.json"));

        self.add_behavior(SharedBehavior {
            // `id`, `name` and `shortnames` may be updated later if this behavior is a dependency
            id: file_name.clone(),
            name: file_name,
            shortnames: vec![], // if this is a dependency, then these will be updated later
            behavior_src: file_contents_opt(&path).wrap_err("Could not read behavior")?,
            // this may not return anything if file doesn't exist
            behavior_keys_src: file_contents_opt(&key_path)
                .wrap_err("Could not read behavior keys")?,
        });
        Ok(())
    }

    pub fn add_behaviors_from_directory<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure!(path.is_dir(), "Not a directory: {path:?}");

        debug!("Reading behaviors in {:?}", &path);
        for entry in path
            .read_dir()
            .wrap_err_lazy(|| format!("Could not read behavior directory: {path:?}"))?
        {
            match entry {
                Ok(entry) => {
                    let path = entry.path();
                    if BEHAVIOR_FILE_EXTENSIONS.contains(&file_extension(&path)?.as_str()) {
                        if let Err(err) = self.add_behavior_from_file(&path) {
                            warn!("Could not add behavior {path:?}: {err:?}");
                        }
                    }
                }
                Err(err) => {
                    warn!("Could not ready behavior entry: {err}");
                }
            }
        }
        Ok(())
    }

    pub fn add_dataset(&mut self, dataset: SharedDataset) {
        self.datasets.push(dataset);
    }

    pub fn add_dataset_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure!(path.is_file(), "Not a dataset file: {path:?}");

        let file_extension = file_extension(path)?;
        ensure!(
            DATASET_FILE_EXTENSIONS.contains(&file_extension.as_str()),
            "Not a valid dataset extension: {path:?}"
        );

        let mut data = file_contents(path).wrap_err("Could not read dataset")?;

        if file_extension == "csv" {
            data = parse_raw_csv_into_json(data)
                .wrap_err_lazy(|| format!("Could not convert csv into json: {path:?}"))?;
        }

        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        self.add_dataset(SharedDataset {
            name: Some(filename.clone()),
            shortname: filename.clone(),
            filename,
            url: None,
            raw_csv: file_extension == "csv",
            data: Some(data),
        });
        Ok(())
    }

    pub fn add_datasets_from_directory<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure!(path.is_dir(), "Not a directory: {path:?}");

        debug!("Reading datasets in {:?}", &path);
        for entry in path
            .read_dir()
            .wrap_err_lazy(|| format!("Could not read dataset directory: {path:?}"))?
        {
            match entry {
                Ok(entry) => {
                    let path = entry.path();
                    if DATASET_FILE_EXTENSIONS.contains(&file_extension(&path)?.as_str()) {
                        if let Err(err) = self.add_dataset_from_file(&path) {
                            warn!("Could not add dataset {path:?}: {err:?}");
                        }
                    }
                }
                Err(err) => {
                    warn!("Could not ready directory entry: {err}");
                }
            }
        }
        Ok(())
    }

    pub fn from_local<P: AsRef<Path>>(project_path: P) -> Result<Self> {
        let project_path = project_path.as_ref();
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
        let dependencies_folder = project_path.join("dependencies");

        let mut project = Manifest::new();

        if init_js.exists() || init_py.exists() || init_json.exists() {
            project
                .set_initial_state_from_files(init_js, init_py, init_json)
                .wrap_err("Could not read initial state")?;
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
        if dependencies_json.exists() {
            project
                .set_dependencies_from_file(dependencies_json)
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

        let behaviors_deps_folders = local_dependencies_folders(dependencies_folder);
        let dep_projects = behaviors_deps_folders
            .into_iter()
            .map(|path| match Self::from_local(&path) {
                Ok(project) => Ok((path, project)),
                Err(err) => Err(err),
            })
            .collect::<Result<HashMap<PathBuf, Self>>>()
            .wrap_err("Could not read dependencies")?;
        project.add_dependency_projects(dep_projects)?;

        Ok(project)
    }

    pub fn read(self, experiment_type: ExperimentType) -> Result<ExperimentRun> {
        let project_base = ProjectBase {
            initial_state: self
                .initial_state
                .ok_or_else(|| report!("Project must specify an initial state file."))?,
            globals_src: self.globals_json.unwrap_or_else(|| "{}".to_string()),
            experiments_src: self.experiments_json,
            behaviors: self.behaviors,
            datasets: self.datasets,
            // TODO: allow packages themselves to implement resolvers for local projects to build
            // this   field
            packages: vec![SimPackageArgs {
                name: "analysis".into(),
                data: SerdeValue::String(self.analysis_json.unwrap_or_default()),
            }],
        };

        let base = ExperimentRunBase {
            id: experiment_type.create_run_id(),
            project_base,
        };

        let package_config = experiment_type.get_package_config(&base)?;
        Ok(ExperimentRun {
            base,
            package_config,
        })
    }
}

// TODO: Clean up section below

// TODO: Should these Strings be swapped with their own enums like BehaviorType::JavaScript
enum DependencyType {
    Behavior(String),
    Dataset(String),
}

fn get_dependency_type_from_name(dependency_name: &str) -> Result<DependencyType> {
    // TODO: dependency names aren't real paths, is this safe?
    let extension = std::path::Path::new(dependency_name)
        .extension()
        .ok_or_else(|| report!("Dependency has no file extension"))?
        .to_string_lossy();

    if BEHAVIOR_FILE_EXTENSIONS.contains(&extension.borrow()) {
        Ok(DependencyType::Behavior(extension.to_string()))
    } else if DATASET_FILE_EXTENSIONS.contains(&extension.borrow()) {
        Ok(DependencyType::Dataset(extension.to_string()))
    } else {
        bail!("Dependency has unknown file extension: {extension:?}");
    }
}

fn get_behavior_from_dependency_projects(
    dependency_name: &str,
    dependency_projects: &HashMap<PathBuf, Manifest>,
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
    dependency_projects: &HashMap<PathBuf, Manifest>,
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

fn _try_read_local_dependencies<P: AsRef<Path>>(dependency_path: P) -> Result<Vec<PathBuf>> {
    let dependency_path = dependency_path.as_ref();
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

fn local_dependencies_folders<P: AsRef<Path>>(dependency_path: P) -> Vec<PathBuf> {
    // TODO: OS: do we want this wrapper to provide a default, or should we just unwrap
    _try_read_local_dependencies(dependency_path).unwrap_or_default()
}

fn file_extension<P: AsRef<Path>>(path: P) -> Result<String> {
    let path = path.as_ref();
    Ok(path
        .extension()
        .ok_or_else(|| report!("Not a valid file: {path:?}"))?
        .to_string_lossy()
        .to_lowercase())
}

fn file_contents<P: AsRef<Path>>(path: P) -> Result<String> {
    let path = path.as_ref();
    debug!("Reading contents at path: {path:?}");
    std::fs::read_to_string(path).wrap_err_lazy(|| format!("Could not read file: {path:?}"))
}

fn file_contents_opt<P: AsRef<Path>>(path: P) -> Result<Option<String>> {
    let path = path.as_ref();
    if !path.exists() {
        Ok(None)
    } else {
        Some(file_contents(path)).transpose()
    }
}

fn parse_file<T: DeserializeOwned, P: AsRef<Path>>(path: P) -> Result<T> {
    let path = path.as_ref();
    serde_json::from_reader(BufReader::new(
        File::open(path).wrap_err_lazy(|| format!("Could not read file {path:?}"))?,
    ))
    .wrap_err_lazy(|| format!("Could not parse {path:?}"))
}
