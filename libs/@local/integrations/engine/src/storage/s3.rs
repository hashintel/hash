use core::str;
use std::path::Path;

use duckdb::Connection;
use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::SourceName;

use super::local::recovered;
use crate::{CaptureError, CaptureRun, SecretValue, SourceCapture, sql::literal};

#[derive(Debug)]
pub struct S3Bucket {
    /// The bucket and prefix captures are stored under, as `s3://bucket/prefix`.
    pub uri: Box<str>,
    pub region: Box<str>,
    /// An S3-compatible endpoint such as MinIO, addressed with path-style URLs.
    pub endpoint: Option<Box<str>>,
    pub use_ssl: bool,
    pub key_id: Box<str>,
    pub secret: SecretValue,
}

impl S3Bucket {
    fn uri(&self, run: CaptureRun, source: &SourceName) -> String {
        format!("{}/{}/{}/{source}.parquet", self.uri, run.web, run.id)
    }

    /// Returns the stored capture of `source`, staged at `target`, or `None` if the bucket has
    /// none.
    pub(super) fn download(
        &self,
        run: CaptureRun,
        source: &SourceName,
        target: &Path,
    ) -> Result<Option<SourceCapture>, Report<CaptureError>> {
        let uri = self.uri(run, source);
        let connection = self.connect()?;
        // `glob` returns a path without wildcards unchecked, so list the run's captures instead.
        let stored: u64 = connection
            .query_row(
                &format!(
                    "SELECT count(*) FROM glob({}) WHERE file = {}",
                    literal(&format!("{}/{}/{}/*", self.uri, run.web, run.id)),
                    literal(&uri)
                ),
                [],
                |row| row.get(0),
            )
            .change_context(CaptureError::Read)?;
        if stored == 0 {
            return Ok(None);
        }
        if let Some(capture) = recovered(target)? {
            return Ok(Some(capture));
        }
        let partial = SourceCapture::stage(target)?;
        let path = partial
            .path()
            .to_str()
            .ok_or_else(|| Report::new(CaptureError::Read))?;
        let rows = connection
            .execute(
                &format!(
                    "COPY (FROM read_parquet({})) TO {} (FORMAT PARQUET)",
                    literal(&uri),
                    literal(path)
                ),
                [],
            )
            .change_context(CaptureError::Read)?;
        SourceCapture::publish(
            partial,
            target,
            u64::try_from(rows).change_context(CaptureError::Read)?,
        )
        .map(Some)
    }

    pub(super) fn upload(
        &self,
        run: CaptureRun,
        source: &SourceName,
        capture: &SourceCapture,
    ) -> Result<(), Report<CaptureError>> {
        let path = capture
            .path()
            .to_str()
            .ok_or_else(|| Report::new(CaptureError::Write))?;
        // The upload replaces any object at the key. Retries and restores of a run use the same
        // key, so if two attempts of one run overlap, the later upload can replace a capture the
        // earlier attempt already read, and the run continues from different input.
        self.connect()
            .change_context(CaptureError::Write)?
            .execute_batch(&format!(
                "COPY (FROM read_parquet({})) TO {} (FORMAT PARQUET)",
                literal(path),
                literal(&self.uri(run, source))
            ))
            .change_context(CaptureError::Write)
    }

    fn connect(&self) -> Result<Connection, Report<CaptureError>> {
        let connection = Connection::open_in_memory().change_context(CaptureError::Read)?;
        connection
            .execute_batch("INSTALL httpfs; LOAD httpfs;")
            .change_context(CaptureError::Read)?;
        let secret = str::from_utf8(self.secret.expose()).change_context(CaptureError::Read)?;
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
            .map_err(|_error| Report::new(CaptureError::Read))?;
        Ok(connection)
    }
}
