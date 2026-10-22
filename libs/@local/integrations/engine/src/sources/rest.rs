use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use core::{pin::Pin, time::Duration};
use std::{
    fs::File,
    io::{BufRead as _, BufReader, Seek as _, Write as _},
    path::{Path, PathBuf},
};

use arrow_array::{ArrayRef, RecordBatch, StringArray};
use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Pagination, PrimaryKey, RestAuth, RestSource};
use hash_secret::Secret;
use parquet::{arrow::ArrowWriter, basic::Compression, file::properties::WriterProperties};
use reqwest::{
    Url,
    header::{AUTHORIZATION, HeaderMap, HeaderName, HeaderValue},
};
use serde::Deserialize;
use serde_json::Value;
use tempfile::NamedTempFile;

use super::{SourceError, http};
use crate::SourceCapture;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredToken {
    #[serde(deserialize_with = "super::secrets::deserialize_secret")]
    value: Pin<Box<Secret<str>>>,
}

fn headers(
    auth: Option<&RestAuth>,
    secret: Option<&Secret<[u8]>>,
) -> Result<HeaderMap, Report<SourceError>> {
    let mut headers = HeaderMap::new();
    if let Some(auth) = auth {
        let token: StoredToken = serde_json::from_slice(
            secret
                .ok_or_else(|| Report::new(SourceError::Secret))?
                .expose(),
        )
        .map_err(|_error| Report::new(SourceError::Secret))?;
        if token.value.expose().is_empty() {
            return Err(Report::new(SourceError::Secret));
        }
        let (name, value) = match auth {
            RestAuth::Bearer { .. } => (AUTHORIZATION, format!("Bearer {}", token.value.expose())),
            RestAuth::Header { name, .. } => (
                HeaderName::from_bytes(name.as_bytes())
                    .map_err(|_error| Report::new(SourceError::Configuration))?,
                token.value.expose().to_owned(),
            ),
        };
        if matches!(
            name.as_str(),
            "host" | "connection" | "content-length" | "transfer-encoding" | "proxy-authorization"
        ) {
            return Err(Report::new(SourceError::Configuration));
        }
        let mut value =
            HeaderValue::from_str(&value).map_err(|_error| Report::new(SourceError::Secret))?;
        value.set_sensitive(true);
        headers.insert(name, value);
    }
    Ok(headers)
}

async fn capture_with_client(
    endpoint: &RestSource,
    key: &PrimaryKey,
    secret: Option<&Secret<[u8]>>,
    target: PathBuf,
    client: &reqwest::Client,
) -> Result<SourceCapture, Report<SourceError>> {
    let origin =
        Url::parse(&endpoint.url).map_err(|_error| Report::new(SourceError::Configuration))?;
    let mut current = origin.clone();
    let headers = headers(endpoint.auth.as_ref(), secret)?;
    let directory = target.parent().unwrap_or_else(|| Path::new(".")).to_owned();
    let columns: BTreeSet<String> = key.columns().iter().map(ToString::to_string).collect();
    let mut spool = tokio::task::spawn_blocking(move || Spool::new(&directory, columns))
        .await
        .change_context(SourceError::Write)??;
    let mut offset = 0_u64;
    let mut page = 0_u64;
    let mut seen = BTreeSet::new();
    loop {
        let url = page_url(&current, endpoint, offset);
        if !seen.insert(url.clone()) {
            return Err(Report::new(SourceError::Pagination));
        }
        let body = http::fetch(
            client,
            &url,
            &headers,
            Duration::from_millis(endpoint.rate_limit_ms),
        )
        .await?;
        let rows = extract(&body, endpoint.results_field.as_deref())
            .and_then(Value::as_array)
            .ok_or_else(|| Report::new(SourceError::Response))?;
        let count =
            u64::try_from(rows.len()).map_err(|_error| Report::new(SourceError::Response))?;
        if count == 0 {
            break;
        }
        let rows = rows.clone();
        spool = tokio::task::spawn_blocking(move || {
            spool.append(&rows)?;
            Ok::<_, Report<SourceError>>(spool)
        })
        .await
        .change_context(SourceError::Write)??;
        page = page
            .checked_add(1)
            .ok_or_else(|| Report::new(SourceError::Pagination))?;
        if endpoint
            .max_pages
            .is_some_and(|maximum| page >= maximum.get())
        {
            break;
        }
        match &endpoint.pagination {
            Some(Pagination::NextLink { field }) => {
                let Some(next) = extract(&body, Some(field)).filter(|value| !value.is_null())
                else {
                    break;
                };
                let next = next
                    .as_str()
                    .ok_or_else(|| Report::new(SourceError::Pagination))?;
                if next.is_empty() {
                    break;
                }
                current = url
                    .join(next)
                    .map_err(|_error| Report::new(SourceError::Pagination))?;
                if current.origin() != origin.origin() {
                    return Err(Report::new(SourceError::Destination));
                }
            }
            Some(Pagination::Offset) if count >= endpoint.page_size.get() => {
                offset = offset
                    .checked_add(count)
                    .ok_or_else(|| Report::new(SourceError::Pagination))?;
            }
            _ => break,
        }
    }
    tokio::task::spawn_blocking(move || spool.publish(&target))
        .await
        .change_context(SourceError::Write)?
}

fn page_url(current: &Url, endpoint: &RestSource, offset: u64) -> Url {
    let offset_pagination = matches!(endpoint.pagination, Some(Pagination::Offset));
    let retained: Vec<_> = current
        .query_pairs()
        .filter(|(name, _)| {
            !(endpoint.params.contains_key(name.as_ref())
                || offset_pagination && matches!(name.as_ref(), "offset" | "limit"))
        })
        .map(|(name, value)| (name.into_owned(), value.into_owned()))
        .collect();
    let mut url = current.clone();
    if !retained.is_empty() || !endpoint.params.is_empty() || offset_pagination {
        let mut pairs = url.query_pairs_mut();
        pairs
            .clear()
            .extend_pairs(retained)
            .extend_pairs(&endpoint.params);
        if offset_pagination {
            pairs
                .append_pair("offset", &offset.to_string())
                .append_pair("limit", &endpoint.page_size.to_string());
        }
    }
    url
}

fn extract<'body>(body: &'body Value, path: Option<&str>) -> Option<&'body Value> {
    let mut value = body;
    if let Some(path) = path {
        for part in path.split('.') {
            value = value.get(part)?;
        }
    }
    Some(value)
}

struct Spool {
    file: NamedTempFile,
    columns: BTreeSet<String>,
    rows: u64,
}

impl Spool {
    fn new(directory: &Path, columns: BTreeSet<String>) -> Result<Self, Report<SourceError>> {
        Ok(Self {
            file: NamedTempFile::new_in(directory).change_context(SourceError::Write)?,
            columns,
            rows: 0,
        })
    }

    fn append(&mut self, rows: &[Value]) -> Result<(), Report<SourceError>> {
        for row in rows {
            if self.rows == 0 {
                self.columns.clear();
            }
            let object = row
                .as_object()
                .ok_or_else(|| Report::new(SourceError::Response))?;
            if object.is_empty() {
                return Err(Report::new(SourceError::Response));
            }
            let mut cells = BTreeMap::new();
            for (column, value) in object {
                if column.is_empty()
                    || column.contains('\0')
                    || self
                        .columns
                        .iter()
                        .any(|known| known != column && known.eq_ignore_ascii_case(column))
                {
                    return Err(Report::new(SourceError::Response));
                }
                self.columns.insert(column.clone());
                cells.insert(
                    column,
                    match value {
                        Value::Null => None,
                        Value::String(value) => Some(value.clone()),
                        value @ (Value::Bool(_)
                        | Value::Number(_)
                        | Value::Array(_)
                        | Value::Object(_)) => Some(value.to_string()),
                    },
                );
            }
            serde_json::to_writer(self.file.as_file_mut(), &cells)
                .change_context(SourceError::Write)?;
            self.file
                .write_all(b"\n")
                .change_context(SourceError::Write)?;
            self.rows = self
                .rows
                .checked_add(1)
                .ok_or_else(|| Report::new(SourceError::Write))?;
        }
        Ok(())
    }

    fn batch(
        &self,
        rows: &[BTreeMap<String, Option<String>>],
    ) -> Result<RecordBatch, Report<SourceError>> {
        RecordBatch::try_from_iter_with_nullable(self.columns.iter().map(|column| {
            let values = StringArray::from_iter(
                rows.iter()
                    .map(|row| row.get(column).and_then(Option::as_deref)),
            );
            (column, Arc::new(values) as ArrayRef, true)
        }))
        .change_context(SourceError::Write)
    }

    fn publish(mut self, target: &Path) -> Result<SourceCapture, Report<SourceError>> {
        let mut partial = SourceCapture::stage(target).change_context(SourceError::Write)?;
        let schema = self.batch(&[])?.schema();
        let properties = WriterProperties::builder()
            .set_compression(Compression::SNAPPY)
            .set_max_row_group_row_count(Some(64 * 1024))
            .build();
        let mut writer = ArrowWriter::try_new(partial.as_file_mut(), schema, Some(properties))
            .change_context(SourceError::Write)?;
        self.file
            .as_file_mut()
            .rewind()
            .change_context(SourceError::Write)?;
        let input: File = self.file.reopen().change_context(SourceError::Write)?;
        let mut rows = Vec::with_capacity(1024);
        for line in BufReader::new(input).lines() {
            let line = line.change_context(SourceError::Write)?;
            rows.push(
                serde_json::from_str(&line).map_err(|_error| Report::new(SourceError::Write))?,
            );
            if rows.len() == 1024 {
                writer
                    .write(&self.batch(&rows)?)
                    .change_context(SourceError::Write)?;
                rows.clear();
            }
        }
        if !rows.is_empty() {
            writer
                .write(&self.batch(&rows)?)
                .change_context(SourceError::Write)?;
        }
        writer.close().change_context(SourceError::Write)?;
        SourceCapture::publish(partial, target, self.rows).change_context(SourceError::Write)
    }
}

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeMap;

    use axum::{Json, Router, extract::Query, routing::get};
    use hash_integrations_definition::{PrimaryKey, RestSource};
    use serde_json::json;
    use tempfile::TempDir;

    use super::capture_with_client;
    use crate::{
        Workspace, WorkspaceConfig,
        sources::{
            SourceError,
            tests::{public_client, server},
        },
    };

    fn key() -> PrimaryKey {
        PrimaryKey::new(["id".parse().expect("should parse the column")])
            .expect("should build a key")
    }

    #[tokio::test]
    async fn pagination_late_columns_and_nulls() {
        let router = Router::new().route("/items", get(|Query(query): Query<BTreeMap<String, String>>, headers: axum::http::HeaderMap| async move {
            assert_eq!(headers.get("authorization").and_then(|value| value.to_str().ok()), Some("Bearer sentinel"), "should authenticate every page");
            assert_eq!(query.get("tenant").map(String::as_str), Some("fixed"), "should preserve configured parameters on every page");
            match query.get("page").map(String::as_str) {
                None => Json(json!({"results": [{"id": 1, "nested": {"a": 2}}], "next": "?page=2"})),
                _ => Json(json!({"results": [{"id": 2, "later": true, "nested": null}]})),
            }
        }));
        let server = server(router).await;
        let (client, url) = public_client(&server);
        let endpoint: RestSource = serde_json::from_value(json!({"url": format!("{url}/items"), "resultsField": "results", "params": {"tenant": "fixed"}, "pagination": {"type": "next-link", "field": "next"}, "auth": {"type": "bearer", "secretEntityUuid": uuid::Uuid::new_v4()}})).expect("should describe the endpoint");
        let secret = hash_secret::Secret::from_vec(br#"{"value":"sentinel"}"#.to_vec());
        let directory = TempDir::new().expect("should create output storage");
        let capture = capture_with_client(
            &endpoint,
            &key(),
            Some(&secret),
            directory.path().join("rows.parquet"),
            &client,
        )
        .await
        .expect("should capture all pages");
        assert_eq!(capture.rows(), 2, "should count both pages");
        let workspace = Workspace::open(
            directory.path().join("run.duckdb"),
            WorkspaceConfig::default(),
        )
        .await
        .expect("should open the workspace");
        workspace
            .load_capture(capture, "raw".into())
            .await
            .expect("should load the capture");
        let rows = workspace
            .query("SELECT id, later, nested FROM raw ORDER BY id".into())
            .await
            .expect("should read captured cells");
        let mut rows = rows.iter();
        assert_eq!(
            rows.next(),
            Some(
                [
                    duckdb::types::Value::Text("1".to_owned()),
                    duckdb::types::Value::Null,
                    duckdb::types::Value::Text("{\"a\":2}".to_owned())
                ]
                .as_slice()
            ),
            "should retain early rows and null-fill later columns"
        );
        assert_eq!(
            rows.next(),
            Some(
                [
                    duckdb::types::Value::Text("2".to_owned()),
                    duckdb::types::Value::Text("true".to_owned()),
                    duckdb::types::Value::Null
                ]
                .as_slice()
            ),
            "should retain later columns and nulls"
        );
        workspace.close().await.expect("should close the workspace");
    }

    #[tokio::test]
    async fn pagination_cross_origin_removes_partial_capture() {
        let server = server(Router::new().route(
            "/",
            get(|| async {
                Json(json!({"results": [{"id": 1}], "next": "https://other.example/secret"}))
            }),
        ))
        .await;
        let (client, url) = public_client(&server);
        let endpoint = serde_json::from_value(json!({"url": url, "resultsField": "results", "pagination": {"type": "next-link", "field": "next"}})).expect("should describe the endpoint");
        let directory = TempDir::new().expect("should create output storage");
        let target = directory.path().join("rows.parquet");
        let error = capture_with_client(&endpoint, &key(), None, target.clone(), &client)
            .await
            .expect_err("should reject a cross-origin next page");
        assert!(
            matches!(error.current_context(), SourceError::Destination),
            "should report the blocked destination"
        );
        assert!(!target.exists(), "should publish only a complete capture");
        assert_eq!(
            std::fs::read_dir(directory.path())
                .expect("should read output storage")
                .count(),
            0,
            "should remove spooled rows on failure"
        );
    }

    #[tokio::test]
    async fn empty_response_preserves_key_schema() {
        let server = server(Router::new().route("/", get(|| async { Json(json!([])) }))).await;
        let (client, url) = public_client(&server);
        let endpoint =
            serde_json::from_value(json!({"url": url})).expect("should describe the endpoint");
        let directory = TempDir::new().expect("should create output storage");
        let capture = capture_with_client(
            &endpoint,
            &key(),
            None,
            directory.path().join("empty.parquet"),
            &client,
        )
        .await
        .expect("should capture an empty source");
        let workspace = Workspace::open(
            directory.path().join("run.duckdb"),
            WorkspaceConfig::default(),
        )
        .await
        .expect("should open the workspace");
        workspace
            .load_capture(capture, "empty".into())
            .await
            .expect("should load the empty schema");
        let rows = workspace
            .query("SELECT id FROM empty".into())
            .await
            .expect("should preserve the key column");
        assert_eq!(rows.iter().len(), 0, "should retain an empty source");
        workspace.close().await.expect("should close the workspace");
    }
}

#[cfg(test)]
mod schema_tests {
    use alloc::collections::BTreeSet;

    use serde_json::json;
    use tempfile::TempDir;

    use super::Spool;

    #[test]
    fn rows_preserve_missing_key_columns() {
        let directory = TempDir::new().expect("should create spool storage");
        let mut spool = Spool::new(directory.path(), BTreeSet::from(["id".to_owned()]))
            .expect("should create the spool");
        spool
            .append(&[json!({"value": "first"})])
            .expect("should spool a row");
        assert!(
            !spool.columns.contains("id"),
            "a nonempty source should not synthesize a missing primary-key column"
        );
        let error = spool.append(&[json!({"VALUE": "second"})]).expect_err(
            "should reject a case-insensitive column collision before DuckDB can rename it",
        );
        assert!(
            matches!(error.current_context(), crate::SourceError::Response),
            "should identify an invalid response schema"
        );
    }
}
