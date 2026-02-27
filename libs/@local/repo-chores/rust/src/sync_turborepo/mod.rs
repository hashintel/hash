//! Syncs Cargo workspace metadata to `package.json` files for Turborepo integration.
//!
//! Each Rust workspace crate gets a corresponding `package.json` with the correct name, version,
//! and dependency graph derived from `Cargo.toml`. This allows Turborepo to understand the Rust
//! dependency graph and schedule tasks accordingly.
//!
//! Package naming follows these conventions:
//! - Crates under `@blockprotocol/` → `@blockprotocol/<name>-rs`
//! - Crates with `[package.metadata.sync.turborepo.package-name]` → custom name
//! - All other crates → `@rust/<name>`
//!
//! Additional `Cargo.toml` metadata keys:
//! - `sync.turborepo.ignore` — skip this crate entirely
//! - `sync.turborepo.extra-dependencies` — add non-Rust JS dependencies
//! - `sync.turborepo.extra-dev-dependencies` — add non-Rust JS dev dependencies
//! - `sync.turborepo.ignore-dependencies` — exclude specific Cargo deps from the JS graph
//! - `sync.turborepo.ignore-dev-dependencies` — exclude specific Cargo dev deps

use alloc::collections::BTreeMap;
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
use nodejs_package_json::{PackageJson, VersionProtocol, WorkspaceProtocol};
use tokio::fs;

#[derive(Debug, Clone, derive_more::Display)]
pub(crate) enum SyncTurborepoError {
    #[display("Failed to execute cargo metadata")]
    CargoMetadata,
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

/// Configuration for the sync-turborepo process.
#[derive(Debug, Clone)]
pub(crate) struct SyncTurborepoConfig {
    /// When set, only packages whose names match one of the globs are synced.
    pub include: Option<GlobSet>,
}

fn is_blockprotocol(metadata: PackageMetadata) -> bool {
    metadata
        .manifest_path()
        .components()
        .any(|component| component.as_str() == "@blockprotocol")
}

/// Determines the JavaScript package name for a Rust crate.
///
/// Resolution order:
/// 1. `@blockprotocol/<name>-rs` if the crate lives under the `@blockprotocol` directory
/// 2. Custom name from `[package.metadata.sync.turborepo.package-name]`
/// 3. `@rust/<name>` as fallback
///
/// # Errors
///
/// Returns [`UnexpectedType`] if `package-name` metadata exists but is not a string.
///
/// [`UnexpectedType`]: SyncTurborepoError::UnexpectedType
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

/// Returns the semver version for a crate, appending a `-private` pre-release tag for
/// unpublished crates.
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

/// Extracts extra JS dependencies from Cargo.toml metadata at the given JSON pointer `path`.
///
/// These are declared as objects with `name` and `version` fields:
/// ```toml
/// extra-dependencies = [
///     { name = "@local/status", version = "0.0.0-private" },
/// ]
/// ```
///
/// # Errors
///
/// Returns [`UnexpectedType`] if the metadata value at `path` is not an array of objects with
/// string `name` and `version` fields. Collects all errors via [`ReportSink`] so that multiple
/// malformed entries are reported together.
///
/// [`UnexpectedType`]: SyncTurborepoError::UnexpectedType
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

/// Extracts Cargo package names from metadata for ignore lists at the given JSON pointer `path`.
///
/// These are declared as simple strings (Cargo package names):
/// ```toml
/// ignore-dependencies = ["some-crate"]
/// ```
///
/// # Errors
///
/// - [`UnexpectedType`] if the value is not an array of strings.
/// - [`PackageNotFound`] if a listed crate name cannot be resolved in the package graph.
///
/// [`UnexpectedType`]: SyncTurborepoError::UnexpectedType
/// [`PackageNotFound`]: SyncTurborepoError::PackageNotFound
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

/// Extra JavaScript dependencies parsed from `[package.metadata.sync.turborepo]`.
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

/// Cargo dependencies to exclude from the generated `package.json`.
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

async fn read_package_json(path: &Utf8Path) -> Result<PackageJson, Report<SyncTurborepoError>> {
    match fs::read_to_string(path).await {
        Ok(contents) => serde_json::from_str(&contents)
            .change_context_lazy(|| SyncTurborepoError::ParseFile(path.to_owned())),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            tracing::info!("package.json does not exist at {path}, creating new one");
            Ok(PackageJson::default())
        }
        Err(err) => Err(Report::new(err))
            .change_context_lazy(|| SyncTurborepoError::ReadFile(path.to_owned())),
    }
}

fn version_protocol_from_str(version: &str) -> VersionProtocol {
    version
        .parse()
        .unwrap_or_else(|_| VersionProtocol::Tag(version.to_owned()))
}

/// Computes the target `package.json` content for a single Rust crate.
///
/// Merges Cargo workspace dependencies, extra JS dependencies, and ignore lists into the
/// existing `package_json`. Non-workspace dependencies (e.g. manually added JS packages) are
/// preserved across syncs.
///
/// # Errors
///
/// Returns errors from [`package_name`], [`ExtraDependencies::new`], or
/// [`IgnoreDependencies::new`] if metadata is malformed.
fn compute_package_json(
    metadata: PackageMetadata<'_>,
    mut package_json: PackageJson,
) -> Result<PackageJson, Report<[SyncTurborepoError]>> {
    package_json.name = Some(package_name(metadata)?);
    package_json.version = Some(package_version(metadata));

    if let Some(description) = metadata.description() {
        package_json
            .other_fields
            .insert("description".to_owned(), description.to_owned().into());
    } else {
        package_json.other_fields.remove("description");
    }

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

    // Start with existing dependencies, but filter out workspace-protocol packages.
    // These are always managed by the sync tool and will be re-added from Cargo.toml below.
    // This ensures removed Cargo dependencies are also removed from package.json.
    let mut dependencies: BTreeMap<_, _> = package_json.dependencies.unwrap_or_default();
    dependencies.retain(|_, version| !matches!(version, VersionProtocol::Workspace(_)));

    let mut dev_dependencies: BTreeMap<_, _> = package_json.dev_dependencies.unwrap_or_default();
    dev_dependencies.retain(|_, version| !matches!(version, VersionProtocol::Workspace(_)));

    // Add computed dependencies from Rust workspace
    for dependency in metadata.direct_links() {
        if !dependency.to().in_workspace() {
            continue;
        }

        if dependency.dev_only() {
            dev_dependencies.insert(
                package_name(dependency.to())?,
                VersionProtocol::Workspace(WorkspaceProtocol::Any { alias: None }),
            );
        } else {
            dependencies.insert(
                package_name(dependency.to())?,
                VersionProtocol::Workspace(WorkspaceProtocol::Any { alias: None }),
            );
        }
    }

    let ExtraDependencies { normal, dev } = ExtraDependencies::new(metadata)?;
    for js_dep in normal {
        dependencies.insert(js_dep.name, version_protocol_from_str(&js_dep.version));
    }
    for js_dep in dev {
        dev_dependencies.insert(js_dep.name, version_protocol_from_str(&js_dep.version));
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
    let output = sort_package_json::sort_package_json(&serialized)
        .change_context(SyncTurborepoError::SerializePackageJson)?;

    match fs::read_to_string(path).await {
        Ok(current) if current == output => {
            tracing::debug!("Skipping unchanged package.json: {path}");
            return Ok(());
        }
        Ok(_) | Err(_) => {}
    }

    fs::write(path, &output)
        .await
        .change_context_lazy(|| SyncTurborepoError::WriteFile(path.to_owned()))?;

    tracing::info!("Updated package.json: {path}");
    Ok(())
}

#[tracing::instrument(level = "debug", skip(metadata), fields(package = %metadata.name()))]
async fn sync_package_json(
    metadata: PackageMetadata<'_>,
) -> Result<(), Report<[SyncTurborepoError]>> {
    let path = metadata
        .manifest_path()
        .parent()
        .expect("package should have a parent directory")
        .join("package.json");

    let package_json = read_package_json(&path).await?;
    let package_json = compute_package_json(metadata, package_json)?;
    write_package_json_if_changed(&path, package_json).await?;

    Ok(())
}

/// Runs the sync-turborepo process across all (optionally filtered) workspace crates.
///
/// # Errors
///
/// - [`CargoMetadata`] if `cargo metadata` fails.
/// - Individual per-package errors are collected and returned together.
///
/// [`CargoMetadata`]: SyncTurborepoError::CargoMetadata
#[tracing::instrument(level = "info", skip_all)]
pub(crate) async fn sync_turborepo(
    SyncTurborepoConfig { include }: SyncTurborepoConfig,
) -> Result<(), Report<[SyncTurborepoError]>> {
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
        if let Err(error) = sync_package_json(package).await {
            failed += 1;
            sink.append(error);
        }
    }

    tracing::info!(total, failed, "Sync complete");
    sink.finish()
}
