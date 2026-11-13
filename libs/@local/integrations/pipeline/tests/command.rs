//! Exercise the binary's resource wiring, durable replay, and operator-facing outcomes.

extern crate alloc;

use alloc::sync::Arc;
use std::{
    fs,
    path::PathBuf,
    process::{Command, Output},
    sync::Mutex,
};

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, Method, StatusCode},
    routing::any,
};
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::service_credential,
};
use serde_json::{Value, json};
use similar_asserts::assert_eq;
use tempfile::TempDir;
use testcontainers::{
    ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use tokio::net::TcpListener;
use uuid::{Uuid, uuid};

const WEB: &str = "00000000-0000-4000-8000-000000000001";
const ACTOR: &str = "00000000-0000-4000-8000-000000000002";
const FIRST: Uuid = uuid!("00000000-0000-4000-8000-0000000000a1");
const SECOND: Uuid = uuid!("00000000-0000-4000-8000-0000000000a2");
const THIRD: Uuid = uuid!("00000000-0000-4000-8000-0000000000a3");
const FOURTH: Uuid = uuid!("00000000-0000-4000-8000-0000000000a4");
const DEFINITION: &str = include_str!("fixtures/aviation.yaml");

struct Fixture {
    _directory: TempDir,
    local: PathBuf,
    storage: PathBuf,
    scratch: PathBuf,
    definition: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let directory = TempDir::new().expect("should create fixture directory");
        let local = directory.path().join("local");
        let scratch = directory.path().join("scratch");
        let storage = directory.path().join("artifacts");
        let definition = directory.path().join("definition.yaml");
        fs::create_dir_all(&local).expect("should create local sources");
        fs::create_dir_all(&scratch).expect("should create scratch parent");
        fs::write(&definition, DEFINITION).expect("should write independent scenario definition");
        Self {
            _directory: directory,
            local,
            storage,
            scratch,
            definition,
        }
    }

    fn command(&self, graph: &str, run: Option<Uuid>) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_hash-integrations-pipeline"));
        command
            .env_remove("HASH_INTEGRATIONS_S3_SECRET_ACCESS_KEY")
            .env("HASH_GRAPH_SERVICE_SECRET", "cli-service-credential")
            .env("HASH_INTEGRATIONS_VAULT_TOKEN", "cli-vault-credential")
            .args([
                "run",
                "--web",
                WEB,
                "--actor",
                ACTOR,
                "--connector",
                "aviation",
            ])
            .arg("--local-sources")
            .arg(&self.local)
            .arg("--scratch-dir")
            .arg(&self.scratch)
            .args([
                "--graph-url",
                graph,
                "--vault-url",
                "http://127.0.0.1:9",
                "--vault-mount",
                "integrations",
            ]);
        if let Some(run) = run {
            command.arg("--run-id").arg(run.to_string());
        }
        command
    }

    fn local(&self, graph: &str, run: Option<Uuid>) -> Command {
        let mut command = self.command(graph, run);
        command.arg("--storage-dir").arg(&self.storage);
        command
    }

    fn apply(&self, command: &mut Command) {
        command
            .args(["apply", "--namespace", "aviation", "--definition"])
            .arg(&self.definition);
    }

    fn scratch_empty(&self) {
        assert_eq!(
            fs::read_dir(&self.scratch)
                .expect("should inspect scratch")
                .count(),
            0,
            "should delete each process's temporary directory on success or failure"
        );
    }
}

#[derive(Debug)]
struct Request {
    method: Method,
    body: Value,
    actor: String,
    credential: String,
}

struct Endpoint {
    status: StatusCode,
    requests: Vec<Request>,
}

struct Graph {
    url: String,
    state: Arc<Mutex<Endpoint>>,
    task: tokio::task::JoinHandle<()>,
}

impl Graph {
    async fn new(status: StatusCode) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("should bind Graph fixture");
        let url = format!(
            "http://{}",
            listener.local_addr().expect("should read address")
        );
        let state = Arc::new(Mutex::new(Endpoint {
            status,
            requests: Vec::new(),
        }));
        let router = Router::new()
            .route("/entities/bulk", any(record))
            .with_state(Arc::clone(&state));
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("should serve Graph fixture");
        });
        Self { url, state, task }
    }

    fn count(&self) -> usize {
        self.state
            .lock()
            .expect("should lock requests")
            .requests
            .len()
    }

    fn answer(&self, status: StatusCode) {
        self.state.lock().expect("should lock status").status = status;
    }
}

impl Drop for Graph {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn record(
    State(state): State<Arc<Mutex<Endpoint>>>,
    method: Method,
    headers: HeaderMap,
    body: String,
) -> (StatusCode, &'static str) {
    let mut state = state.lock().expect("should lock received request");
    state.requests.push(Request {
        method,
        body: serde_json::from_str(&body).expect("should receive planned JSON"),
        actor: headers
            .get(ACTOR_ID_HEADER)
            .expect("should send actor")
            .to_str()
            .expect("should encode actor")
            .to_owned(),
        credential: service_credential(&headers)
            .expect("should authenticate service")
            .to_owned(),
    });
    (state.status, "private-graph-response")
}

async fn execute(mut command: Command) -> Output {
    tokio::task::spawn_blocking(move || command.output().expect("should execute the local runner"))
        .await
        .expect("should join the local runner")
}

fn succeeded(output: &Output, run: Uuid, counts: &Value) -> Value {
    assert_eq!(
        output.status.code(),
        Some(0),
        "should commit: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&output.stderr),
        format!("run {run}\n"),
        "should print only the run identity on success"
    );
    assert_eq!(
        output
            .stdout
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .count(),
        1,
        "should emit exactly one JSON record"
    );
    let result: Value =
        serde_json::from_slice(&output.stdout).expect("should encode completion JSON");
    assert_eq!(
        result.get("run"),
        Some(&json!(run)),
        "should report the chosen run"
    );
    assert_eq!(
        result.pointer("/output/counts"),
        Some(counts),
        "should report actual delivery outcomes"
    );
    result
}

fn created() -> Value {
    json!({"created": 6, "patched": 0, "archived": 0, "absent": 0, "rejected": 0})
}

#[tokio::test]
async fn local_replay_and_request_mismatch() {
    let fixture = Fixture::new();
    let graph = Graph::new(StatusCode::OK).await;
    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    let initial = execute(command).await;
    let result = succeeded(&initial, FIRST, &created());
    assert_eq!(
        result["output"]["rejected"],
        Value::Null,
        "should have no rejected artifact"
    );
    {
        let state = graph.state.lock().expect("should inspect Graph calls");
        assert_eq!(
            state.requests.len(),
            2,
            "should send entities before links in two batches"
        );
        let lengths: Vec<_> = state
            .requests
            .iter()
            .map(|request| request.body.as_array().expect("should send arrays").len())
            .collect();
        assert_eq!(
            lengths,
            [4, 2],
            "should send independent S1 entity/link counts"
        );
        assert!(
            state
                .requests
                .iter()
                .all(|request| request.method == Method::POST
                    && request.actor == ACTOR
                    && request.credential == "cli-service-credential"),
            "should pass command actor and service credentials to Graph"
        );
        drop(state);
    }
    fixture.scratch_empty();

    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    let replay = execute(command).await;
    succeeded(&replay, FIRST, &created());
    assert_eq!(
        replay.stdout, initial.stdout,
        "should return the durable marker's exact output"
    );
    assert_eq!(graph.count(), 2, "should replay without Graph requests");
    fixture.scratch_empty();

    fs::write(
        &fixture.definition,
        format!("{DEFINITION}\n# changed request\n"),
    )
    .expect("should change request text");
    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    let changed = execute(command).await;
    assert_eq!(
        changed.status.code(),
        Some(1),
        "should report permanent mismatch"
    );
    assert!(
        changed.stdout.is_empty(),
        "should not report success for another request"
    );
    assert!(
        String::from_utf8_lossy(&changed.stderr).ends_with("failed: permanent request_mismatch\n"),
        "should retain the stage kind and code through command context"
    );
    assert_eq!(
        graph.count(),
        2,
        "should refuse the changed request before delivery"
    );
    fixture.scratch_empty();
}

#[tokio::test]
async fn local_restore_and_reconcile() {
    let fixture = Fixture::new();
    let graph = Graph::new(StatusCode::OK).await;
    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    succeeded(&execute(command).await, FIRST, &created());

    let mut command = fixture.local(&graph.url, Some(SECOND));
    command.args(["restore", "--empty"]);
    succeeded(
        &execute(command).await,
        SECOND,
        &json!({"created":0,"patched":0,"archived":6,"absent":0,"rejected":0}),
    );

    let mut command = fixture.local(&graph.url, Some(THIRD));
    command.args(["restore", "--target"]).arg(FIRST.to_string());
    succeeded(
        &execute(command).await,
        THIRD,
        &json!({"created":0,"patched":6,"archived":0,"absent":0,"rejected":0}),
    );

    let mut command = fixture.local(&graph.url, Some(FOURTH));
    command.arg("reconcile");
    succeeded(
        &execute(command).await,
        FOURTH,
        &json!({"created":0,"patched":6,"archived":0,"absent":0,"rejected":0}),
    );
    assert_eq!(
        graph.count(),
        8,
        "should execute all four operations through the same planned batch path"
    );
    fixture.scratch_empty();
}

#[tokio::test]
async fn local_retry_resumes_checkpoints() {
    let fixture = Fixture::new();
    let graph = Graph::new(StatusCode::SERVICE_UNAVAILABLE).await;
    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    let failed = execute(command).await;
    assert_eq!(
        failed.status.code(),
        Some(3),
        "should report exhausted retryable Graph failure"
    );
    assert!(
        failed.stdout.is_empty(),
        "should not emit a completion record"
    );
    let stderr = String::from_utf8_lossy(&failed.stderr);
    assert!(
        stderr.ends_with("failed: retryable graph_unavailable\n"),
        "should retain retry kind and code"
    );
    assert!(
        !stderr.contains("private-graph-response")
            && !stderr.contains("cli-service-credential")
            && !stderr.contains("cli-vault-credential"),
        "should not print response values or credentials"
    );
    assert_eq!(
        graph.count(),
        5,
        "should apply the configured default attempt count"
    );
    fixture.scratch_empty();

    graph.answer(StatusCode::OK);
    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    succeeded(&execute(command).await, FIRST, &created());
    assert_eq!(
        graph.count(),
        7,
        "should continue the durable plan on a fresh process"
    );
    fixture.scratch_empty();
}

#[tokio::test]
async fn local_rejected_writes_commit() {
    let fixture = Fixture::new();
    let graph = Graph::new(StatusCode::BAD_REQUEST).await;
    let mut command = fixture.local(&graph.url, Some(FIRST));
    fixture.apply(&mut command);
    let result = succeeded(
        &execute(command).await,
        FIRST,
        &json!({"created":0,"patched":0,"archived":0,"absent":0,"rejected":6}),
    );
    assert!(
        result["output"]["rejected"].is_object(),
        "should report a durable rejection artifact"
    );
    assert_eq!(
        graph.count(),
        5,
        "should try bulk and four entities, then skip their two links"
    );
    fixture.scratch_empty();
}

#[tokio::test]
async fn local_setup_failure_cleans_scratch() {
    let fixture = Fixture::new();
    let mut command = fixture.local("ftp://invalid-endpoint", None);
    fixture.apply(&mut command);
    let failed = execute(command).await;
    assert_eq!(
        failed.status.code(),
        Some(2),
        "should distinguish setup failure from stage failure"
    );
    assert!(failed.stdout.is_empty(), "should not emit success JSON");
    let stderr = String::from_utf8_lossy(&failed.stderr);
    let first = stderr
        .lines()
        .next()
        .expect("should emit run ID before setup");
    let run = first
        .strip_prefix("run ")
        .expect("should name the resumable run");
    assert_eq!(
        Uuid::parse_str(run)
            .expect("should print a UUID")
            .get_version_num(),
        4,
        "should create a version-four run ID when omitted"
    );
    assert!(
        stderr.ends_with("failed: setup\n"),
        "should print setup classification"
    );
    assert!(
        !stderr.contains("cli-service-credential") && !stderr.contains("cli-vault-credential"),
        "should not print secret arguments"
    );
    fixture.scratch_empty();
}

#[tokio::test]
async fn s3_replay_after_process_restart() {
    let fixture = Fixture::new();
    fs::write(&fixture.definition, "connector: aviation\n")
        .expect("should write an empty integration");
    let minio = MinIO::default()
        .with_name("ghcr.io/hashdeps/minio")
        .with_tag("RELEASE.2025-09-07T16-13-09Z")
        .start()
        .await
        .expect("should start isolated MinIO");
    minio
        .exec(
            ExecCommand::new([
                "sh",
                "-c",
                "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb \
                 local/captures",
            ])
            .with_cmd_ready_condition(CmdWaitFor::exit_code(0)),
        )
        .await
        .expect("should create bucket");
    let endpoint = format!(
        "127.0.0.1:{}",
        minio
            .get_host_port_ipv4(9000)
            .await
            .expect("should map MinIO port")
    );
    let mut previous: Option<Vec<u8>> = None;
    for _ in 0..2 {
        let mut command = fixture.command("http://127.0.0.1:9", Some(FIRST));
        command
            .env("HASH_INTEGRATIONS_S3_SECRET_ACCESS_KEY", "minioadmin")
            .args([
                "--s3-uri",
                "s3://captures/cli",
                "--s3-region",
                "us-east-1",
                "--s3-endpoint",
                &endpoint,
                "--s3-insecure",
                "--s3-access-key-id",
                "minioadmin",
            ]);
        fixture.apply(&mut command);
        let output = execute(command).await;
        succeeded(
            &output,
            FIRST,
            &json!({"created":0,"patched":0,"archived":0,"absent":0,"rejected":0}),
        );
        if let Some(previous) = previous {
            assert_eq!(
                output.stdout, previous,
                "should recover the same remote checkpoint after scratch deletion"
            );
        }
        previous = Some(output.stdout);
        fixture.scratch_empty();
    }
    assert!(
        !fixture.storage.exists(),
        "should not construct a local artifact backend for S3"
    );
}
