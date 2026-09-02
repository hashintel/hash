//! Generation of the checked-in `task-dependencies.json` files.
//!
//! One document per package records the package's direct dependencies and, per task, the
//! tasks turbo runs before it.
//!
//! Only tasks turbo reports a command for are recorded: a task without a command never
//! executes — turbo folds its hash into its dependents and skips it. An edge to such a task
//! is replaced by the commanded tasks behind it, so a list stays what turbo runs first.
//!
//! The graph is read from `turbo run --dry=json`, the only view that reports a task's
//! command; `affectedTasks` serves to enumerate the task names to plan.

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
#[serde(rename_all = "camelCase")]
struct Package {
    name: String,
    path: String,
    direct_dependencies: Items<Named>,
    tasks: Items<Named>,
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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DryRunTask {
    task_id: String,
    task: String,
    package: String,
    command: String,
    dependencies: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
struct DryRun {
    tasks: Vec<DryRunTask>,
}

#[derive(Debug, serde::Serialize)]
struct Document {
    package: String,
    dependencies: BTreeSet<String>,
    tasks: BTreeMap<String, BTreeSet<String>>,
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

/// Every task name a package could run.
///
/// Two sources, because neither is complete on its own: a package's `tasks` carry the ones
/// turbo synthesizes for a Cargo crate, which no `turbo.json` declares, while the
/// `turbo.json` files carry the declared names, which that query drops for a crate. Names
/// nothing implements are dropped by the dry run.
///
/// `affectedTasks` would list both but answers with the tasks of the packages a diff
/// touches, which would tie the documents to the branch they are generated on.
async fn task_names(
    root: &Path,
    packages: &[Package],
) -> Result<Vec<String>, Report<TaskDependenciesError>> {
    let mut names: BTreeSet<String> = packages
        .iter()
        .flat_map(|package| &package.tasks.items)
        .map(|task| task.name.clone())
        .filter(|name| !name.contains('#'))
        .collect();

    for package in packages {
        let path = root.join(&package.path).join("turbo.json");
        let contents = match fs::read_to_string(&path).await {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(Report::new(error)
                    .change_context(TaskDependenciesError::ReadFile(path.clone())));
            }
        };

        // `turbo.json` allows comments, which serde_json does not.
        let stripped: String = contents
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        let config: TurboConfig = serde_json::from_str(&stripped)
            .change_context_lazy(|| TaskDependenciesError::ReadFile(path.clone()))?;

        // A `package#task` key configures another package's task, it is not a name to run.
        names.extend(config.tasks.into_keys().filter(|name| !name.contains('#')));
    }

    if names.is_empty() {
        return Err(
            Report::new(TaskDependenciesError::TaskNames).attach("no turbo.json declares a task")
        );
    }

    Ok(names.into_iter().collect())
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
/// A name that no package both declares and implements makes turbo refuse the whole
/// invocation, so rejected names are dropped and the run is retried.
async fn dry_run(
    root: &Path,
    mut names: Vec<String>,
) -> Result<Vec<DryRunTask>, Report<TaskDependenciesError>> {
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

        tracing::warn!(?rejected, "Dropping task names turbo cannot run");
        let planned = names.len();
        names.retain(|name| !rejected.contains(name.as_str()));

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

fn documents(
    packages: Vec<Package>,
    tasks: &[DryRunTask],
) -> Result<BTreeMap<String, Document>, Report<TaskDependenciesError>> {
    let by_id: BTreeMap<&str, &DryRunTask> = tasks
        .iter()
        .map(|task| (task.task_id.as_str(), task))
        .collect();

    let mut paths: BTreeMap<String, String> = BTreeMap::new();
    let mut documents: BTreeMap<String, Document> = packages
        .into_iter()
        .map(|package| {
            paths.insert(package.name.clone(), package.path);
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
        if task.command == NONEXISTENT {
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

        document.tasks.insert(
            task.task.clone(),
            executed_dependencies(&task.dependencies, &by_id)?,
        );
    }

    Ok(documents
        .into_iter()
        // The workspace roots are packages without a directory of their own.
        .filter_map(|(name, document)| match paths.remove(&name) {
            Some(path) if !path.is_empty() => Some((path, document)),
            _ => None,
        })
        .collect())
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
        "{ packages { items { name path directDependencies { items { name } } tasks { items { \
         name } } } } }",
        TaskDependenciesError::PackageList,
    )
    .await?;

    let names = task_names(&root, &packages.packages.items).await?;
    tracing::debug!(count = names.len(), "Found task names");

    let tasks = dry_run(&root, names).await?;

    // The marker is what separates the tasks turbo runs from the ones it skips; a graph
    // without a single skipped task means it stopped matching.
    if tasks.iter().all(|task| task.command != NONEXISTENT) {
        return Err(Report::new(TaskDependenciesError::TaskGraph)
            .attach(format!("no task reported `{NONEXISTENT}`"))
            .expand());
    }

    let documents = documents(packages.packages.items, &tasks)?;
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
