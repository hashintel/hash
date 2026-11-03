use core::future::ready;
#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::symlink;
use std::path::Path;

use axum::Router;
use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{Definition, SecretReference};
use reqwest::{Client, Url, redirect::Policy};
use rstest::rstest;
use tempfile::TempDir;
use tokio::{net::TcpListener, task::JoinHandle};
use uuid::Uuid;

use super::{
    CaptureLimits, CaptureRun, CaptureStore, SecretStore, SecretValue, SourceError, SourceReader,
};
use crate::{Workspace, WorkspaceConfig};

pub(super) struct Server {
    url: String,
    task: JoinHandle<()>,
}

impl Server {
    pub(super) fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub(super) async fn server(router: Router) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind the test server");
    let address = listener.local_addr().expect("should get the test address");
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("should serve test responses");
    });
    Server {
        url: format!("http://{address}"),
        task,
    }
}

pub(super) fn public_client(server: &Server) -> (Client, String) {
    let parsed = Url::parse(&server.url).expect("should parse the test URL");
    let port = parsed.port().expect("should have an explicit port");
    let client = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .resolve("public.test", ([127, 0, 0, 1], port).into())
        .build()
        .expect("should build the test client");
    (client, format!("http://public.test:{port}"))
}

struct NoSecrets;

impl SecretStore for NoSecrets {
    fn read(
        &self,
        _: Uuid,
        _: Uuid,
        _: SecretReference,
    ) -> impl Future<Output = Result<SecretValue, Report<SourceError>>> + Send {
        ready(Err(Report::new(SourceError::Secret)))
    }
}

fn sql_definition() -> Definition {
    Definition::from_yaml(
        "
        connector: test
        sources:
          items:
            sql: |
              SELECT
                7 AS id,
                'initial' AS value
            primaryKey: [id]
        pipelines:
          entities:
            - source: items
              steps: []
        ",
    )
    .expect("should parse a SQL source")
}

fn remote_definition() -> Definition {
    Definition::from_yaml(&format!(
        "
        connector: test
        sources:
          items:
            rest:
              url: \
         https://unavailable.invalid
              auth:
                type: bearer
                secretEntityUuid: {}
            primaryKey: [id]
        pipelines:
          entities:
            - source: items
              steps: []
        ",
        Uuid::new_v4(),
    ))
    .expect("should parse a remote source")
}

fn run() -> CaptureRun {
    CaptureRun {
        web: Uuid::new_v4(),
        actor: Uuid::new_v4(),
        id: Uuid::new_v4(),
    }
}

fn reader(directory: &Path) -> SourceReader {
    SourceReader::new(
        CaptureStore::new(directory, &directory.join("captures"))
            .expect("should open capture storage"),
        CaptureLimits::default(),
    )
}

async fn open_workspace(directory: &Path, name: &str) -> Workspace {
    Workspace::open(directory.join(name), WorkspaceConfig::default())
        .await
        .expect("should open a workspace")
}

#[tokio::test]
async fn capture_retry_and_restore() {
    let directory = TempDir::new().expect("should create source storage");
    let run = run();
    let workspace = open_workspace(directory.path(), "run.duckdb").await;
    let reader = reader(directory.path());
    let first = reader
        .capture_sources(&workspace, &sql_definition(), run, &NoSecrets)
        .await
        .expect("should capture SQL");
    assert_eq!(first.len(), 1, "should capture one source");
    workspace
        .close()
        .await
        .expect("should close the first workspace");

    let restored = open_workspace(directory.path(), "restored.duckdb").await;
    let definition = remote_definition();
    let captures = reader
        .capture_sources(&restored, &definition, run, &NoSecrets)
        .await
        .expect("should reuse a capture without contacting the source or secret store");
    let tables = SourceReader::stage_sources(&restored, &definition, &captures)
        .await
        .expect("should stage a restored capture");
    assert_eq!(tables.len(), 1, "should stage one source");
    let rows = restored
        .query(
            r#"
                SELECT id, value, _op, _key
                FROM "_source/items"
                "#
            .into(),
        )
        .await
        .expect("should query the restored rows");
    let expected = [
        Value::Int(7),
        Value::Text("initial".to_owned()),
        Value::Text("snapshot".to_owned()),
        Value::Text("{\"id\":7}".to_owned()),
    ];
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [expected.as_slice()],
        "the complete captured row and its staging metadata should survive recovery"
    );
    restored
        .close()
        .await
        .expect("should close the restored workspace");
}

#[rstest]
#[case::different_web(|run: CaptureRun| CaptureRun { web: Uuid::new_v4(), ..run })]
#[case::different_run(|run: CaptureRun| CaptureRun { id: Uuid::new_v4(), ..run })]
#[tokio::test]
async fn capture_run_isolation(#[case] change_identity: fn(CaptureRun) -> CaptureRun) {
    let directory = TempDir::new().expect("should create source storage");
    let workspace = open_workspace(directory.path(), "run.duckdb").await;
    let run = run();
    let reader = reader(directory.path());
    reader
        .capture_sources(&workspace, &sql_definition(), run, &NoSecrets)
        .await
        .expect("should capture SQL");
    let error = reader
        .capture_sources(
            &workspace,
            &remote_definition(),
            change_identity(run),
            &NoSecrets,
        )
        .await
        .expect_err("another web or run should not recover this capture");
    assert!(
        matches!(error.current_context(), SourceError::Secret),
        "a new identity should resolve the live source credentials"
    );
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[case::parent_traversal("../source.parquet")]
#[case::absolute_path("/etc/passwd")]
#[case::empty_path("")]
fn local_root_invalid_key(#[case] key: &str) {
    let directory = TempDir::new().expect("should create the directory");
    let store = CaptureStore::new(directory.path(), &directory.path().join("captures"))
        .expect("should open storage");
    let error = store
        .local_file(key)
        .expect_err("should reject an invalid source key");
    assert!(
        matches!(error.current_context(), SourceError::Configuration),
        "invalid source keys should fail validation before accessing the filesystem"
    );
}

#[cfg(unix)]
#[test]
fn local_root_symlink() {
    let directory = TempDir::new().expect("should create the directory");
    let outside = TempDir::new().expect("should create the outside directory");
    fs::write(outside.path().join("source.parquet"), b"outside").expect("should write a source");
    let store = CaptureStore::new(directory.path(), &directory.path().join("captures"))
        .expect("should open storage");
    symlink(outside.path(), directory.path().join("escape"))
        .expect("should create the test symlink");
    let error = store
        .local_file("escape/source.parquet")
        .expect_err("should reject a symlink escaping the local root");
    assert!(
        matches!(error.current_context(), SourceError::Read),
        "the resolved source path should remain inside its configured root"
    );
}
