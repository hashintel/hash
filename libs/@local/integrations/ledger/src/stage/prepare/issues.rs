//! The issues file: the rows, or parts of rows, that Prepare could not turn into a change as they
//! are.

use std::path::Path;

use error_stack::{Report, ResultExt as _};
use serde::Serialize;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use crate::{
    run::{self, RunId},
    storage::{Storage, StorageError},
};

/// A row, or part of one, that is not written as captured. It is one line of the issues file.
///
/// Each issue names the type of the entity or link the row was turned into, as several sinks and
/// link pipelines can read the same rows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(super) struct Issue {
    /// The `_seq` of the row.
    pub seq: i64,
    pub kind: IssueKind,
    pub entity_type: VersionedUrl,
    /// The entity or link, if the row has a value to identify it.
    pub entity_id: Option<EntityId>,
    /// The column that should identify the record, or the property that was left out.
    pub name: Box<str>,
    /// Why the property's value could not be converted.
    pub reason: Option<Box<str>>,
    /// The value that could not be converted.
    pub value: Option<Box<str>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum IssueKind {
    /// The row is left out, as it has no value to identify what it describes.
    MissingSourceId,
    /// The entity or link is written without one of its properties.
    Property,
}

/// Writes `issues` as `runs/{run}/issues.jsonl`, one line of JSON each, and returns its key.
/// Without issues nothing is written, and the key is `None`.
///
/// The file is written to `scratch` first, then uploaded.
///
/// # Errors
///
/// - [`StorageError::LocalFile`] if the file cannot be written to `scratch`
/// - the errors of [`Storage::upload`]
pub(super) async fn write(
    storage: &Storage,
    run: RunId,
    scratch: &Path,
    issues: &[Issue],
) -> Result<Option<Box<str>>, Report<StorageError>> {
    if issues.is_empty() {
        return Ok(None);
    }
    let mut lines = Vec::new();
    for issue in issues {
        serde_json::to_writer(&mut lines, issue).expect("an issue should serialize to JSON");
        lines.push(b'\n');
    }
    let file = scratch.join("issues.jsonl");
    tokio::fs::write(&file, lines)
        .await
        .change_context(StorageError::LocalFile)?;
    let key = run::issues_file(run);
    storage.upload(&file, &key).await?;
    Ok(Some(key.into_boxed_str()))
}
