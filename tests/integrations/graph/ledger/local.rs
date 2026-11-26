//! The pipeline run against the local HASH stack, so that its entities show in the HASH UI.
//!
//! Start the stack with `yarn compose up -d`, `yarn start:graph` and `yarn dev`, then run
//!
//! ```sh
//! cargo nextest run -p hash-integrations-graph-tests --test ledger --run-ignored only
//! ```
//!
//! The entities go to the web of the user named by `HASH_LEDGER_WEB` (`alice` by default), written
//! as that user. The Graph, its database and the bucket are read from the repository's `.env`
//! files, as the stack reads them.

use core::pin::Pin;

use hash_crypto::Secret;
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    },
};
use hash_graph_store::{account::AccountStore as _, pool::StorePool as _};
use hash_integrations_definition::Definition;
use hash_integrations_ledger::{
    GraphClient, IntegrationNamespace, RunId, S3Bucket, StartInput, Storage, capture,
    prepare_incremental, send, start,
};
use time::OffsetDateTime;
use type_system::principal::{
    actor::{ActorEntityUuid, ActorId, UserId},
    actor_group::WebId,
};
use url::Url;

use super::{
    DEFINITION,
    fixtures::{self, OntologyFixture},
    queries,
};

/// Reads `name` from the environment, or `default` if it is not set.
fn var(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}

/// The Graph of the local HASH stack, and its database.
struct LocalGraph {
    pool: PostgresStorePool,
    graph: Url,
    service_secret: Pin<Box<Secret<str>>>,
}

impl LocalGraph {
    /// The Graph as the repository's `.env` files configure it.
    fn from_env() -> Self {
        load_env(Environment::Development);
        let pool = PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                var("HASH_GRAPH_PG_USER", "graph"),
                Secret::from_string(var("HASH_GRAPH_PG_PASSWORD", "graph")),
                var("HASH_GRAPH_PG_HOST", "localhost"),
                var("HASH_GRAPH_PG_PORT", "5432")
                    .parse()
                    .expect("the Postgres port should be a number"),
                var("HASH_GRAPH_PG_DATABASE", "graph"),
            ),
            &DatabasePoolConfig::default(),
            PostgresStoreSettings::default(),
        )
        .expect("the Postgres pool should be configured");
        let graph = Url::parse(&format!(
            "http://{}:{}/",
            var("HASH_GRAPH_HTTP_HOST", "127.0.0.1"),
            var("HASH_GRAPH_HTTP_PORT", "4000")
        ))
        .expect("the Graph URL should be valid");
        Self {
            pool,
            graph,
            service_secret: Secret::from_string(
                std::env::var("HASH_GRAPH_SERVICE_SECRET")
                    .expect("the Graph service secret should be configured"),
            ),
        }
    }

    /// The web of the user with `shortname`, and the user, who writes to it.
    async fn user_web(&self, shortname: &str) -> (ActorId, WebId) {
        let mut store = self
            .pool
            .acquire(None)
            .await
            .expect("a database connection should open");
        let system = store
            .get_or_create_system_machine("h")
            .await
            .expect("the system actor should exist");
        let web = store
            .get_web_by_shortname(system.into(), shortname)
            .await
            .expect("the web should be readable")
            .unwrap_or_else(|| panic!("there should be a user `{shortname}`; sign up first"));
        (ActorId::User(UserId::new(web.id)), web.id)
    }

    /// Adds the aviation types to `web`, owned by it. Types the Graph has already are kept.
    async fn load_ontology(&self, actor: ActorId, web: WebId) {
        let mut store = self
            .pool
            .acquire(None)
            .await
            .expect("a database connection should open");
        // The Graph has the Block Protocol types the aviation types build on.
        fixtures::seed_ontology(&mut store, actor, web, OntologyFixture::aviation()).await;
    }

    fn client(&self) -> GraphClient {
        GraphClient::new(&self.graph, &self.service_secret)
            .expect("the Graph client should be configured")
    }
}

/// The bucket of the local stack's MinIO, as the repository's `.env` files configure it, with the
/// ledger's data under `ledger/`.
fn local_bucket() -> S3Bucket {
    let endpoint = var("AWS_S3_UPLOADS_ENDPOINT", "http://localhost:9000");
    S3Bucket {
        uri: format!(
            "s3://{}/ledger",
            var("AWS_S3_UPLOADS_BUCKET", "dev-hash-bucket")
        )
        .into(),
        region: var("AWS_S3_UPLOADS_REGION", "us-east-1").into(),
        endpoint: Some(
            endpoint
                .strip_prefix("http://")
                .expect("the local MinIO should be reached over HTTP")
                .into(),
        ),
        use_ssl: false,
        key_id: var("AWS_S3_UPLOADS_ACCESS_KEY_ID", "dev-s3-access-key-id").into(),
        secret: Secret::from_vec(
            var(
                "AWS_S3_UPLOADS_SECRET_ACCESS_KEY",
                "dev-s3-secret-access-key",
            )
            .into_bytes(),
        ),
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "writes to the local HASH stack, which must be running"]
async fn csv_to_local_graph() {
    let graph = LocalGraph::from_env();
    let shortname = var("HASH_LEDGER_WEB", "alice");
    let (actor, web) = graph.user_web(&shortname).await;
    graph.load_ontology(actor, web).await;
    let definition = Definition::from_yaml(DEFINITION).expect("the definition should parse");
    let storage = Storage::s3(
        local_bucket(),
        &IntegrationNamespace::new(web.into(), definition.connector()),
    )
    .expect("the bucket should open");
    let run = RunId::new();

    start(
        &storage,
        &definition,
        StartInput {
            run,
            web,
            actor: ActorEntityUuid::from(actor),
            definition: DEFINITION.into(),
            id_namespace: None,
            submitted_at: OffsetDateTime::now_utc(),
        },
    )
    .await
    .expect("the run should start");
    capture(&storage, run, &queries())
        .await
        .expect("the CSV files should be captured");
    prepare_incremental(&storage, run)
        .await
        .expect("the run should be prepared");
    send(&storage, run, &graph.client())
        .await
        .expect("the run should be sent to the Graph");

    println!("run {run} sent to the web of @{shortname}: http://localhost:3000/@{shortname}");
}
