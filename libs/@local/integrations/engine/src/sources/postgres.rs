use core::pin::Pin;
use std::path::PathBuf;

use duckdb::Config;
use error_stack::Report;
use hash_integrations_definition::{PostgresSource, SslMode};
use hash_secret::Secret;
use serde::Deserialize;

use super::{CaptureLimits, SourceError};
use crate::{SourceCapture, sql::Identifier};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredCredentials {
    username: String,
    password: String,
}

#[derive(Debug)]
struct Credentials {
    username: Pin<Box<Secret<str>>>,
    password: Pin<Box<Secret<str>>>,
}

#[tracing::instrument(level = "debug", skip_all)]
pub(super) async fn capture(
    source: &PostgresSource,
    secret: &Secret<[u8]>,
    target: PathBuf,
    limits: CaptureLimits,
) -> Result<SourceCapture, Report<SourceError>> {
    let stored: StoredCredentials = serde_json::from_slice(secret.expose())
        .map_err(|_error| Report::new(SourceError::Secret))?;
    if stored.username.trim().is_empty()
        || stored.password.is_empty()
        || stored.username.contains('\0')
        || stored.password.contains('\0')
    {
        return Err(Report::new(SourceError::Secret));
    }
    let credentials = Credentials {
        username: Secret::from_string(stored.username),
        password: Secret::from_string(stored.password),
    };
    let source = source.clone();
    tokio::task::spawn_blocking(move || capture_blocking(&source, &credentials, &target, limits))
        .await
        .map_err(|_error| Report::new(SourceError::Postgres))?
}

fn literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn connection_string(source: &PostgresSource, credentials: &Credentials) -> String {
    let port = source.port.to_string();
    let ssl = match source.ssl_mode {
        SslMode::Disable => "disable",
        SslMode::Require => "require",
        SslMode::VerifyFull => "verify-full",
    };
    [
        ("host", &*source.host),
        ("port", &port),
        ("dbname", &source.database),
        ("user", credentials.username.expose()),
        ("password", credentials.password.expose()),
        ("sslmode", ssl),
        ("connect_timeout", "30"),
    ]
    .into_iter()
    .map(|(name, value)| {
        format!(
            "{name}='{}'",
            value.replace('\\', "\\\\").replace('\'', "\\'")
        )
    })
    .collect::<Vec<_>>()
    .join(" ")
}

fn capture_blocking(
    source: &PostgresSource,
    credentials: &Credentials,
    target: &std::path::Path,
    limits: CaptureLimits,
) -> Result<SourceCapture, Report<SourceError>> {
    let partial = SourceCapture::stage(target).map_err(|_error| Report::new(SourceError::Write))?;
    let mut config = Config::default()
        .with("allow_community_extensions", "false")
        .map_err(|_error| Report::new(SourceError::Configuration))?;
    for (name, value) in [
        (
            "memory_limit",
            limits.memory_limit.map(crate::ByteSize::setting),
        ),
        (
            "max_temp_directory_size",
            limits.temp_directory_limit.map(crate::ByteSize::setting),
        ),
        (
            "threads",
            limits
                .threads
                .map(|threads| threads.to_string().into_boxed_str()),
        ),
    ] {
        if let Some(value) = value {
            config = config
                .with(name, &value)
                .map_err(|_error| Report::new(SourceError::Configuration))?;
        }
    }
    let connection = duckdb::Connection::open_in_memory_with_flags(config)
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    connection
        .execute_batch("INSTALL postgres; LOAD postgres")
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    connection
        .execute_batch(&format!(
            "ATTACH {} AS _capture (TYPE postgres, READ_ONLY)",
            literal(&connection_string(source, credentials))
        ))
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    let path = partial
        .path()
        .to_str()
        .ok_or_else(|| Report::new(SourceError::Write))?;
    connection
        .execute_batch(&format!(
            "COPY (SELECT * FROM _capture.{}.{}) TO {} (FORMAT PARQUET, COMPRESSION SNAPPY)",
            Identifier::new(&source.schema),
            Identifier::new(&source.table),
            literal(path)
        ))
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    drop(connection);
    let rows = SourceCapture::open(partial.path().to_owned())
        .map_err(|_error| Report::new(SourceError::Write))?
        .rows();
    SourceCapture::publish(partial, target, rows).map_err(|_error| Report::new(SourceError::Write))
}

#[cfg(test)]
mod tests {
    use hash_integrations_definition::PostgresSource;
    use hash_secret::Secret;
    use serde_json::json;
    use tempfile::TempDir;

    use super::{Credentials, capture, connection_string};
    use crate::{CaptureLimits, Workspace, WorkspaceConfig};

    fn source() -> PostgresSource {
        serde_json::from_value(json!({"host": "localhost", "database": "postgres", "schema": "public", "table": "be932_capture_fixture", "sslMode": "disable", "credentials": {"secretEntityUuid": uuid::Uuid::new_v4()}})).expect("should describe the fixture source")
    }

    #[test]
    fn connection_quotes_credentials() {
        let value = connection_string(
            &source(),
            &Credentials {
                username: Secret::from_string("reader".to_owned()),
                password: Secret::from_string("pa'ss\\word".to_owned()),
            },
        );
        assert!(
            value.contains("password='pa\\'ss\\\\word'"),
            "should escape quotes and backslashes for libpq"
        );
    }

    #[tokio::test]
    #[ignore = "requires local PostgreSQL with the be932_capture_fixture table and the DuckDB \
                postgres extension"]
    async fn capture_postgres_table() {
        let directory = TempDir::new().expect("should create output storage");
        let secret = Secret::from_vec(br#"{"username":"postgres","password":"postgres"}"#.to_vec());
        let capture = capture(
            &source(),
            &secret,
            directory.path().join("source.parquet"),
            CaptureLimits::default(),
        )
        .await
        .expect("should capture the PostgreSQL fixture");
        assert_eq!(capture.rows(), 2, "should capture both fixture rows");
        let workspace = Workspace::open(
            directory.path().join("run.duckdb"),
            WorkspaceConfig::default(),
        )
        .await
        .expect("should open a workspace");
        workspace
            .load_capture(capture, "raw".into())
            .await
            .expect("should load PostgreSQL capture");
        let rows = workspace
            .query("SELECT id, label, amount::VARCHAR FROM raw ORDER BY id".into())
            .await
            .expect("should read PostgreSQL values");
        assert_eq!(
            rows.iter().next(),
            Some(
                [
                    duckdb::types::Value::Int(1),
                    duckdb::types::Value::Text("first".to_owned()),
                    duckdb::types::Value::Text("12.30".to_owned())
                ]
                .as_slice()
            ),
            "should preserve decimal values through Parquet and workspace loading"
        );
        assert_eq!(
            rows.iter().nth(1),
            Some(
                [
                    duckdb::types::Value::Int(2),
                    duckdb::types::Value::Null,
                    duckdb::types::Value::Null
                ]
                .as_slice()
            ),
            "should preserve SQL nulls"
        );
        workspace.close().await.expect("should close the workspace");
    }
}

#[cfg(test)]
mod credential_tests {
    use hash_secret::Secret;
    use serde_json::json;
    use tempfile::TempDir;

    use super::capture;
    use crate::{CaptureLimits, SourceError};

    #[tokio::test]
    async fn credentials_redact_malformed_values() {
        let source = serde_json::from_value(json!({"host": "unavailable.invalid", "database": "db", "schema": "public", "table": "items", "credentials": {"secretEntityUuid": uuid::Uuid::new_v4()}})).expect("should describe a source");
        let directory = TempDir::new().expect("should create output storage");
        for value in [
            json!({"username": "sensitive-user", "password": 987_654_321}),
            json!({"username": "sensitive-user", "password": "sensitive-password", "extra-sensitive-field": "extra-sensitive-value"}),
        ] {
            let secret = Secret::from_vec(
                serde_json::to_vec(&value).expect("should serialize the malformed fixture"),
            );
            let error = capture(
                &source,
                &secret,
                directory.path().join("invalid.parquet"),
                CaptureLimits::default(),
            )
            .await
            .expect_err("should reject malformed credentials before connecting");
            assert!(
                matches!(error.current_context(), SourceError::Secret),
                "should report invalid credentials"
            );
            let diagnostic = format!("{error:?}");
            for sentinel in [
                "sensitive-user",
                "sensitive-password",
                "extra-sensitive-field",
                "987654321",
            ] {
                assert!(
                    !diagnostic.contains(sentinel),
                    "should omit credential values and field names from diagnostics"
                );
            }
        }
    }
}
