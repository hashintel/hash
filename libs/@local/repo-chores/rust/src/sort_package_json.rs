use core::error;
use std::path::PathBuf;

use error_stack::{Report, ReportSink, ResultExt as _};
use tokio::{fs, process::Command};

#[derive(Debug, Clone, derive_more::Display)]
pub(crate) enum SortPackageJsonError {
    #[display("Failed to read file: {}", _0.display())]
    ReadFile(PathBuf),
    #[display("Failed to sort file: {}", _0.display())]
    SortFile(PathBuf),
    #[display("Failed to write file: {}", _0.display())]
    WriteFile(PathBuf),
    #[display("File is not sorted: {}", _0.display())]
    NotSorted(PathBuf),
    #[display("Failed to find git root")]
    GitRoot,
    #[display("Failed to list yarn workspaces")]
    YarnWorkspacesList,
    #[display("Unable to sort package.json files")]
    UnableToSort,
}

impl error::Error for SortPackageJsonError {}

async fn get_git_root() -> Result<PathBuf, Report<SortPackageJsonError>> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .await
        .change_context(SortPackageJsonError::GitRoot)?
        .exit_ok()
        .change_context(SortPackageJsonError::GitRoot)?;

    let root = String::from_utf8(output.stdout).change_context(SortPackageJsonError::GitRoot)?;
    Ok(PathBuf::from(root.trim()))
}

async fn get_yarn_workspace_package_jsons() -> Result<Vec<PathBuf>, Report<SortPackageJsonError>> {
    let git_root = get_git_root().await?;
    tracing::debug!(?git_root, "Determined git root");

    let output = Command::new("mise")
        .args(["exec", "--", "yarn", "workspaces", "list", "--json"])
        .current_dir(&git_root)
        .output()
        .await
        .change_context(SortPackageJsonError::YarnWorkspacesList)?
        .exit_ok()
        .change_context(SortPackageJsonError::YarnWorkspacesList)?;

    let stdout = String::from_utf8(output.stdout)
        .change_context(SortPackageJsonError::YarnWorkspacesList)?;

    let mut files = Vec::new();
    for line in stdout.lines() {
        let value: serde_json::Value =
            serde_json::from_str(line).change_context(SortPackageJsonError::YarnWorkspacesList)?;
        if let Some(location) = value.get("location").and_then(|location| location.as_str()) {
            files.push(git_root.join(location).join("package.json"));
        }
    }

    tracing::debug!(
        count = files.len(),
        "Found yarn workspace package.json files"
    );
    Ok(files)
}

/// Sorts the given package.json files to ensure consistent key ordering.
///
/// If no files are provided, sorts all yarn workspace package.json files.
/// If `check` is true, only verifies files are sorted without modifying them.
///
/// # Errors
///
/// Returns an error if sorting any file fails, or in check mode if any file is not sorted.
#[tracing::instrument(level = "info", skip_all)]
pub(crate) async fn sort_package_json_files(
    files: Option<Vec<PathBuf>>,
    check: bool,
) -> Result<(), Report<[SortPackageJsonError]>> {
    let files = match files {
        Some(files) => files,
        None => get_yarn_workspace_package_jsons().await?,
    };

    let mut sink: ReportSink<SortPackageJsonError> = ReportSink::new_armed();

    for path in files {
        if let Err(error) = process_file(&path, check).await {
            sink.append(error);
        }
    }

    sink.finish()
}

async fn process_file(path: &PathBuf, check: bool) -> Result<(), Report<SortPackageJsonError>> {
    let contents = fs::read_to_string(path)
        .await
        .change_context_lazy(|| SortPackageJsonError::ReadFile(path.clone()))?;

    let sorted = sort_package_json::sort_package_json(&contents)
        .change_context_lazy(|| SortPackageJsonError::SortFile(path.clone()))?;

    if contents == sorted {
        tracing::debug!(?path, "File is already sorted");
        return Ok(());
    }

    if check {
        tracing::warn!(?path, "File is not sorted");
        return Err(Report::new(SortPackageJsonError::NotSorted(path.clone())));
    }

    fs::write(path, &sorted)
        .await
        .change_context_lazy(|| SortPackageJsonError::WriteFile(path.clone()))?;

    tracing::info!(?path, "Sorted package.json");
    Ok(())
}
