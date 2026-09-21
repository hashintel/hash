//! Generation of the checked-in `task-dependencies.json` files.
//!
//! One document per package records the package's direct dependencies and, per task, the
//! tasks turbo runs before it, whether turbo caches it, whether it keeps running, and the
//! environment variables in its hash — the definition turbo arrives at after merging the root
//! and the package `turbo.json`. A task of the package itself is listed by its bare name, a
//! task of another package by its id.
//!
//! A task also lists the packages whose changes select it without being among the package's
//! transitive dependencies: the packages of the tasks before it, the packages their inputs and
//! its own reach into, and the packages nested in any of those directories, whose files turbo
//! counts as the surrounding package's own.
//!
//! A package's document lists the tasks the package implements: a `package.json` script or a
//! `command` in a `turbo.json`. Turbo also runs tasks nobody declared — the ones its Cargo
//! toolchain brings for every crate — and tasks without a command it skips, folding their
//! hash into their dependents. An edge to a skipped task is replaced by the commanded tasks
//! behind it, so a list stays what turbo runs first.
//!
//! The graph is read from `turbo run --dry=json`, the only view that reports a task's
//! command; the `turbo.json` files enumerate the task names to plan.

use alloc::collections::{BTreeMap, BTreeSet};
use core::error;
use std::path::{Path, PathBuf};

use error_stack::{Report, ReportSink, ResultExt as _};
use tokio::{fs, process::Command};

/// Directory the generated file is written to.
const DOCS_DIR: &str = "docs";

const FILE_NAME: &str = "task-dependencies.json";

/// Command turbo reports for a task a package does not implement.
const NONEXISTENT: &str = "<NONEXISTENT>";

#[derive(Debug, Clone, derive_more::Display)]
pub(crate) enum TaskDependenciesError {
    #[display("Failed to determine the git root")]
    GitRoot,
    #[display("Failed to list the turbo task names")]
    TaskNames,
    #[display("Failed to read the turbo task graph")]
    TaskGraph,
    #[display("Failed to list the turbo packages")]
    PackageList,
    #[display("Failed to serialize the document of: {_0}")]
    Serialize(String),
    #[display("Failed to read file: {}", _0.display())]
    ReadFile(PathBuf),
    #[display("Failed to write file: {}", _0.display())]
    WriteFile(PathBuf),
    #[display("Unable to sync task dependencies")]
    UnableToSync,
}

impl error::Error for TaskDependenciesError {}

#[derive(Debug, serde::Deserialize)]
struct Items<T> {
    items: Vec<T>,
}

#[derive(Debug, serde::Deserialize)]
struct Named {
    name: String,
}

#[derive(Debug, serde::Deserialize)]
struct TurboConfig {
    #[serde(default)]
    tasks: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, serde::Deserialize)]
struct PackageJson {
    #[serde(default)]
    scripts: BTreeMap<String, serde_json::Value>,
}

/// What the packages declare: the task names to plan, and per package the tasks it
/// implements, through a `package.json` script or a `command` in a `turbo.json`.
struct Declarations {
    names: BTreeSet<String>,
    implemented: BTreeMap<String, BTreeSet<String>>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Package {
    name: String,
    path: String,
    direct_dependencies: Items<Named>,
    all_dependencies: Items<Named>,
}

#[derive(Debug, serde::Deserialize)]
struct PackagesData {
    packages: Items<Package>,
}

#[derive(Debug, serde::Deserialize)]
struct QueryResponse<T> {
    data: T,
    // A GraphQL response may carry errors next to a partially resolved `data`.
    #[serde(default)]
    errors: Vec<serde_json::Value>,
}

/// The task definition turbo arrives at after merging the root and the package `turbo.json`.
#[derive(Debug, serde::Deserialize)]
struct ResolvedTaskDefinition {
    cache: bool,
    persistent: bool,
    env: Vec<String>,
    inputs: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DryRunTask {
    task_id: String,
    task: String,
    package: String,
    command: String,
    dependencies: Vec<String>,
    resolved_task_definition: ResolvedTaskDefinition,
}

#[derive(Debug, serde::Deserialize)]
struct DryRun {
    tasks: Vec<DryRunTask>,
}

/// A task as turbo resolves it, with the fields at turbo's defaults left out.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    depends_on: BTreeSet<String>,
    #[serde(skip_serializing_if = "is_true")]
    cache: bool,
    #[serde(skip_serializing_if = "is_false")]
    persistent: bool,
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    env: BTreeSet<String>,
    /// Packages outside the package's transitive dependencies whose changes select the task.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    affected_by: BTreeSet<String>,
}

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "`skip_serializing_if` passes the field by reference"
)]
const fn is_true(value: &bool) -> bool {
    *value
}

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "`skip_serializing_if` passes the field by reference"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, serde::Serialize)]
struct Document {
    package: String,
    dependencies: BTreeSet<String>,
    tasks: BTreeMap<String, Task>,
}

/// Runs `command`, attaching the error output of a failed invocation.
async fn stdout(
    command: &mut Command,
    error: TaskDependenciesError,
) -> Result<Vec<u8>, Report<TaskDependenciesError>> {
    let output = command.output().await.change_context(error.clone())?;

    if !output.status.success() {
        return Err(
            Report::new(error).attach(String::from_utf8_lossy(&output.stderr).trim().to_owned())
        );
    }

    Ok(output.stdout)
}

async fn git_root() -> Result<PathBuf, Report<TaskDependenciesError>> {
    let stdout = stdout(
        Command::new("git").args(["rev-parse", "--show-toplevel"]),
        TaskDependenciesError::GitRoot,
    )
    .await?;

    let root = String::from_utf8(stdout).change_context(TaskDependenciesError::GitRoot)?;
    Ok(PathBuf::from(root.trim()))
}

async fn query<T>(
    root: &Path,
    query: &str,
    error: TaskDependenciesError,
) -> Result<T, Report<TaskDependenciesError>>
where
    T: serde::de::DeserializeOwned,
{
    let stdout = stdout(
        Command::new("turbo")
            .args(["query", query])
            .current_dir(root),
        error.clone(),
    )
    .await?;

    let response: QueryResponse<T> =
        serde_json::from_slice(&stdout).change_context(error.clone())?;

    if !response.errors.is_empty() {
        return Err(Report::new(error).attach(format!("{:?}", response.errors)));
    }

    Ok(response.data)
}

/// Reads a file that may not exist.
async fn read_optional(path: &Path) -> Result<Option<String>, Report<TaskDependenciesError>> {
    match fs::read_to_string(path).await {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => {
            Err(Report::new(error)
                .change_context(TaskDependenciesError::ReadFile(path.to_path_buf())))
        }
    }
}

/// Whether a `turbo.json` task entry carries a command turbo runs.
fn has_command(definition: &serde_json::Value) -> bool {
    definition
        .get("command")
        .is_some_and(|command| !command.is_null())
}

/// The task names the `turbo.json` files declare, and the tasks each package implements.
///
/// A `turbo.json` key `package#task` configures another package's task: it is not a name to
/// run, but a `command` under it implements the task for that package. Names nothing
/// implements are dropped by the dry run.
async fn declarations(
    root: &Path,
    packages: &[Package],
) -> Result<Declarations, Report<TaskDependenciesError>> {
    let mut names = BTreeSet::new();
    let mut implemented: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

    for package in packages {
        let directory = root.join(&package.path);

        if let Some(contents) = read_optional(&directory.join("package.json")).await? {
            let manifest: PackageJson = serde_json::from_str(&contents)
                .change_context_lazy(|| TaskDependenciesError::ReadFile(directory.clone()))?;
            implemented
                .entry(package.name.clone())
                .or_default()
                .extend(manifest.scripts.into_keys());
        }

        let path = directory.join("turbo.json");
        let Some(contents) = read_optional(&path).await? else {
            continue;
        };

        // `turbo.json` allows comments, which serde_json does not.
        let stripped: String = contents
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        let config: TurboConfig = serde_json::from_str(&stripped)
            .change_context_lazy(|| TaskDependenciesError::ReadFile(path.clone()))?;

        for (key, definition) in config.tasks {
            let (owner, task) = if let Some((owner, task)) = key.split_once('#') {
                (owner.to_owned(), task.to_owned())
            } else {
                names.insert(key.clone());
                (package.name.clone(), key)
            };
            if has_command(&definition) {
                implemented.entry(owner).or_default().insert(task);
            }
        }
    }

    if names.is_empty() {
        return Err(
            Report::new(TaskDependenciesError::TaskNames).attach("no turbo.json declares a task")
        );
    }

    Ok(Declarations { names, implemented })
}

/// Task names turbo refused to run.
fn rejected_names(stderr: &str) -> BTreeSet<&str> {
    const MARKER: &str = "Could not find task `";

    stderr
        .split(MARKER)
        .skip(1)
        .filter_map(|rest| rest.split('`').next())
        .collect()
}

/// The task graph turbo would execute for `names`.
///
/// A name that no package implements makes turbo refuse the whole invocation, so rejected
/// names are dropped and the run is retried.
async fn dry_run(
    root: &Path,
    names: &BTreeSet<String>,
) -> Result<Vec<DryRunTask>, Report<TaskDependenciesError>> {
    let mut names: Vec<&str> = names.iter().map(String::as_str).collect();

    loop {
        let output = Command::new("turbo")
            .arg("run")
            .args(&names)
            .arg("--dry=json")
            .current_dir(root)
            .output()
            .await
            .change_context(TaskDependenciesError::TaskGraph)?;

        if output.status.success() {
            let graph: DryRun = serde_json::from_slice(&output.stdout)
                .change_context(TaskDependenciesError::TaskGraph)?;
            return Ok(graph.tasks);
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        let rejected = rejected_names(&stderr);
        if rejected.is_empty() {
            return Err(
                Report::new(TaskDependenciesError::TaskGraph).attach(stderr.trim().to_owned())
            );
        }

        tracing::warn!(
            ?rejected,
            "Dropping declared task names no package implements"
        );
        let planned = names.len();
        names.retain(|name| !rejected.contains(name));

        // Without a shrinking name list the same invocation would be retried forever.
        if names.len() == planned {
            return Err(
                Report::new(TaskDependenciesError::TaskGraph).attach(stderr.trim().to_owned())
            );
        }
    }
}

/// The commanded tasks turbo runs before `dependencies`, following the tasks it skips.
fn executed_dependencies<'graph>(
    dependencies: &'graph [String],
    tasks: &BTreeMap<&'graph str, &'graph DryRunTask>,
) -> Result<BTreeSet<String>, Report<TaskDependenciesError>> {
    let mut pending: Vec<&str> = dependencies.iter().map(String::as_str).collect();
    let mut seen: BTreeSet<&str> = pending.iter().copied().collect();
    let mut executed = BTreeSet::new();

    while let Some(id) = pending.pop() {
        let Some(task) = tasks.get(id) else {
            return Err(
                Report::new(TaskDependenciesError::TaskGraph).attach(format!(
                    "dependency on a task the graph does not contain: {id}"
                )),
            );
        };

        if task.command == NONEXISTENT {
            pending.extend(
                task.dependencies
                    .iter()
                    .map(String::as_str)
                    .filter(|dependency| seen.insert(dependency)),
            );
        } else {
            executed.insert((*id).to_owned());
        }
    }

    Ok(executed)
}

/// The packages whose files turbo hashes into `task` or into any task before it, skipped
/// tasks included: the packages those tasks belong to and the ones sharing files with them.
fn affecting_packages<'graph>(
    task: &'graph DryRunTask,
    tasks: &BTreeMap<&'graph str, &'graph DryRunTask>,
    paths: &'graph BTreeMap<String, String>,
) -> Result<BTreeSet<&'graph str>, Report<TaskDependenciesError>> {
    let mut pending: Vec<&str> = vec![task.task_id.as_str()];
    let mut seen: BTreeSet<&str> = pending.iter().copied().collect();
    let mut packages = BTreeSet::new();

    while let Some(id) = pending.pop() {
        let Some(task) = tasks.get(id) else {
            return Err(
                Report::new(TaskDependenciesError::TaskGraph).attach(format!(
                    "dependency on a task the graph does not contain: {id}"
                )),
            );
        };

        packages.insert(task.package.as_str());
        packages.extend(sharing_files(task, paths));
        pending.extend(
            task.dependencies
                .iter()
                .map(String::as_str)
                .filter(|dependency| seen.insert(dependency)),
        );
    }

    Ok(packages)
}

/// `relative` resolved against the repository-relative directory `base`.
fn resolve(base: &str, relative: &str) -> String {
    let mut parts: Vec<&str> = base.split('/').filter(|part| !part.is_empty()).collect();
    for part in relative.split('/') {
        match part {
            ".." => {
                parts.pop();
            }
            "" | "." => {}
            part => parts.push(part),
        }
    }
    parts.join("/")
}

/// The path a glob names before its first wildcard.
fn glob_directory(pattern: &str) -> &str {
    pattern
        .split(['*', '?', '[', '{'])
        .next()
        .unwrap_or_default()
        .trim_end_matches('/')
}

/// Whether `inner` is `outer` or a directory below it.
fn lies_within(inner: &str, outer: &str) -> bool {
    inner == outer
        || inner
            .strip_prefix(outer)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// The packages whose directories lie below `directory`, whose files turbo also counts as
/// the files of the package at `directory`.
fn nested_packages<'graph>(
    directory: &'graph str,
    paths: &'graph BTreeMap<String, String>,
) -> impl Iterator<Item = &'graph str> {
    paths
        .iter()
        .filter(move |(_, path)| path.as_str() != directory && lies_within(path, directory))
        .map(|(name, _)| name.as_str())
}

/// Whether a package at `package` owns files under `path`: the path lies in the package's
/// directory, or the package lies in the path's.
fn shares_files(package: &str, path: &str) -> bool {
    package == path
        || path
            .strip_prefix(package)
            .is_some_and(|rest| rest.starts_with('/'))
        || package
            .strip_prefix(path)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// The packages whose files turbo hashes into `task` besides its own package's: the ones
/// under the inputs reaching out of the package, and the ones nested in the package's
/// directory. Applies to any task of the graph, skipped ones included, since their hashes
/// carry the same inputs.
fn sharing_files<'graph>(
    task: &'graph DryRunTask,
    paths: &'graph BTreeMap<String, String>,
) -> impl Iterator<Item = &'graph str> {
    let own_path = paths.get(&task.package).map_or("", String::as_str);

    let directories: Vec<String> = Vec::from_iter(
        task.resolved_task_definition
            .inputs
            .iter()
            .filter(|input| input.starts_with("../"))
            .map(|input| resolve(own_path, glob_directory(input))),
    );

    paths
        .iter()
        .filter(move |(_, path)| {
            !path.is_empty()
                && directories
                    .iter()
                    .any(|directory| shares_files(path, directory))
        })
        .map(|(name, _)| name.as_str())
        .chain(nested_packages(own_path, paths))
}

/// A task of `package` by its bare name, any other task by its id.
fn local_name(package: &str, id: String) -> String {
    if let Some(name) = id
        .strip_prefix(package)
        .and_then(|rest| rest.strip_prefix('#'))
    {
        return name.to_owned();
    }
    id
}

fn documents(
    packages: Vec<Package>,
    tasks: &[DryRunTask],
    implemented: &BTreeMap<String, BTreeSet<String>>,
) -> Result<BTreeMap<String, Document>, Report<TaskDependenciesError>> {
    let by_id: BTreeMap<&str, &DryRunTask> = tasks
        .iter()
        .map(|task| (task.task_id.as_str(), task))
        .collect();

    let mut paths: BTreeMap<String, String> = BTreeMap::new();
    let mut all_dependencies: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut documents: BTreeMap<String, Document> = packages
        .into_iter()
        .map(|package| {
            paths.insert(package.name.clone(), package.path);
            all_dependencies.insert(
                package.name.clone(),
                package
                    .all_dependencies
                    .items
                    .into_iter()
                    .map(|dependency| dependency.name)
                    .collect(),
            );
            (
                package.name.clone(),
                Document {
                    package: package.name,
                    dependencies: package
                        .direct_dependencies
                        .items
                        .into_iter()
                        .map(|dependency| dependency.name)
                        .filter(|name| name != "//")
                        .collect(),
                    tasks: BTreeMap::new(),
                },
            )
        })
        .collect();

    for task in tasks {
        if task.command == NONEXISTENT
            || !implemented
                .get(&task.package)
                .is_some_and(|tasks| tasks.contains(&task.task))
        {
            continue;
        }
        let Some(document) = documents.get_mut(task.package.as_str()) else {
            return Err(
                Report::new(TaskDependenciesError::TaskGraph).attach(format!(
                    "task of a package the package list does not contain: {}",
                    task.task_id
                )),
            );
        };

        let dependencies = all_dependencies
            .get(&task.package)
            .expect("every task should belong to a listed package");
        // A file of a nested package is also a file of the package around it, so a package
        // brings the packages nested in its directory along.
        let reached = affecting_packages(task, &by_id, &paths)?;
        let affected_by = reached
            .iter()
            .copied()
            .chain(reached.iter().flat_map(|package| {
                paths
                    .get(*package)
                    .into_iter()
                    .flat_map(|directory| nested_packages(directory, &paths))
            }))
            .filter(|package| {
                *package != task.package && *package != "//" && !dependencies.contains(*package)
            })
            .map(str::to_owned)
            .collect();

        document.tasks.insert(
            task.task.clone(),
            Task {
                depends_on: executed_dependencies(&task.dependencies, &by_id)?
                    .into_iter()
                    .map(|id| local_name(&task.package, id))
                    .collect(),
                cache: task.resolved_task_definition.cache,
                persistent: task.resolved_task_definition.persistent,
                env: task.resolved_task_definition.env.iter().cloned().collect(),
                affected_by,
            },
        );
    }

    // The workspace roots are packages without a directory of their own.
    let documents = documents
        .into_iter()
        .filter_map(|(name, document)| match paths.remove(&name) {
            Some(path) if !path.is_empty() => Some((path, document)),
            _ => None,
        })
        .collect();

    Ok(documents)
}

fn render(document: &Document) -> Result<String, Report<TaskDependenciesError>> {
    let mut rendered = serde_json::to_string_pretty(document)
        .change_context_lazy(|| TaskDependenciesError::Serialize(document.package.clone()))?;
    rendered.push('\n');
    Ok(rendered)
}

async fn write_document(
    path: PathBuf,
    document: &Document,
) -> Result<(), Report<TaskDependenciesError>> {
    let rendered = render(document)?;

    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory)
            .await
            .change_context_lazy(|| TaskDependenciesError::WriteFile(path.clone()))?;
    }

    fs::write(&path, &rendered)
        .await
        .change_context_lazy(|| TaskDependenciesError::WriteFile(path.clone()))?;

    tracing::info!(?path, "Wrote task dependencies");
    Ok(())
}

/// Regenerates the `task-dependencies.json` file of every package.
///
/// A package that no longer exists keeps its document until the package's directory is
/// removed, which takes the document with it.
///
/// # Errors
///
/// Returns an error if the git root, the task names, the task graph or the package list cannot
/// be read, or if a document cannot be serialized or written.
#[tracing::instrument(level = "info", skip_all)]
pub(crate) async fn sync_task_dependencies() -> Result<(), Report<[TaskDependenciesError]>> {
    let root = git_root().await?;
    tracing::debug!(?root, "Determined git root");

    let packages: PackagesData = query(
        &root,
        "{ packages { items { name path directDependencies { items { name } } allDependencies { \
         items { name } } } } }",
        TaskDependenciesError::PackageList,
    )
    .await?;

    let Declarations { names, implemented } = declarations(&root, &packages.packages.items).await?;
    tracing::debug!(count = names.len(), "Found task names");

    let tasks = dry_run(&root, &names).await?;

    // The marker is what separates the tasks turbo runs from the ones it skips; a graph
    // without a single skipped task means it stopped matching.
    if tasks.iter().all(|task| task.command != NONEXISTENT) {
        return Err(Report::new(TaskDependenciesError::TaskGraph)
            .attach(format!("no task reported `{NONEXISTENT}`"))
            .expand());
    }

    let documents = documents(packages.packages.items, &tasks, &implemented)?;
    if documents.is_empty() {
        return Err(Report::new(TaskDependenciesError::PackageList)
            .attach("turbo reported no packages with a directory")
            .expand());
    }
    tracing::info!(count = documents.len(), "Generated documents");

    let mut sink: ReportSink<TaskDependenciesError> = ReportSink::new_armed();

    for (path, document) in &documents {
        if let Err(error) =
            write_document(root.join(path).join(DOCS_DIR).join(FILE_NAME), document).await
        {
            sink.append(error);
        }
    }

    sink.finish()
}
