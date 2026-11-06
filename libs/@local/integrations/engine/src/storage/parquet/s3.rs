use alloc::sync::Arc;
use core::str;
use std::path::Path;

use duckdb::Connection;
use error_stack::{Report, ResultExt as _};

use super::Stored;
use crate::{
    SourceCapture,
    sql::literal,
    storage::{ArtifactError, ArtifactKey, S3Bucket},
};

impl S3Bucket {
    /// Runs `operation` on the blocking thread pool, because DuckDB blocks while it talks to S3.
    pub(super) async fn blocking<T: Send + 'static>(
        self: Arc<Self>,
        context: ArtifactError,
        operation: impl FnOnce(&Self) -> Result<T, Report<ArtifactError>> + Send + 'static,
    ) -> Result<T, Report<ArtifactError>> {
        tokio::task::spawn_blocking(move || operation(&self))
            .await
            .change_context(context)?
    }

    /// Copies the artifact at `key` to `target`, or returns `None` if the bucket has none.
    pub(super) fn download(
        &self,
        key: &ArtifactKey,
        target: &Path,
    ) -> Result<Option<SourceCapture>, Report<ArtifactError>> {
        let connection = self.connect()?;
        if !self.exists(&connection, key)? {
            return Ok(None);
        }
        let path = target
            .to_str()
            .ok_or_else(|| Report::new(ArtifactError::Read))?;
        connection
            .execute_batch(&format!(
                "COPY (FROM read_parquet({})) TO {} (FORMAT PARQUET)",
                literal(&self.uri(key)),
                literal(path)
            ))
            .change_context(ArtifactError::Read)?;
        SourceCapture::open(target.to_owned())
            .map(Some)
            .change_context(ArtifactError::Read)
    }

    /// Uploads `artifact` to `key` unless an artifact is already there.
    ///
    /// The check and the upload are separate requests, so callers must not store the same key
    /// concurrently.
    pub(super) fn store(
        &self,
        key: &ArtifactKey,
        artifact: &SourceCapture,
    ) -> Result<Stored, Report<ArtifactError>> {
        let connection = self.connect()?;
        if self.exists(&connection, key)? {
            return Ok(Stored::Exists);
        }
        let path = artifact
            .path()
            .to_str()
            .ok_or_else(|| Report::new(ArtifactError::Write))?;
        connection
            .execute_batch(&format!(
                "COPY (FROM read_parquet({})) TO {} (FORMAT PARQUET)",
                literal(path),
                literal(&self.uri(key))
            ))
            .change_context(ArtifactError::Write)?;
        Ok(Stored::Created)
    }

    fn uri(&self, key: &ArtifactKey) -> String {
        format!("{}/{key}", self.uri)
    }

    fn exists(
        &self,
        connection: &Connection,
        key: &ArtifactKey,
    ) -> Result<bool, Report<ArtifactError>> {
        let uri = self.uri(key);
        let directory = uri
            .rsplit_once('/')
            .map_or(uri.as_str(), |(directory, _)| directory);
        // `glob` returns a path without wildcards unchecked, so list the key's directory instead.
        let stored: u64 = connection
            .query_row(
                &format!(
                    "SELECT count(*) FROM glob({}) WHERE file = {}",
                    literal(&format!("{directory}/*")),
                    literal(&uri)
                ),
                [],
                |row| row.get(0),
            )
            .change_context(ArtifactError::Read)?;
        Ok(stored > 0)
    }

    // Origin: the isolated in-memory DuckDB of the PostgreSQL source (`sources/postgres.rs`), with
    // `httpfs` and an S3 secret instead of the `postgres` extension.
    fn connect(&self) -> Result<Connection, Report<ArtifactError>> {
        let connection = Connection::open_in_memory().change_context(ArtifactError::Read)?;
        connection
            .execute_batch("INSTALL httpfs; LOAD httpfs;")
            .change_context(ArtifactError::Read)?;
        let secret = str::from_utf8(self.secret.expose()).change_context(ArtifactError::Read)?;
        let endpoint = self.endpoint.as_deref().map_or_default(|endpoint| {
            format!(", ENDPOINT {}, URL_STYLE 'path'", literal(endpoint))
        });
        // DuckDB can quote a failed statement in its error, and this one holds the secret.
        connection
            .execute_batch(&format!(
                "CREATE SECRET (TYPE s3, KEY_ID {}, SECRET {}, REGION {}, USE_SSL {}{endpoint})",
                literal(&self.key_id),
                literal(secret),
                literal(&self.region),
                self.use_ssl,
            ))
            .map_err(|_error| Report::new(ArtifactError::Read))?;
        Ok(connection)
    }
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use crate::{
        sql::literal,
        storage::{
            ArtifactKey,
            tests::{bucket, minio},
        },
    };

    fn key(path: &str) -> ArtifactKey {
        ArtifactKey(path.into())
    }

    const STORED: &str = "web/run/items.parquet";

    /// Starts MinIO with one object at [`STORED`] and checks whether `key` exists.
    async fn exists(key: ArtifactKey) -> bool {
        let (_minio, port) = minio().await;
        let bucket = bucket(port);
        let connection = bucket.connect().expect("should connect to the bucket");
        connection
            .execute_batch(&format!(
                "COPY (SELECT 1 AS id) TO {} (FORMAT PARQUET)",
                literal(&bucket.uri(&self::key(STORED)))
            ))
            .expect("should store an object");
        bucket
            .exists(&connection, &key)
            .expect("should check the key")
    }

    #[tokio::test]
    async fn exists_finds_a_stored_key() {
        assert!(exists(key(STORED)).await, "should find the stored object");
    }

    #[rstest]
    #[case::sibling_in_the_directory("web/run/orders.parquet")]
    #[case::empty_directory("web/other/items.parquet")]
    #[case::prefix_of_a_stored_key("web/run/items")]
    #[tokio::test]
    async fn exists_ignores_other_keys(#[case] path: &str) {
        assert!(!exists(key(path)).await, "only the exact key should exist");
    }
}
