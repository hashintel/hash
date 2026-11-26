use alloc::{collections::BTreeSet, sync::Arc};
use core::str::FromStr as _;
use std::{
    fs::File,
    path::Path,
    sync::{Mutex, MutexGuard},
};

use arrow_array::{ArrayRef, Int64Array, RecordBatch};
use axum::{
    Router,
    extract::State,
    http::{Method, StatusCode},
    routing::any,
};
use hash_crypto::Secret;
use hash_integrations_definition::Definition;
use parquet::arrow::ArrowWriter;
use serde_json::Value;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use time::OffsetDateTime;
use tokio::net::TcpListener;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use url::Url;
use uuid::Uuid;

use crate::{GraphClient, IntegrationNamespace, RunId, S3Bucket, StartInput, Storage, start};

/// The example definition of the `aviation` connector.
pub(crate) const AVIATION: &str = include_str!("../../definition/examples/aviation.yaml");

/// Starts `run` of the `aviation` example in `storage`.
pub(crate) async fn started(storage: &Storage, run: RunId) {
    started_with(storage, run, AVIATION).await;
}

/// Starts `run` of the definition `yaml` in `storage`.
pub(crate) async fn started_with(storage: &Storage, run: RunId, yaml: &str) {
    let definition = Definition::from_yaml(yaml).expect("should be a valid definition");
    start(storage, &definition, start_input(run, yaml))
        .await
        .expect("should start the run");
}

/// What `run` of the definition `yaml` is started with, in a fixed web and as a fixed actor.
pub(crate) fn start_input(run: RunId, yaml: &str) -> StartInput {
    StartInput {
        run,
        web: WebId::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0001)),
        actor: ActorEntityUuid::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0002)),
        definition: yaml.into(),
        id_namespace: None,
        submitted_at: OffsetDateTime::UNIX_EPOCH,
    }
}

/// Writes a Parquet file at `path` with one row per id, in the column `id`.
pub(crate) fn parquet(path: &Path, ids: &[i64]) {
    let ids: ArrayRef = Arc::new(Int64Array::from(ids.to_vec()));
    let batch = RecordBatch::try_from_iter([("id", ids)]).expect("should build the rows");
    let file = File::create(path).expect("should create the Parquet file");
    let mut writer =
        ArrowWriter::try_new(file, batch.schema(), None).expect("should open the Parquet writer");
    writer.write(&batch).expect("should write the rows");
    writer.close().expect("should finish the Parquet file");
}

/// Starts MinIO with an empty `captures` bucket and returns it with its API port.
pub(crate) async fn minio() -> (ContainerAsync<MinIO>, u16) {
    let minio = MinIO::default()
        .with_name("ghcr.io/hashdeps/minio")
        .with_tag("RELEASE.2025-09-07T16-13-09Z")
        .start()
        .await
        .expect("the MinIO fixture should start");
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
        .expect("should create the bucket");
    let port = minio
        .get_host_port_ipv4(9000)
        .await
        .expect("the MinIO port should be mapped");
    (minio, port)
}

/// The namespace of the `aviation` connector in a fixed web.
pub(crate) fn namespace() -> IntegrationNamespace {
    IntegrationNamespace::new(
        Uuid::from_u128(1),
        &"aviation".parse().expect("should be a connector ID"),
    )
}

pub(crate) fn bucket(port: u16) -> S3Bucket {
    S3Bucket {
        uri: "s3://captures".into(),
        region: "us-east-1".into(),
        endpoint: Some(format!("localhost:{port}").into()),
        use_ssl: false,
        key_id: "minioadmin".into(),
        secret: Secret::from_vec(b"minioadmin".to_vec()),
    }
}

/// A request the Graph answered: its method, whether it was a bulk request, and the UUIDs of the
/// entities its bodies name.
pub(crate) type Received = (Method, bool, Vec<u128>);

#[derive(Debug, Default)]
pub(crate) struct Entities {
    pub held: BTreeSet<u128>,
    pub refused: BTreeSet<u128>,
    /// How many more requests the Graph answers before it answers every request with 503.
    pub answers_left: Option<usize>,
    pub received: Vec<Received>,
}

impl Entities {
    /// Answers a request of `method` for `entities`, and applies it if the Graph accepts it.
    fn answer(&mut self, method: &Method, bulk: bool, entities: Vec<u128>) -> (StatusCode, String) {
        match &mut self.answers_left {
            Some(0) => return (StatusCode::SERVICE_UNAVAILABLE, String::new()),
            Some(left) => *left -= 1,
            None => {}
        }
        self.received.push((method.clone(), bulk, entities.clone()));
        if let Some(entity) = entities.iter().find(|entity| self.refused.contains(entity)) {
            return (StatusCode::BAD_REQUEST, format!("refused {entity}"));
        }
        let conflict = if *method == Method::POST {
            entities
                .iter()
                .any(|entity| self.held.contains(entity))
                .then_some(StatusCode::CONFLICT)
        } else {
            entities
                .iter()
                .any(|entity| !self.held.contains(entity))
                .then_some(StatusCode::NOT_FOUND)
        };
        if let Some(status) = conflict {
            return (status, String::new());
        }
        self.held.extend(entities);
        (StatusCode::OK, String::new())
    }
}

/// The Graph's entity API as far as Send uses it. It applies or refuses a bulk request as a
/// whole: 400 if a body names a refused entity, 409 for a create of an entity it holds, 404 for a
/// patch of one it does not hold.
#[derive(Debug, Clone, Default)]
pub(crate) struct Graph(Arc<Mutex<Entities>>);

impl Graph {
    pub(crate) fn holding(held: &[u128]) -> Self {
        let graph = Self::default();
        graph.lock().held.extend(held);
        graph
    }

    pub(crate) fn lock(&self) -> MutexGuard<'_, Entities> {
        self.0.lock().expect("should not be poisoned")
    }

    pub(crate) fn received(&self) -> Vec<Received> {
        core::mem::take(&mut self.lock().received)
    }

    pub(crate) async fn serve(&self) -> GraphClient {
        let router = Router::new()
            .route("/entities", any(answer::<false>))
            .route("/entities/bulk", any(answer::<true>))
            .with_state(self.clone());
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("should bind the test Graph");
        let address = listener.local_addr().expect("should get the address");
        tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("should serve the test Graph");
        });
        GraphClient::new(
            &Url::parse(&format!("http://{address}/")).expect("should be a valid URL"),
            &Secret::from_string("service-secret".to_owned()),
        )
        .expect("should configure the client")
    }
}

async fn answer<const BULK: bool>(
    State(graph): State<Graph>,
    method: Method,
    body: String,
) -> (StatusCode, String) {
    let body = serde_json::from_str::<Value>(&body).expect("the body should be JSON");
    let bodies = if BULK {
        body.as_array()
            .expect("a bulk body should be a list")
            .clone()
    } else {
        vec![body]
    };
    let entities = bodies.iter().map(entity_of).collect::<Vec<_>>();
    graph.lock().answer(&method, BULK, entities)
}

/// The UUID of the entity a body names: `entityUuid` in a create, `entityId` in a patch.
fn entity_of(body: &Value) -> u128 {
    let uuid = match (body["entityUuid"].as_str(), body["entityId"].as_str()) {
        (Some(uuid), _) => uuid,
        (None, Some(entity_id)) => entity_id
            .rsplit_once('~')
            .map(|(_, uuid)| uuid)
            .expect("an entity id should hold a `~`"),
        (None, None) => panic!("a body should name its entity"),
    };
    Uuid::from_str(uuid).expect("should be a UUID").as_u128()
}
