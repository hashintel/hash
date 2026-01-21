use core::error;
use std::collections::{BTreeMap, HashSet};

use cargo_metadata::{
    camino::{Utf8Path, Utf8PathBuf},
    semver::{self, Prerelease},
};
use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt};
use globset::GlobSet;
use guppy::{
    MetadataCommand,
    graph::{DependencyDirection, PackageGraph, PackageMetadata},
};
use nodejs_package_json::{PackageJson, VersionProtocol};
use tokio::fs::{self, File};

#[derive(Debug, Clone, derive_more::Display)]
pub(crate) enum SyncTurborepoError {
    #[display("Failed to execute cargo metadata")]
    CargoMetadata,
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
}

fn json_type_name(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "bool",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

macro_rules! tri {
    ($($path:tt),*; $value:ident as String) => {
        $value.as_str().map(ToOwned::to_owned).ok_or_else(|| {
            Report::new(SyncTurborepoError::UnexpectedType {
                path: format!($($path),*),
                expected: "string",
                actual: json_type_name($value),
            })
        })
    };
    ($($path:tt),*; $value:ident as Array) => {
        $value.as_array().ok_or_else(|| {
            Report::new(SyncTurborepoError::UnexpectedType {
                path: format!($($path),*),
                expected: "array",
                actual: json_type_name($value),
            })
        })
    };
}

impl error::Error for SyncTurborepoError {}

#[derive(Debug, Clone)]
pub(crate) struct SyncTurborepoConfig {
    include: Option<GlobSet>,
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
        return tri!("/sync/turborepo/package-name"; package_name as String);
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

fn extract_dependencies<'graph>(
    graph: &'graph PackageGraph,
    path: &str,
    metadata: PackageMetadata<'graph>,
) -> Result<Vec<PackageMetadata<'graph>>, Report<[SyncTurborepoError]>> {
    let Some(extra_dependencies) = metadata.metadata_table().pointer(path) else {
        return Ok(Vec::new());
    };

    let extra_dependencies = tri!("{path}"; extra_dependencies as Array)?;

    let mut output = Vec::with_capacity(extra_dependencies.len());
    let mut sink: ReportSink<SyncTurborepoError> = ReportSink::new_armed();

    for (index, dependency) in extra_dependencies.iter().enumerate() {
        let dependency = tri!("{path}/{index}"; dependency as String);
        let Some(dependency) = sink.attempt(dependency) else {
            continue;
        };

        let package = graph
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

struct Dependencies<'graph> {
    normal: Vec<PackageMetadata<'graph>>,
    dev: Vec<PackageMetadata<'graph>>,
}

fn extra_dependencies<'graph>(
    graph: &'graph PackageGraph,
    metadata: PackageMetadata<'graph>,
) -> Result<Dependencies<'graph>, Report<[SyncTurborepoError]>> {
    let normal = extract_dependencies(graph, "/sync/turborepo/extra-dependencies", metadata);
    let dev = extract_dependencies(graph, "/sync/turborepo/extra-dev-dependencies", metadata);

    let (normal, dev) = (normal, dev).try_collect()?;
    Ok(Dependencies { normal, dev })
}

fn ignore_dependencies<'graph>(
    graph: &'graph PackageGraph,
    metadata: PackageMetadata<'graph>,
) -> Result<Dependencies<'graph>, Report<[SyncTurborepoError]>> {
    let normal = extract_dependencies(graph, "/sync/turborepo/ignore-dependencies", metadata);
    let dev = extract_dependencies(graph, "/sync/turborepo/ignore-dev-dependencies", metadata);

    let (normal, dev) = (normal, dev).try_collect()?;
    Ok(Dependencies { normal, dev })
}

fn is_ignored<'graph>(metadata: PackageMetadata<'graph>) -> bool {
    let Some(ignore) = metadata.metadata_table().pointer("/sync/turborepo/ignore") else {
        return false;
    };

    ignore.as_bool().unwrap_or(false)
}

async fn sync_package_json<'graph>(
    graph: &'graph PackageGraph,
    metadata: PackageMetadata<'graph>,
) -> Result<(), Report<[SyncTurborepoError]>> {
    let path = metadata
        .manifest_path()
        .parent()
        .expect("package should have a parent directory")
        .join("package.json");

    let exists = tokio::fs::try_exists(&path)
        .await
        .change_context_lazy(|| SyncTurborepoError::ReadFile(path.clone()))?;

    let mut package_json = if exists {
        let contents = fs::read_to_string(&path)
            .await
            .change_context_lazy(|| SyncTurborepoError::ReadFile(path.clone()))?;

        serde_json::from_str(&contents)
            .change_context_lazy(|| SyncTurborepoError::ParseFile(path.clone()))?
    } else {
        tracing::info!("package.json does not exist in {}", path);

        PackageJson::default()
    };

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
        .insert("private".to_owned(), metadata.publish().is_never().into());

    let mut dependencies = BTreeMap::new();
    let mut dev_dependencies = BTreeMap::new();

    for dependency in metadata.direct_links() {
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

    let Dependencies { normal, dev } = extra_dependencies(graph, metadata)?;
    for metadata in normal {
        dependencies.insert(
            package_name(metadata)?,
            VersionProtocol::Version(package_version(metadata)),
        );
    }
    for metadata in dev {
        dev_dependencies.insert(
            package_name(metadata)?,
            VersionProtocol::Version(package_version(metadata)),
        );
    }

    let Dependencies { normal, dev } = ignore_dependencies(graph, metadata)?;
    for metadata in normal {
        dependencies.remove(&package_name(metadata)?);
    }
    for metadata in dev {
        dev_dependencies.remove(&package_name(metadata)?);
    }

    if dependencies.is_empty() {
        package_json.dependencies = None;
    } else {
        package_json.dependencies = Some(dependencies);
    }

    if dev_dependencies.is_empty() {
        package_json.dev_dependencies = None;
    } else {
        package_json.dev_dependencies = Some(dev_dependencies);
    }

    let input = serde_json::to_string(&package_json)
        .change_context(SyncTurborepoError::SerializePackageJson)?;
    let output = sort_package_json::sort_package_json(&input)
        .change_context(SyncTurborepoError::SerializePackageJson)?;

    fs::write(&path, output)
        .await
        .change_context_lazy(|| SyncTurborepoError::WriteFile(path))?;

    Ok(())
}

pub(crate) async fn sync_turborepo(
    SyncTurborepoConfig { include }: SyncTurborepoConfig,
) -> Result<(), Report<[SyncTurborepoError]>> {
    tracing::debug!("Retrieving cargo metadata using guppy");
    let graph = PackageGraph::from_command(MetadataCommand::new().no_deps())
        .change_context(SyncTurborepoError::CargoMetadata)?;

    tracing::info!(packages = graph.package_count(), "Package graph loaded");

    let mut view = graph.resolve_workspace();
    if let Some(include) = &include {
        tracing::debug!("Filtering packages by include patterns");
        view = view.filter(DependencyDirection::Forward, |metadata| {
            include.is_match(metadata.name())
        });
    }

    for package in view.packages(DependencyDirection::Forward) {
        if is_ignored(package) {
            tracing::info!("Skipping ignored package: {}", package.name());
            continue;
        }

        sync_package_json(&graph, package).await?;
    }

    Ok(())
}
