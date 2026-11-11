use core::future::ready;
#[cfg(unix)]
use std::os::unix::fs::symlink;
use std::{fs, path::Path};

use axum::Router;
use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{Definition, SecretReference};
use reqwest::{
    Client, Url,
    dns::{Addrs, Name, Resolve, Resolving},
    redirect::Policy,
};
use rstest::rstest;
use tempfile::TempDir;
use tokio::{net::TcpListener, task::JoinHandle};
use uuid::Uuid;

use super::{
    CaptureLimits, CaptureRun, CaptureStore, SecretStore, SecretValue, SourceError, SourceReader,
    fingerprint,
};
use crate::{
    ArtifactNamespace, ArtifactStorage, Format, Workspace, WorkspaceConfig,
    storage::tests::{minio, s3_storage},
};

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

/// Resolves names without the public destination policy, for fixtures on the local machine.
pub(super) struct AnyResolver;

impl Resolve for AnyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let addresses = tokio::net::lookup_host((name.as_str().to_owned(), 0)).await?;
            Ok(Box::new(addresses) as Addrs)
        })
    }
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
    reader_with(
        directory,
        ArtifactStorage::local(&directory.join("captures"))
            .expect("should create local capture storage"),
    )
}

fn reader_with(directory: &Path, captures: ArtifactStorage) -> SourceReader {
    let local = directory.join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    SourceReader::new(
        CaptureStore::new(&local, captures).expect("should open capture storage"),
        CaptureLimits::default(),
    )
}

async fn open_workspace(directory: &Path, name: &str) -> Workspace {
    Workspace::open(directory.join(name), WorkspaceConfig::default())
        .await
        .expect("should open a workspace")
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn capture_retry_and_restore(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create source storage");
    let minio = if s3 { Some(minio().await) } else { None };
    let captures = || match &minio {
        Some((_, port)) => s3_storage(*port, directory.path()),
        None => ArtifactStorage::local(&directory.path().join("captures"))
            .expect("should create local capture storage"),
    };
    let run = run();
    let definition = remote_definition();
    // An earlier attempt of the run captured the remote source, which is unreachable now.
    let (name, source) = definition
        .sources()
        .iter()
        .next()
        .expect("should define a source");
    let key = ArtifactNamespace::new(run.web, definition.connector()).capture(
        run.id,
        name,
        &fingerprint(source),
    );
    let earlier = captures();
    let staging = earlier
        .stage()
        .expect("should create the earlier run's staging");
    let workspace = open_workspace(directory.path(), "run.duckdb").await;
    let capture = workspace
        .capture(
            "SELECT 7 AS id, 'initial' AS value".into(),
            ArtifactStorage::staging_file(staging.path(), Format::Parquet),
        )
        .await
        .expect("should publish the earlier capture");
    let artifact = earlier
        .publish(
            &ArtifactNamespace::new(run.web, definition.connector()).artifacts(),
            capture.path(),
            Format::Parquet,
        )
        .await
        .expect("should store the earlier capture");
    let _bound = earlier
        .bind(&key, &artifact)
        .await
        .expect("should bind the earlier capture to the run");
    workspace
        .close()
        .await
        .expect("should close the first workspace");

    let restored = open_workspace(directory.path(), "restored.duckdb").await;
    let reader = reader_with(directory.path(), captures());
    let captures = reader
        .capture_sources(&restored, &definition, run, &NoSecrets)
        .await
        .expect("should reuse a capture without contacting the source or secret store");
    drop(reader);
    let tables = SourceReader::stage_sources(&restored, &definition, &captures)
        .await
        .expect("should stage a restored capture after its reader is dropped");
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

#[tokio::test]
async fn concurrent_attempt_conflicts_with_the_stored_capture() {
    let directory = TempDir::new().expect("should create source storage");
    let run = run();
    let (first_workspace, second_workspace) = (
        open_workspace(directory.path(), "first.duckdb").await,
        open_workspace(directory.path(), "second.duckdb").await,
    );
    let (first_reader, second_reader) = (reader(directory.path()), reader(directory.path()));
    let definition = sql_definition();

    // Each attempt yields while its workspace captures the source, so both find no stored capture
    // before either stores its own.
    let (first, second) = tokio::join!(
        first_reader.capture_sources(&first_workspace, &definition, run, &NoSecrets),
        second_reader.capture_sources(&second_workspace, &definition, run, &NoSecrets),
    );
    let conflicts = [&first, &second]
        .into_iter()
        .filter(|result| {
            result
                .as_ref()
                .is_err_and(|error| matches!(error.current_context(), SourceError::Conflict))
        })
        .count();
    assert!(
        first.is_ok() != second.is_ok() && conflicts == 1,
        "one attempt should store its capture and the other should fail with a conflict"
    );
    first_workspace
        .close()
        .await
        .expect("should close the workspace");
    second_workspace
        .close()
        .await
        .expect("should close the workspace");
}

#[rstest]
#[case::different_web(|run: CaptureRun| CaptureRun { web: Uuid::new_v4(), ..run })]
#[case::different_run(|run: CaptureRun| CaptureRun { id: Uuid::new_v4(), ..run })]
#[case::changed_definition(|run: CaptureRun| run)]
#[tokio::test]
async fn capture_isolation(#[case] change_identity: fn(CaptureRun) -> CaptureRun) {
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
        .expect_err("another web, run or definition should not recover this capture");
    assert!(
        matches!(error.current_context(), SourceError::Secret),
        "should capture the live source again, resolving its credentials"
    );
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[case::same(".")]
#[case::captures_in_local("captures")]
#[case::local_in_captures("..")]
fn overlapping_roots(#[case] captures: &str) {
    let directory = TempDir::new().expect("should create the directory");
    let local = directory.path().join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    let error = CaptureStore::new(
        &local,
        ArtifactStorage::local(&local.join(captures)).expect("should create local capture storage"),
    )
    .expect_err("should keep captures outside the local source root");
    assert!(
        matches!(error.current_context(), SourceError::Configuration),
        "overlapping roots should be rejected as invalid configuration"
    );
}

#[rstest]
#[case::parent_traversal("../source.parquet")]
#[case::absolute_path("/etc/passwd")]
#[case::empty_path("")]
fn local_root_invalid_key(#[case] key: &str) {
    let directory = TempDir::new().expect("should create the directory");
    let captures = TempDir::new().expect("should create the capture directory");
    let store = CaptureStore::new(
        directory.path(),
        ArtifactStorage::local(captures.path()).expect("should create local capture storage"),
    )
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
    let captures = TempDir::new().expect("should create the capture directory");
    let store = CaptureStore::new(
        directory.path(),
        ArtifactStorage::local(captures.path()).expect("should create local capture storage"),
    )
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
