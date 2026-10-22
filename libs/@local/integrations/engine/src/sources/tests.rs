use axum::Router;
use error_stack::Report;
use hash_integrations_definition::{Definition, SecretReference};
use reqwest::{Client, Url, redirect::Policy};
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
        core::future::ready(Err(Report::new(SourceError::Secret)))
    }
}

#[tokio::test]
async fn capture_retry_and_restore() {
    let directory = TempDir::new().expect("should create source storage");
    let definition = Definition::from_yaml(
        "connector: test\nsources:\n  items:\n    sql: SELECT 7 AS id, 'initial' AS value\n    \
         primaryKey: [id]\npipelines:\n  entities:\n    - source: items\n      steps: []\n",
    )
    .expect("should parse a source");
    let run = CaptureRun {
        web: Uuid::new_v4(),
        actor: Uuid::new_v4(),
        id: Uuid::new_v4(),
    };
    let workspace = Workspace::open(
        directory.path().join("run.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("should open a workspace");
    let reader = SourceReader::new(
        CaptureStore::new(directory.path(), &directory.path().join("captures"))
            .expect("should open capture storage"),
        CaptureLimits::default(),
    );
    let first = reader
        .capture_sources(&workspace, &definition, run, &NoSecrets)
        .await
        .expect("should capture SQL");
    assert_eq!(first.len(), 1, "should capture one source");
    let definition = Definition::from_yaml(&format!("connector: test\nsources:\n  items:\n    rest:\n      url: https://unavailable.invalid\n      auth:\n        type: bearer\n        secretEntityUuid: {}\n    primaryKey: [id]\npipelines:\n  entities:\n    - source: items\n      steps: []\n", Uuid::new_v4())).expect("should parse a remote source");
    for other in [
        CaptureRun {
            web: Uuid::new_v4(),
            ..run
        },
        CaptureRun {
            id: Uuid::new_v4(),
            ..run
        },
    ] {
        let error = reader
            .capture_sources(&workspace, &definition, other, &NoSecrets)
            .await
            .expect_err("another web or run should not recover this capture");
        assert!(
            matches!(error.current_context(), SourceError::Secret),
            "a new identity should resolve the live source credentials"
        );
    }
    workspace
        .close()
        .await
        .expect("should close the first workspace");
    let restored = Workspace::open(
        directory.path().join("restored.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("should open the restored workspace");
    let captures = reader
        .capture_sources(&restored, &definition, run, &NoSecrets)
        .await
        .expect("should reuse a capture without contacting the source or secret store");
    let tables = SourceReader::stage_sources(&restored, &definition, &captures)
        .await
        .expect("should stage a restored capture");
    assert_eq!(tables.len(), 1, "should stage one source");
    let rows = restored
        .query("SELECT id, value, _op, _key FROM \"_source/items\"".into())
        .await
        .expect("should query the restored rows");
    assert_eq!(rows.iter().len(), 1, "should preserve the captured row");
    assert_eq!(
        rows.iter()
            .next()
            .expect("should have one row")
            .get(1)
            .expect("should have a value")
            .clone(),
        duckdb::types::Value::Text("initial".to_owned()),
        "should preserve the original value"
    );
    restored
        .close()
        .await
        .expect("should close the restored workspace");
}

#[test]
fn local_root_traversal_and_symlink() {
    let directory = TempDir::new().expect("should create the directory");
    let outside = TempDir::new().expect("should create the outside directory");
    std::fs::write(outside.path().join("source.parquet"), b"outside")
        .expect("should write a source");
    let store = CaptureStore::new(directory.path(), &directory.path().join("captures"))
        .expect("should open storage");
    for key in ["../source.parquet", "/etc/passwd", ""] {
        assert!(
            store.local_file(key).is_err(),
            "should reject a key outside the local root"
        );
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside.path(), directory.path().join("escape"))
            .expect("should create the test symlink");
        assert!(
            store.local_file("escape/source.parquet").is_err(),
            "should reject a symlink escaping the local root"
        );
    }
}
