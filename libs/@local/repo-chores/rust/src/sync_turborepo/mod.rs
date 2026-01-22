use alloc::collections::{BTreeMap, BTreeSet};
use core::{error, fmt::Display};

use cargo_metadata::{
    camino::{Utf8Path, Utf8PathBuf},
    semver::{self, Prerelease},
};
use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};
use globset::GlobSet;
use guppy::{
    MetadataCommand,
    graph::{DependencyDirection, PackageGraph, PackageMetadata},
};
use nodejs_package_json::{PackageJson, VersionProtocol};
use tokio::{fs, process::Command};

#[derive(Debug, Clone, derive_more::Display)]
pub(crate) enum SyncTurborepoError {
    #[display("Failed to execute cargo metadata")]
    CargoMetadata,
    #[display("Failed to list yarn workspaces")]
    YarnWorkspacesList,
    #[display("Failed to find git root")]
    GitRoot,
    #[display("Malformed glob pattern")]
    MalformedGlob,
    #[display("Unexpected type expected {expected}, but found {actual} at {path}")]
    UnexpectedType {
        path: String,
        expected: &'static str,
        actual: &'static str,
    },
    #[display("Package not found: {_0}")]
    PackageNotFound(String),
    #[display("Failed to read file: {_0}")]
    ReadFile(Utf8PathBuf),
    #[display("Failed to parse file: {_0}")]
    ParseFile(Utf8PathBuf),
    #[display("Failed to write file: {_0}")]
    WriteFile(Utf8PathBuf),
    #[display("Failed to serialize package.json")]
    SerializePackageJson,
    #[display("Unable to sync to turborepo")]
    UnableToSync,
}

impl error::Error for SyncTurborepoError {}

const fn json_type_name(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "bool",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

fn expect_string<P: Display>(
    path: impl FnOnce() -> P,
    value: &serde_json::Value,
) -> Result<String, Report<SyncTurborepoError>> {
    value.as_str().map(ToOwned::to_owned).ok_or_else(|| {
        Report::new(SyncTurborepoError::UnexpectedType {
            path: path().to_string(),
            expected: "string",
            actual: json_type_name(value),
        })
    })
}

fn expect_array<P: Display>(
    path: impl FnOnce() -> P,
    value: &serde_json::Value,
) -> Result<&[serde_json::Value], Report<SyncTurborepoError>> {
    value.as_array().map(AsRef::as_ref).ok_or_else(|| {
        Report::new(SyncTurborepoError::UnexpectedType {
            path: path().to_string(),
            expected: "array",
            actual: json_type_name(value),
        })
    })
}

fn expect_object<P: Display>(
    path: impl FnOnce() -> P,
    value: &serde_json::Value,
) -> Result<&serde_json::Map<String, serde_json::Value>, Report<SyncTurborepoError>> {
    value.as_object().ok_or_else(|| {
        Report::new(SyncTurborepoError::UnexpectedType {
            path: path().to_string(),
            expected: "object",
            actual: json_type_name(value),
        })
    })
}

#[derive(Debug, Clone)]
pub(crate) struct SyncTurborepoConfig {
    pub include: Option<GlobSet>,
}

fn is_blockprotocol(metadata: PackageMetadata) -> bool {
    metadata
        .manifest_path()
        .components()
        .any(|component| component.as_str() == "@blockprotocol")
}

fn package_name(metadata: PackageMetadata) -> Result<String, Report<SyncTurborepoError>> {
    if is_blockprotocol(metadata) {
        return Ok(format!("@blockprotocol/{}-rs", metadata.name()));
    }

    if let Some(package_name) = metadata
        .metadata_table()
        .pointer("/sync/turborepo/package-name")
    {
        return expect_string(|| "/sync/turborepo/package-name", package_name);
    }

    Ok(format!("@rust/{}", metadata.name()))
}

fn package_version(metadata: PackageMetadata) -> semver::Version {
    if metadata.publish().is_never() {
        let mut version = metadata.version().clone();
        version.pre = Prerelease::new("private").expect("infallible");
        version
    } else {
        metadata.version().clone()
    }
}

/// A JavaScript dependency declared directly in Cargo.toml metadata.
#[derive(Debug, Clone)]
struct JsDependency {
    name: String,
    version: String,
}

/// Extracts extra JS dependencies from Cargo.toml metadata.
///
/// These are declared as objects with `name` and `version` fields:
/// ```toml
/// extra-dependencies = [
///     { name = "@local/status", version = "0.0.0-private" },
/// ]
/// ```
fn extract_javascript_dependencies(
    path: &str,
    metadata: PackageMetadata<'_>,
) -> Result<Vec<JsDependency>, Report<[SyncTurborepoError]>> {
    let Some(deps) = metadata.metadata_table().pointer(path) else {
        return Ok(Vec::new());
    };

    let deps = expect_array(|| path, deps)?;

    let mut output = Vec::with_capacity(deps.len());
    let mut sink: ReportSink<SyncTurborepoError> = ReportSink::new_armed();

    for (index, dep) in deps.iter().enumerate() {
        let dep_path = format!("{path}/{index}");
        let Some(obj) = sink.attempt(expect_object(|| &dep_path, dep)) else {
            continue;
        };

        let name = obj.get("name").ok_or_else(|| {
            Report::new(SyncTurborepoError::UnexpectedType {
                path: format!("{dep_path}/name"),
                expected: "string",
                actual: "missing",
            })
        });
        let Some(name) = sink.attempt(name) else {
            continue;
        };
        let Some(name) = sink.attempt(expect_string(|| format!("{dep_path}/name"), name)) else {
            continue;
        };

        let version = obj.get("version").ok_or_else(|| {
            Report::new(SyncTurborepoError::UnexpectedType {
                path: format!("{dep_path}/version"),
                expected: "string",
                actual: "missing",
            })
        });
        let Some(version) = sink.attempt(version) else {
            continue;
        };
        let Some(version) = sink.attempt(expect_string(|| format!("{dep_path}/version"), version))
        else {
            continue;
        };

        output.push(JsDependency { name, version });
    }

    sink.finish_ok(output)
}

/// Extracts Cargo package names from metadata for ignore lists.
///
/// These are declared as simple strings (Cargo package names):
/// ```toml
/// ignore-dependencies = ["some-crate"]
/// ```
fn extract_cargo_dependencies<'graph>(
    path: &str,
    metadata: PackageMetadata<'graph>,
) -> Result<Vec<PackageMetadata<'graph>>, Report<[SyncTurborepoError]>> {
    let Some(deps) = metadata.metadata_table().pointer(path) else {
        return Ok(Vec::new());
    };

    let deps = expect_array(|| path, deps)?;

    let mut output = Vec::with_capacity(deps.len());
    let mut sink: ReportSink<SyncTurborepoError> = ReportSink::new_armed();

    for (index, dependency) in deps.iter().enumerate() {
        let dependency = expect_string(|| format!("{path}/{index}"), dependency);
        let Some(dependency) = sink.attempt(dependency) else {
            continue;
        };

        let package = metadata
            .graph()
            .resolve_package_name(&dependency)
            .packages(DependencyDirection::Forward)
            .next()
            .ok_or_else(|| Report::new(SyncTurborepoError::PackageNotFound(dependency.clone())));
        let Some(package) = sink.attempt(package) else {
            continue;
        };

        output.push(package);
    }

    sink.finish_ok(output)
}

struct ExtraDependencies {
    normal: Vec<JsDependency>,
    dev: Vec<JsDependency>,
}

impl ExtraDependencies {
    fn new(metadata: PackageMetadata<'_>) -> Result<Self, Report<[SyncTurborepoError]>> {
        let normal =
            extract_javascript_dependencies("/sync/turborepo/extra-dependencies", metadata);
        let dev =
            extract_javascript_dependencies("/sync/turborepo/extra-dev-dependencies", metadata);

        let (normal, dev) = (normal, dev).try_collect()?;
        Ok(Self { normal, dev })
    }
}

struct IgnoreDependencies<'graph> {
    normal: Vec<PackageMetadata<'graph>>,
    dev: Vec<PackageMetadata<'graph>>,
}

impl<'graph> IgnoreDependencies<'graph> {
    fn new(metadata: PackageMetadata<'graph>) -> Result<Self, Report<[SyncTurborepoError]>> {
        let normal = extract_cargo_dependencies("/sync/turborepo/ignore-dependencies", metadata);
        let dev = extract_cargo_dependencies("/sync/turborepo/ignore-dev-dependencies", metadata);

        let (normal, dev) = (normal, dev).try_collect()?;
        Ok(Self { normal, dev })
    }
}

fn is_ignored(metadata: PackageMetadata) -> bool {
    metadata
        .metadata_table()
        .pointer("/sync/turborepo/ignore")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

async fn get_yarn_workspace_packages() -> Result<BTreeSet<String>, Report<SyncTurborepoError>> {
    // We must first find the current cwd
    let cwd = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .await
        .change_context(SyncTurborepoError::GitRoot)?
        .exit_ok()
        .change_context(SyncTurborepoError::GitRoot)?;
    let cwd = String::from_utf8(cwd.stdout).change_context(SyncTurborepoError::GitRoot)?;
    let cwd = cwd.trim();
    tracing::debug!(cwd, "Determined git root");

    let output = Command::new("mise")
        .args(["exec", "--", "yarn", "workspaces", "list", "--json"])
        .current_dir(cwd)
        .output()
        .await
        .change_context(SyncTurborepoError::YarnWorkspacesList)?
        .exit_ok()
        .change_context(SyncTurborepoError::YarnWorkspacesList)?;

    let stdout =
        String::from_utf8(output.stdout).change_context(SyncTurborepoError::YarnWorkspacesList)?;

    let mut packages = BTreeSet::new();
    for line in stdout.lines() {
        let value: serde_json::Value =
            serde_json::from_str(line).change_context(SyncTurborepoError::YarnWorkspacesList)?;
        if let Some(name) = value.get("name").and_then(|name| name.as_str()) {
            packages.insert(name.to_owned());
        }
    }

    tracing::debug!(count = packages.len(), "Found yarn workspace packages");
    Ok(packages)
}

async fn read_package_json(path: &Utf8Path) -> Result<PackageJson, Report<SyncTurborepoError>> {
    let exists = fs::try_exists(path)
        .await
        .change_context_lazy(|| SyncTurborepoError::ReadFile(path.to_owned()))?;

    if exists {
        let contents = fs::read_to_string(path)
            .await
            .change_context_lazy(|| SyncTurborepoError::ReadFile(path.to_owned()))?;

        serde_json::from_str(&contents)
            .change_context_lazy(|| SyncTurborepoError::ParseFile(path.to_owned()))
    } else {
        tracing::info!("package.json does not exist at {path}, creating new one");
        Ok(PackageJson::default())
    }
}

fn compute_package_json(
    metadata: PackageMetadata<'_>,
    mut package_json: PackageJson,
    local_yarn_packages: &BTreeSet<String>,
) -> Result<PackageJson, Report<[SyncTurborepoError]>> {
    package_json.name = Some(package_name(metadata)?);
    package_json.version = Some(package_version(metadata));

    if let Some(license) = metadata.license() {
        package_json
            .other_fields
            .insert("license".to_owned(), license.to_owned().into());
    } else {
        package_json.other_fields.remove("license");
    }

    package_json
        .other_fields
        .insert("private".to_owned(), true.into());

    // Start with existing dependencies, but filter out local workspace packages
    let mut dependencies: BTreeMap<_, _> = package_json.dependencies.unwrap_or_default();
    dependencies.retain(|name, _| !local_yarn_packages.contains(name));

    let mut dev_dependencies: BTreeMap<_, _> = package_json.dev_dependencies.unwrap_or_default();
    dev_dependencies.retain(|name, _| !local_yarn_packages.contains(name));

    // Add computed dependencies from Rust workspace
    for dependency in metadata.direct_links() {
        if !dependency.to().in_workspace() {
            continue;
        }

        if dependency.dev_only() {
            dev_dependencies.insert(
                package_name(dependency.to())?,
                VersionProtocol::Version(package_version(dependency.to())),
            );
        } else {
            dependencies.insert(
                package_name(dependency.to())?,
                VersionProtocol::Version(package_version(dependency.to())),
            );
        }
    }

    let ExtraDependencies { normal, dev } = ExtraDependencies::new(metadata)?;
    for js_dep in normal {
        dependencies.insert(js_dep.name, VersionProtocol::Tag(js_dep.version));
    }
    for js_dep in dev {
        dev_dependencies.insert(js_dep.name, VersionProtocol::Tag(js_dep.version));
    }

    let IgnoreDependencies { normal, dev } = IgnoreDependencies::new(metadata)?;
    for dep_metadata in normal {
        dependencies.remove(&package_name(dep_metadata)?);
    }
    for dep_metadata in dev {
        dev_dependencies.remove(&package_name(dep_metadata)?);
    }

    package_json.dependencies = if dependencies.is_empty() {
        None
    } else {
        Some(dependencies)
    };

    package_json.dev_dependencies = if dev_dependencies.is_empty() {
        None
    } else {
        Some(dev_dependencies)
    };

    Ok(package_json)
}

async fn write_package_json_if_changed(
    path: &Utf8Path,
    package_json: PackageJson,
) -> Result<(), Report<SyncTurborepoError>> {
    let serialized = serde_json::to_string(&package_json)
        .change_context(SyncTurborepoError::SerializePackageJson)?;
    let mut output = sort_package_json::sort_package_json(&serialized)
        .change_context(SyncTurborepoError::SerializePackageJson)?;

    if !output.ends_with('\n') {
        output.push('\n');
    }

    let current = fs::read_to_string(path).await.ok();
    if current.as_ref() == Some(&output) {
        tracing::debug!("Skipping unchanged package.json: {path}");
        return Ok(());
    }

    fs::write(path, &output)
        .await
        .change_context_lazy(|| SyncTurborepoError::WriteFile(path.to_owned()))?;

    tracing::info!("Updated package.json: {path}");
    Ok(())
}

#[tracing::instrument(level = "debug", skip(metadata, local_yarn_packages), fields(package = %metadata.name()))]
async fn sync_package_json(
    metadata: PackageMetadata<'_>,
    local_yarn_packages: &BTreeSet<String>,
) -> Result<(), Report<[SyncTurborepoError]>> {
    let path = metadata
        .manifest_path()
        .parent()
        .expect("package should have a parent directory")
        .join("package.json");

    let package_json = read_package_json(&path).await?;
    let package_json = compute_package_json(metadata, package_json, local_yarn_packages)?;
    write_package_json_if_changed(&path, package_json).await?;

    Ok(())
}

#[tracing::instrument(level = "info", skip_all)]
pub(crate) async fn sync_turborepo(
    SyncTurborepoConfig { include }: SyncTurborepoConfig,
) -> Result<(), Report<[SyncTurborepoError]>> {
    tracing::debug!("Retrieving yarn workspace packages");
    let local_yarn_packages = get_yarn_workspace_packages().await?;

    tracing::debug!("Retrieving cargo metadata using guppy");
    let graph = PackageGraph::from_command(&mut MetadataCommand::new())
        .change_context(SyncTurborepoError::CargoMetadata)?;

    tracing::info!(packages = graph.package_count(), "Package graph loaded");

    let mut view = graph.resolve_workspace();
    if let Some(include) = &include {
        tracing::debug!("Filtering packages by include patterns");
        view = view.filter(DependencyDirection::Forward, |metadata| {
            include.is_match(metadata.name())
        });
    }

    let packages: Vec<_> = view
        .packages(DependencyDirection::Forward)
        .filter(|package| {
            if is_ignored(*package) {
                tracing::debug!(package = %package.name(), "Skipping ignored package");
                false
            } else {
                true
            }
        })
        .collect();

    let mut sink: ReportSink<SyncTurborepoError> = ReportSink::new_armed();
    let total = packages.len();
    let mut failed = 0_usize;

    for package in packages {
        if let Err(error) = sync_package_json(package, &local_yarn_packages).await {
            failed += 1;
            sink.append(error);
        }
    }

    tracing::info!(total, failed, "Sync complete");
    sink.finish()
}
