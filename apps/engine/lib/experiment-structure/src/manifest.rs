//! Module to load a project manifest.

use std::{
    borrow::Borrow,
    collections::HashMap,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
};

use error_stack::{bail, ensure, IntoReport, Report, ResultExt};
use execution::package::simulation::{
    init::{InitialState, InitialStateName},
    state::behavior_execution::Behavior,
    PackageInitConfig, SimPackageArgs,
};
use serde::{self, de::DeserializeOwned};
use stateful::global::Dataset;
use thiserror::Error;

use crate::{
    dependencies::parse_raw_csv_into_json, experiment::ExperimentType, ExperimentRun,
    SimulationSource,
};

#[derive(Debug, Error)]
#[error("Could not read manifest file")]
pub struct ManifestError;

pub type Result<T, E = ManifestError> = error_stack::Result<T, E>;

const BEHAVIOR_FILE_EXTENSIONS: [&str; 4] = ["js", "py", "rs", "ts"];
const DATASET_FILE_EXTENSIONS: [&str; 2] = ["csv", "json"];

/// Contains all the necessary information required to run a simulation.
///
/// The `Manifest` is implemented as a builder for an [`ExperimentRun`]. It provides helper methods
/// to parse the project structure easily.
#[derive(Debug, Default, Clone)]
pub struct Manifest {
    /// The name of the project
    pub project_name: String,
    /// The initial state for the simulation.
    pub initial_state: Option<InitialState>,
    /// A list of all behaviors in the project.
    pub behaviors: Vec<Behavior>,
    /// A list of all datasets in the project.
    pub datasets: Vec<Dataset>,
    /// JSON string describing the [`Globals`](stateful::global::Globals) object.
    pub globals_json: Option<String>,
    /// JSON string describing the analysis that's calculated by the
    /// [analysis output package](execution::package::simulation::output::analysis).
    pub analysis_json: Option<String>,
    /// JSON string describing the structure of available experiments for this project.
    pub experiments_json: Option<String>,
    /// A list of all dependencies identified by its name.
    pub dependencies: HashMap<String, serde_json::Value>,
}

impl Manifest {
    /// Creates an empty `Manifest`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Reads the initial state from the file at the provided `path`.
    ///
    /// # Errors
    ///
    /// - if the `path` does not refer to a JavaScript, Python, or JSON file
    /// - if the file could not be read
    pub fn set_initial_state_from_file<P: AsRef<Path>>(
        &mut self,
        path: P,
    ) -> Result<Option<InitialState>> {
        let path = path.as_ref();
        ensure!(
            path.is_file(),
            Report::new(ManifestError)
                .attach_printable(format!("Couldn't find the init file at: {path:?}"))
        );

        Ok(self.initial_state.replace(InitialState {
            name: match file_extension(&path)?.as_str() {
                "js" => InitialStateName::InitJs,
                "py" => InitialStateName::InitPy,
                "json" => InitialStateName::InitJson,
                "ts" => InitialStateName::InitTs,
                _ => bail!(
                    Report::new(ManifestError)
                        .attach_printable(format!("Not a valid initial state file: {path:?}"))
                ),
            },
            src: file_contents(path)?,
        }))
    }

    /// Reads the initial state from the files provided in a directory specified by `src_folder`.
    ///
    /// It attempts to read _init.js_, _init.py_, or _init.json_ and prioritizes that order. For
    /// example if _init.js_ was found, it doesn't try to read _init.py_, or _init.json_.
    ///
    /// # Errors
    ///
    /// - if the provided path is not a directory
    /// - if the provided directory does not contain any initial state file
    /// - if the initial state file could not be read
    pub fn set_initial_state_from_directory<P: AsRef<Path>>(
        &mut self,
        src_folder: P,
    ) -> Result<Option<InitialState>> {
        let src_folder = src_folder.as_ref();
        ensure!(
            src_folder.is_dir(),
            Report::new(ManifestError).attach_printable(format!("Not a directory: {src_folder:?}"))
        );

        let paths_to_check = [
            "init.js",
            "init.py",
            "init.json",
            "init.ts",
        ].iter().map(|file_name| src_folder.join(file_name));

        let existing_paths = paths_to_check.filter(|path| path.is_file()).collect::<Vec<_>>();

        if existing_paths.is_empty() {
            bail!(
                Report::new(ManifestError)
                    .attach_printable(format!("Couldn't find any initial state file in: {src_folder:?}"))
            );
        }

        let path = &existing_paths[0];

        if existing_paths.len() > 1 {
            tracing::warn!(r#"Multiple state initialization files found. Using "{}". (ignoring: "{}")"#,
                path.display(),
                existing_paths[1..].iter().map(|path| path.display().to_string()).collect::<Vec<_>>().join("\", \""),
            );
        }

        tracing::debug!("Reading initial state file: {}", path.display());

        self.set_initial_state_from_file(path)
    }

    /// Reads the content from the file at the provided `path` describing the
    /// [`Globals`](stateful::global::Globals).
    ///
    /// # Errors
    ///
    /// - if the file referred by `path` could not be read
    pub fn set_globals_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.globals_json.replace(file_contents(path)?);
        Ok(())
    }

    /// Reads the content from the file at the provided `path` describing the analysis of the
    /// experiment, calculated by the
    /// [analysis output package](execution::package::simulation::output::analysis).
    ///
    /// # Errors
    ///
    /// - if the file referred by `path` could not be read
    pub fn set_analysis_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.analysis_json.replace(file_contents(path)?);
        Ok(())
    }

    /// Reads the content from the file at the provided `path` describing the structure of available
    /// experiments for this project.
    ///
    /// # Errors
    ///
    /// - if the file referred by `path` could not be read
    pub fn set_experiments_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.experiments_json.replace(file_contents(path)?);
        Ok(())
    }

    /// Reads the content from the file at the provided `path` describing the dependencies for this
    /// project.
    ///
    /// # Errors
    ///
    /// - if the file referred by `path` could not be read
    pub fn set_dependencies_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        self.dependencies = parse_file(path)?;
        Ok(())
    }

    /// Adds the provided `dependency_projects`' behaviors and datasets to the manifest.
    pub fn add_dependency_projects(
        &mut self,
        dependency_projects: HashMap<PathBuf, Self>,
    ) -> Result<()> {
        // TODO: How to handle versions
        for dependency_name in self.dependencies.keys() {
            match get_dependency_type_from_name(dependency_name)
                .attach_printable_lazy(|| format!("Could not read dependency: {dependency_name}"))?
            {
                DependencyType::Behavior(extension) => {
                    let behavior = if &extension == ".rs" {
                        Behavior {
                            id: dependency_name.to_string(),
                            name: dependency_name.to_string(),
                            shortnames: vec![],
                            behavior_src: None,
                            behavior_keys_src: None,
                        }
                    } else {
                        get_behavior_from_dependency_projects(dependency_name, &dependency_projects)
                            .attach_printable_lazy(|| {
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

    /// Adds the provided `behavior` to the list of behaviors.
    pub fn add_behavior(&mut self, behavior: Behavior) {
        self.behaviors.push(behavior);
    }

    /// Reads a behavior from the file at the provided `path`.
    ///
    /// # Errors
    ///
    /// - if the `path` does not refer to a JavaScript, Python, or Rust file
    /// - if the file could not be read
    /// - if the behavior keys at _`path`.json_ could not be read
    pub fn add_behavior_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure!(
            path.is_file(),
            Report::new(ManifestError).attach_printable(format!("Not a behavior file: {path:?}"))
        );

        let file_extension = file_extension(&path)?;
        ensure!(
            BEHAVIOR_FILE_EXTENSIONS.contains(&file_extension.as_str()),
            Report::new(ManifestError)
                .attach_printable(format!("Not a valid behavior extension: {path:?}"))
        );
        if file_extension == "rs" {
            tracing::warn!("Custom Rust behaviors are currently unsupported")
        }

        let file_name = path
            .file_name()
            .ok_or_else(|| Report::new(ManifestError))
            .attach_printable("behavior file expected to have proper file name")?
            .to_string_lossy()
            .to_string();
        let folder_path = path
            .parent()
            .ok_or_else(|| Report::new(ManifestError))
            .attach_printable_lazy(|| {
                format!("Could not find parent folder for behavior file: {path:?}")
            })?;
        let key_path = folder_path.join(&format!("{file_name}.json"));

        self.add_behavior(Behavior {
            // `id`, `name` and `shortnames` may be updated later if this behavior is a dependency
            id: file_name.clone(),
            name: file_name,
            shortnames: vec![], // if this is a dependency, then these will be updated later
            behavior_src: file_contents_opt(&path).attach_printable("Could not read behavior")?,
            // this may not return anything if file doesn't exist
            behavior_keys_src: file_contents_opt(&key_path)
                .attach_printable("Could not read behavior keys")?,
        });
        Ok(())
    }

    /// Reads all behaviors in a directory specified by `src_folder` as described in
    /// [`add_behavior_from_file`](Self::add_behavior_from_file).
    ///
    /// # Errors
    ///
    /// - if the provided path is not a directory
    /// - if a behavior file could not be read
    /// - if the provided directory contains files, which could not be parsed as behavior or
    ///   behavior keys
    pub fn add_behaviors_from_directory<P: AsRef<Path>>(&mut self, src_folder: P) -> Result<()> {
        let src_folder = src_folder.as_ref();
        ensure!(
            src_folder.is_dir(),
            Report::new(ManifestError).attach_printable(format!("Not a directory: {src_folder:?}"))
        );

        tracing::debug!("Reading behaviors in {src_folder:?}");
        for entry in src_folder
            .read_dir()
            .into_report()
            .attach_printable_lazy(|| format!("Could not read behavior directory: {src_folder:?}"))
            .change_context(ManifestError)?
        {
            match entry {
                Ok(entry) => {
                    let path = entry.path();
                    // Filter for `.json` files for behavior keys
                    if file_extension(&path)? != "json" {
                        self.add_behavior_from_file(path)
                            .attach_printable("Could not add behavior")?;
                    }
                }
                Err(err) => {
                    tracing::warn!("Could not read behavior entry: {err}");
                }
            }
        }
        Ok(())
    }

    /// Adds the provided `dataset` to the list of datasets.
    pub fn add_dataset(&mut self, dataset: Dataset) {
        self.datasets.push(dataset);
    }

    /// Reads a dataset from the file at the provided `path`.
    ///
    /// # Errors
    ///
    /// - if the `path` does not refer to a *valid* JSON or CSV file
    /// - if the file could not be read
    pub fn add_dataset_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure!(
            path.is_file(),
            Report::new(ManifestError).attach_printable(format!("Not a dataset file: {path:?}"))
        );

        let file_extension = file_extension(path)?;
        ensure!(
            DATASET_FILE_EXTENSIONS.contains(&file_extension.as_str()),
            Report::new(ManifestError)
                .attach_printable(format!("Not a valid dataset extension: {path:?}"))
        );

        let mut data = file_contents(path).attach_printable("Could not read dataset")?;

        if file_extension == "csv" {
            data = parse_raw_csv_into_json(data)
                .attach_printable_lazy(|| format!("Could not convert csv into json: {path:?}"))
                .change_context(ManifestError)?;
        }

        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        self.add_dataset(Dataset {
            name: Some(filename.clone()),
            shortname: filename.clone(),
            filename,
            url: None,
            raw_csv: file_extension == "csv",
            data: Some(data),
        });
        Ok(())
    }

    /// Reads all datasets in a directory specified by `src_folder` as described in
    /// [`add_dataset_from_file`](Self::add_dataset_from_file).
    ///
    /// # Errors
    ///
    /// - if the provided path is not a directory
    /// - if a dataset file could not be read
    /// - if the provided directory contains files, which could not be parsed as dataset
    pub fn add_datasets_from_directory<P: AsRef<Path>>(&mut self, src_folder: P) -> Result<()> {
        let src_folder = src_folder.as_ref();
        ensure!(
            src_folder.is_dir(),
            Report::new(ManifestError).attach_printable(format!("Not a directory: {src_folder:?}"))
        );

        tracing::debug!("Reading datasets in {src_folder:?}");
        for entry in src_folder
            .read_dir()
            .into_report()
            .attach_printable_lazy(|| format!("Could not read dataset directory: {src_folder:?}"))
            .change_context(ManifestError)?
        {
            match entry {
                Ok(entry) => {
                    self.add_dataset_from_file(entry.path())
                        .attach_printable("Could not add dataset")?;
                }
                Err(err) => {
                    tracing::warn!("Could not ready directory entry: {err}");
                }
            }
        }
        Ok(())
    }

    /// Reads the manifest from a local project.
    ///
    /// Reads the following data relative to `project_path`:
    /// - Initial state as specified in
    ///   [`set_initial_state_from_directory("src")`](Self::set_initial_state_from_directory)
    /// - Global state as specified in
    ///   [`set_globals_from_file("src/globals.json")`](Self::set_globals_from_file)
    /// - Behaviors as specified in
    ///   [`add_behaviors_from_directory("behaviors")`](Self::add_behaviors_from_directory)
    /// - Datasets as specified in
    ///   [`add_datasets_from_directory("data")`](Self::add_datasets_from_directory)
    /// - Experiments JSON as specified in
    ///   [`set_experiments_from_file("experiments.json")`](Self::set_experiments_from_file)
    /// - Analysis JSON as specified in
    ///   [`set_analysis_from_file("views/analysis.json")`](Self::set_analysis_from_file)
    /// - Dependencies recursively as provided by
    ///   [`set_dependencies_from_file("dependencies.json")`](Self::set_dependencies_from_file)
    pub fn from_local<P: AsRef<Path>>(project_path: P) -> Result<Self> {
        Self::from_local_impl(project_path, false)
    }

    /// Creates a manifest from a local project but omits the items not required for a dependent
    /// project.
    ///
    /// Reads the following data relative to `project_path`:
    /// - Behaviors as spefified in
    ///   [`add_behaviors_from_directory("behaviors")`](Self::add_behaviors_from_directory)
    /// - Datasets as spefified in
    ///   [`add_datasets_from_directory("data")`](Self::add_datasets_from_directory)
    /// - Dependencies recursively as provided by
    ///   [`set_dependencies_from_file("dependencies.json")`](Self::set_dependencies_from_file)
    pub fn from_dependency<P: AsRef<Path>>(project_path: P) -> Result<Self> {
        Self::from_local_impl(project_path, true)
    }

    /// Creates a manifest from a local project as specified by [`from_local()`](Self::from_local)
    /// or [`from_dependency()`](Self::from_dependency).
    fn from_local_impl<P: AsRef<Path>>(project_path: P, is_dependency: bool) -> Result<Self> {
        let project_path = project_path.as_ref();
        tracing::debug!(
            "Reading local project at: {}",
            project_path.to_string_lossy()
        );

        // Shouldn't be able to fail as it should have been validated by now
        let project_name = project_path
            .file_name()
            .ok_or_else(|| Report::new(ManifestError))
            .attach_printable_lazy(|| {
                format!("Project path didn't point to a directory: {project_path:?}")
            })?
            .to_string_lossy()
            .to_string();
        let experiments_json = project_path.join("experiments.json");
        let dependencies_json = project_path.join("dependencies.json");
        let src_folder = project_path.join("src");
        let behaviors_folder = src_folder.join("behaviors");
        let globals_json = src_folder.join("globals.json");
        let views_folder = project_path.join("views");
        let analysis_json = views_folder.join("analysis.json");
        let data_folder = project_path.join("data");
        let dependencies_folder = project_path.join("dependencies");

        let mut project = Manifest::new();

        if !is_dependency {
            project.project_name = project_name;

            project
                .set_initial_state_from_directory(src_folder)
                .attach_printable("Could not read initial state")?;

            if globals_json.exists() {
                project
                    .set_globals_from_file(globals_json)
                    .attach_printable("Could not read globals")?;
            }
            if analysis_json.exists() {
                project
                    .set_analysis_from_file(analysis_json)
                    .attach_printable("Could not read analysis view")?;
            }

            if experiments_json.exists() {
                project
                    .set_experiments_from_file(experiments_json)
                    .attach_printable("Could not read experiments")?;
            }
        }
        if dependencies_json.exists() {
            project
                .set_dependencies_from_file(dependencies_json)
                .attach_printable("Could not read experiments")?;
        }
        if behaviors_folder.exists() {
            project
                .add_behaviors_from_directory(behaviors_folder)
                .attach_printable("Could not read local behaviors")?;
        }
        if data_folder.exists() {
            project
                .add_datasets_from_directory(data_folder)
                .attach_printable("Could not read local datasets")?;
        }

        let behaviors_deps_folders = local_dependencies_folders(dependencies_folder);
        let dep_projects = behaviors_deps_folders
            .into_iter()
            .map(|path| match Self::from_dependency(&path) {
                Ok(project) => Ok((path, project)),
                Err(err) => Err(err),
            })
            .collect::<Result<HashMap<PathBuf, Self>>>()
            .attach_printable("Could not read dependencies")?;
        project.add_dependency_projects(dep_projects)?;

        Ok(project)
    }

    /// Combines this `Manifest` with the specified [`ExperimentType`] to create an
    /// [`ExperimentRun`].
    ///
    /// # Errors
    ///
    /// - if the manifest does not provide an initial state
    pub fn read(self, experiment_type: ExperimentType) -> Result<ExperimentRun> {
        let simulation = SimulationSource {
            name: self.project_name,
            globals_src: self.globals_json.unwrap_or_else(|| "{}".to_string()),
            experiments_src: self.experiments_json,
            datasets: self.datasets,
            // TODO: allow packages themselves to implement resolvers for local projects to build
            // this   field
            package_init: PackageInitConfig {
                packages: vec![SimPackageArgs {
                    name: "analysis".into(),
                    data: serde_json::Value::String(self.analysis_json.unwrap_or_default()),
                }],
                behaviors: self.behaviors,
                initial_state: self
                    .initial_state
                    .ok_or_else(|| Report::new(ManifestError))
                    .attach_printable("Manifest did not provide an initial state")?,
            },
        };

        let name = match &experiment_type {
            ExperimentType::SingleRun { .. } => "single_run".to_string().into(),
            ExperimentType::Simple { name } => name.clone(),
        };

        let config = experiment_type
            .get_package_config(&simulation)
            .attach_printable("Could not read package config")
            .change_context(ManifestError)?;
        Ok(ExperimentRun::new(name, simulation, config))
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
        .ok_or_else(|| Report::new(ManifestError))
        .attach_printable("Dependency has no file extension")?
        .to_string_lossy();

    if BEHAVIOR_FILE_EXTENSIONS.contains(&extension.borrow()) {
        Ok(DependencyType::Behavior(extension.to_string()))
    } else if DATASET_FILE_EXTENSIONS.contains(&extension.borrow()) {
        Ok(DependencyType::Dataset(extension.to_string()))
    } else {
        bail!(Report::new(ManifestError).attach_printable(format!(
            "Dependency has unknown file extension: {extension:?}"
        )));
    }
}

fn get_behavior_from_dependency_projects(
    dependency_name: &str,
    dependency_projects: &HashMap<PathBuf, Manifest>,
) -> Result<Behavior> {
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
        let full_name = format!("@hash/{dir}/{file_name}");

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
        None => {
            bail!(
                Report::new(ManifestError)
                    .attach_printable(format!("Could not find dependency behavior: {name}"))
            )
        }
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
) -> Result<Dataset> {
    let mut dependency_path = PathBuf::from(&dependency_name);
    let file_name = dependency_path
        .file_name()
        .ok_or_else(|| Report::new(ManifestError))
        .attach_printable_lazy(|| {
            format!(
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
        None => bail!(Report::new(ManifestError).attach_printable(format!(
            "Couldn't find dependency in project dependencies: {name}"
        ))),
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
    tracing::debug!("Parsing the dependencies folder: {dependency_path:?}");

    let mut entries = dependency_path
        .read_dir()
        .into_report()
        .attach_printable_lazy(|| {
            format!("Could not read dependency directory: {dependency_path:?}")
        })
        .change_context(ManifestError)?
        .filter_map(|dir_res| {
            if let Ok(entry) = dir_res {
                // check it's a folder and matches the pattern of a user namespace (i.e. `@user`)
                if entry.path().is_dir() && entry.file_name().to_str()?.starts_with('@') {
                    return Some(entry);
                }
            }
            None
        })
        .map(|user_dir| {
            user_dir
                .path()
                .read_dir()
                .into_report()
                .attach_printable_lazy(|| format!("Could not read directory {:?}", user_dir.path()))
                .change_context(ManifestError)
        })
        .collect::<Result<Vec<_>>>()?
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
        .ok_or_else(|| Report::new(ManifestError))
        .attach_printable_lazy(|| format!("Not a valid file: {path:?}"))?
        .to_string_lossy()
        .to_lowercase())
}

fn file_contents<P: AsRef<Path>>(path: P) -> Result<String> {
    let path = path.as_ref();
    tracing::debug!("Reading contents at path: {path:?}");
    std::fs::read_to_string(path)
        .into_report()
        .attach_printable_lazy(|| format!("Could not read file: {path:?}"))
        .change_context(ManifestError)
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
        File::open(path)
            .into_report()
            .attach_printable_lazy(|| format!("Could not read file {path:?}"))
            .change_context(ManifestError)?,
    ))
    .into_report()
    .attach_printable_lazy(|| format!("Could not parse {path:?}"))
    .change_context(ManifestError)
}
