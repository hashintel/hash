use core::pin::Pin;
use std::path::{Path, PathBuf};

use duckdb::{Config, Connection};
use error_stack::Report;
use hash_integrations_definition::PostgresSource;
use hash_secret::Secret;
use serde::Deserialize;
use url::Url;

use super::{CaptureLimits, SourceError};
use crate::{ByteSize, SourceCapture, sql::Identifier};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Credentials {
    #[serde(deserialize_with = "super::secrets::deserialize_secret")]
    username: Pin<Box<Secret<str>>>,
    #[serde(deserialize_with = "super::secrets::deserialize_secret")]
    password: Pin<Box<Secret<str>>>,
}

#[tracing::instrument(level = "debug", skip_all)]
pub(super) async fn capture(
    source: &PostgresSource,
    secret: &Secret<[u8]>,
    target: PathBuf,
    limits: CaptureLimits,
) -> Result<SourceCapture, Report<SourceError>> {
    let credentials: Credentials = serde_json::from_slice(secret.expose())
        .map_err(|_error| Report::new(SourceError::Secret))?;
    if credentials.username.expose().trim().is_empty()
        || credentials.password.expose().is_empty()
        || credentials.username.expose().contains('\0')
        || credentials.password.expose().contains('\0')
    {
        return Err(Report::new(SourceError::Secret));
    }
    let source = source.clone();
    tokio::task::spawn_blocking(move || capture_blocking(&source, &credentials, &target, limits))
        .await
        .map_err(|_error| Report::new(SourceError::Postgres))?
}

fn literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn connection_uri(source: &PostgresSource, credentials: &Credentials) -> Url {
    let mut uri = source.connection.clone();
    let query = uri.query().map(|query| query.replace('+', "%2B"));
    uri.set_query(query.as_deref());
    let ssl_mode = uri.query_pairs().any(|(name, _)| name == "sslmode");
    let timeout = uri.query_pairs().any(|(name, _)| name == "connect_timeout");
    {
        let mut parameters = uri.query_pairs_mut();
        parameters
            .append_pair("user", credentials.username.expose())
            .append_pair("password", credentials.password.expose());
        if !ssl_mode {
            parameters.append_pair("sslmode", "verify-full");
        }
        if !timeout {
            parameters.append_pair("connect_timeout", "30");
        }
    }
    // libpq decodes percent escapes but leaves '+' unchanged in URI parameters.
    let query = uri.query().map(|query| query.replace('+', "%20"));
    uri.set_query(query.as_deref());
    uri
}

fn capture_blocking(
    source: &PostgresSource,
    credentials: &Credentials,
    target: &Path,
    limits: CaptureLimits,
) -> Result<SourceCapture, Report<SourceError>> {
    let partial = SourceCapture::stage(target).map_err(|_error| Report::new(SourceError::Write))?;
    let mut config = Config::default()
        .with("allow_community_extensions", "false")
        .map_err(|_error| Report::new(SourceError::Configuration))?;
    for (name, value) in [
        ("memory_limit", limits.memory_limit.map(ByteSize::setting)),
        (
            "max_temp_directory_size",
            limits.temp_directory_limit.map(ByteSize::setting),
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
    let connection = Connection::open_in_memory_with_flags(config)
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    connection
        .execute_batch(
            "
                INSTALL postgres;
                LOAD postgres;
                ",
        )
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    connection
        .execute_batch(&format!(
            "
                ATTACH {} AS _capture (
                    TYPE postgres,
                    READ_ONLY
                )
                ",
            literal(connection_uri(source, credentials).as_str())
        ))
        .map_err(|_error| Report::new(SourceError::Postgres))?;
    let path = partial
        .path()
        .to_str()
        .ok_or_else(|| Report::new(SourceError::Write))?;
    connection
        .execute_batch(&format!(
            "
                COPY (
                    SELECT *
                    FROM _capture.{}.{}
                ) TO {} (
                    FORMAT PARQUET,
                    COMPRESSION SNAPPY
                )
                ",
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
    use alloc::collections::BTreeMap;

    use duckdb::types::Value;
    use hash_integrations_definition::PostgresSource;
    use hash_secret::Secret;
    use rstest::rstest;
    use serde_json::json;
    use tempfile::TempDir;
    use testcontainers::{ImageExt as _, runners::AsyncRunner as _};
    use testcontainers_modules::postgres::Postgres;
    use uuid::Uuid;

    use super::{Credentials, capture, connection_uri};
    use crate::{CaptureLimits, Workspace, WorkspaceConfig};

    fn source() -> PostgresSource {
        serde_json::from_value(json!({
            "connection": "postgresql://localhost/postgres?sslmode=disable",
            "schema": "public",
            "table": "capture_fixture",
            "credentials": {
                "secretEntityUuid": Uuid::new_v4(),
            },
        }))
        .expect("should describe the fixture source")
    }

    #[test]
    fn connection_uri_credentials() {
        let mut source = source();
        source.connection = "postgresql://localhost/sales%20%2F%252F%3F%26%3D%C3%A9?\
                             application_name=sync+reader&sslmode=disable"
            .parse()
            .expect("should parse the connection URI");
        let value = connection_uri(
            &source,
            &Credentials {
                username: Secret::from_string("reader @%40+".to_owned()),
                password: Secret::from_string("pa'ss\\word :/@?&=+#%20\u{e9}".to_owned()),
            },
        );
        assert_eq!(
            value.as_str(),
            "postgresql://localhost/sales%20%2F%252F%3F%26%3D%C3%A9?application_name=sync%\
             2Breader&sslmode=disable&user=reader%20%40%2540%2B&password=pa%27ss%5Cword%20%3A%2F%\
             40%3F%26%3D%2B%23%2520%C3%A9&connect_timeout=30",
            "URI parameters should preserve spaces, literal percent escapes and reserved \
             characters"
        );
    }

    #[rstest]
    #[case::ipv6("postgresql://[::1]/postgres")]
    #[case::unix_socket("postgresql:///postgres?host=%2Fvar%2Frun%2Fpostgresql")]
    #[case::multiple_hosts("postgresql:///postgres?host=primary.example%2Creplica.example")]
    fn connection_uri_hosts(#[case] connection: &str) {
        let mut source = source();
        source.connection = connection.parse().expect("should parse the connection URI");
        let value = connection_uri(
            &source,
            &Credentials {
                username: Secret::from_string("reader".to_owned()),
                password: Secret::from_string("password".to_owned()),
            },
        );
        assert!(
            value.as_str().starts_with(connection),
            "the configured host should be preserved"
        );
    }

    #[rstest]
    #[case::defaults(None, "verify-full", "30")]
    #[case::configured(Some("sslmode=require&connect_timeout=5"), "require", "5")]
    fn connection_uri_defaults(
        #[case] query: Option<&str>,
        #[case] ssl_mode: &str,
        #[case] timeout: &str,
    ) {
        let credentials = Credentials {
            username: Secret::from_string("reader".to_owned()),
            password: Secret::from_string("password".to_owned()),
        };
        let mut source = source();
        source.connection.set_query(query);
        let uri = connection_uri(&source, &credentials);
        let parameters: BTreeMap<_, _> = uri.query_pairs().collect();
        assert_eq!(
            parameters,
            BTreeMap::from([
                ("user".into(), "reader".into()),
                ("password".into(), "password".into()),
                ("sslmode".into(), ssl_mode.into()),
                ("connect_timeout".into(), timeout.into()),
            ]),
            "credentials and connection options should be supplied independently of parameter \
             order"
        );
    }

    #[tokio::test]
    async fn capture_postgres_table() {
        let postgres = Postgres::default()
            .with_init_sql(
                b"
                    CREATE TABLE capture_fixture (
                        id INTEGER PRIMARY KEY,
                        label TEXT,
                        amount NUMERIC(12, 2)
                    );
                    INSERT INTO capture_fixture (id, label, amount)
                    VALUES
                        (1, 'first', 12.30),
                        (2, NULL, NULL);
                    "
                .to_vec(),
            )
            .with_tag("18-alpine")
            .start()
            .await
            .expect("the PostgreSQL fixture should start");
        let host = postgres
            .get_host()
            .await
            .expect("the PostgreSQL host should resolve");
        let port = postgres
            .get_host_port_ipv4(5432)
            .await
            .expect("the PostgreSQL port should be mapped");
        let mut source = source();
        source
            .connection
            .set_host(Some(&host.to_string()))
            .expect("the PostgreSQL host should be valid");
        source
            .connection
            .set_port(Some(port))
            .expect("the PostgreSQL port should be valid");
        let expected = [
            vec![
                Value::Int(1),
                Value::Text("first".to_owned()),
                Value::Text("12.30".to_owned()),
            ],
            vec![Value::Int(2), Value::Null, Value::Null],
        ];
        let directory = TempDir::new().expect("should create output storage");
        let secret = Secret::from_vec(
            serde_json::to_vec(&json!({"username": "postgres", "password": "postgres"}))
                .expect("should serialize fixture credentials"),
        );
        let capture = capture(
            &source,
            &secret,
            directory.path().join("source.parquet"),
            CaptureLimits::default(),
        )
        .await
        .expect("should capture the PostgreSQL fixture");
        assert_eq!(
            capture.rows(),
            u64::try_from(expected.len()).expect("the fixture row count should fit in u64"),
            "should capture every fixture row"
        );
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
            .query(
                "
                    SELECT id, label, amount::VARCHAR
                    FROM raw
                    ORDER BY id
                    "
                .into(),
            )
            .await
            .expect("should read PostgreSQL values");
        assert_eq!(
            rows.iter().collect::<Vec<_>>(),
            expected.iter().map(Vec::as_slice).collect::<Vec<_>>(),
            "all fixture values, including decimals and SQL nulls, should survive capture and \
             loading"
        );
        workspace.close().await.expect("should close the workspace");
    }
}

#[cfg(test)]
mod credential_tests {
    use hash_secret::Secret;
    use rstest::rstest;
    use serde_json::{Value, json};
    use tempfile::TempDir;
    use uuid::Uuid;

    use super::capture;
    use crate::{CaptureLimits, SourceError};

    #[rstest]
    #[case::invalid_password_type(json!({
        "username": "sensitive-user",
        "password": 987_654_321,
    }))]
    #[case::unknown_field(json!({
        "username": "sensitive-user",
        "password": "sensitive-password",
        "extra-sensitive-field": "extra-sensitive-value",
    }))]
    #[tokio::test]
    async fn credentials_redact_malformed_values(#[case] value: Value) {
        let source = serde_json::from_value(json!({
            "connection": "postgresql://unavailable.invalid/db",
            "schema": "public",
            "table": "items",
            "credentials": {
                "secretEntityUuid": Uuid::new_v4(),
            },
        }))
        .expect("should describe a source");
        let directory = TempDir::new().expect("should create output storage");
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
            "extra-sensitive-value",
            "987654321",
        ] {
            assert!(
                !diagnostic.contains(sentinel),
                "should omit credential values and field names from diagnostics"
            );
        }
    }
}
