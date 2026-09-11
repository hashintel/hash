//! Test-owned serving roots and PostgreSQL data for route integration.

use alloc::sync::Arc;
use core::{ops::ControlFlow, panic::AssertUnwindSafe, time::Duration};
use std::panic::resume_unwind;

use axum::{Router, http::HeaderMap};
use error_stack::Report;
use futures::FutureExt as _;
use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    principal::PrincipalConstraint,
    store::{PolicyCreationParams, PolicyStore as _},
};
use hash_graph_postgres_store::store::{
    AsClient as _, Context as _, DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType,
    PostgresStorePool, PostgresStoreSettings, Transaction as _,
};
use hash_graph_store::{migration::StoreMigration as _, pool::StorePool as _};
use hash_middleware::{
    authentication::{
        provider::{AuthenticationProvider, Caller},
        request::{AuthenticationError, AuthenticationErrorKind, actor_id_from_header},
    },
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode},
};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;
use type_system::principal::actor::{ActorId, UserId};
use uuid::Uuid;

use crate::{
    cli::{ServeCommand, ServeOptions},
    file::{generation::GenerationRoot, storage::Storage},
    identity::NodeRowId,
    integrity::SecretString,
    serve::{
        tests::fixture::{TamperFixture, secret},
        visibility::cache::VisibilityLimits,
        world::World,
    },
    test_utils::postgres::Database,
};

/// Authentication through the actor header supplied by the test's trusted host.
struct HeaderDelegation;

impl<C: Caller> AuthenticationProvider<C> for HeaderDelegation {
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send {
        core::future::ready(match actor_id_from_header(headers) {
            Ok(actor) => ControlFlow::Break(Ok(C::from_actor(ActorId::User(UserId::new(actor))))),
            Err(error) if *error.kind() == AuthenticationErrorKind::MissingDelegatedActor => {
                ControlFlow::Continue(())
            }
            Err(error) => ControlFlow::Break(Err(Arc::new(Report::new(error)))),
        })
    }
}

/// A router over a synthetic generation and independently seeded store visibility.
pub struct RouteFixture {
    /// The production routing and middleware composition.
    pub router: Router,
    /// The user granted entity visibility in this test's database.
    pub actor: Uuid,
    /// A different user without that grant.
    pub other_actor: Uuid,
    /// The identity of the generation the test published.
    pub generation: String,
    /// Wire ids of the rows seeded in the store.
    pub visible_rows: [u32; 3],
}

/// Creates and migrates the isolated database's connection pool.
///
/// # Panics
///
/// Panics if connecting or running the schema migrations fails.
async fn pool(database: &str) -> Arc<PostgresStorePool> {
    let pool = Arc::new(
        PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "postgres".to_owned(),
                "postgres".to_owned(),
                "localhost".to_owned(),
                5432,
                database.to_owned(),
            ),
            &DatabasePoolConfig {
                max_connections: crate::math::nz!(4),
            },
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("should create the test database pool"),
    );

    pool.acquire(None)
        .await
        .expect("should acquire the migration connection")
        .run_migrations()
        .await
        .expect("should migrate the test database");

    pool
}

/// Creates the users, grants and entity rows read by visibility resolution.
///
/// # Panics
///
/// Panics if seeding the test-owned database fails.
async fn seed(pool: &PostgresStorePool, world: &World, rows: [NodeRowId; 3]) -> (Uuid, Uuid) {
    let mut connection = pool
        .acquire(None)
        .await
        .expect("should acquire the seeding connection");

    let mut store = connection
        .transaction()
        .await
        .expect("should begin fixture seeding");

    store
        .seed_system_policies()
        .await
        .expect("should seed the authorization actions");

    let user = store
        .create_user(None)
        .await
        .expect("should create the visible user");

    let other = store
        .create_user(None)
        .await
        .expect("should create the other user");

    let actor = ActorId::User(user);
    store
        .insert_policies_into_database(&[PolicyCreationParams {
            name: None,
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Actor { actor }),
            actions: vec![ActionName::ViewEntity],
            resource: None,
        }])
        .await
        .expect("should grant visibility to the test user");

    let actor: Uuid = user.into();
    let client = store.as_client();
    for row in rows {
        let key = world.layout.index.identity.keys()[row];
        let web = Uuid::from(*key.web_id);
        let entity = Uuid::from(*key.entity_uuid);
        let edition = Uuid::now_v7();

        client
            .execute("INSERT INTO web (id) VALUES ($1)", &[&web])
            .await
            .expect("should create the test web");
        client
            .execute(
                "INSERT INTO entity_ids (web_id, entity_uuid, provenance, read_only, \
                 created_by_id, created_at_transaction_time, created_at_decision_time) VALUES \
                 ($1, $2, '{}', false, $3, '2020-01-01', '2020-01-01')",
                &[&web, &entity, &actor],
            )
            .await
            .expect("should seed the entity identity");
        client
            .execute(
                "INSERT INTO entity_editions (entity_edition_id, properties, archived, \
                 provenance, created_by_id) VALUES ($1, '{}', false, '{}', $2)",
                &[&edition, &actor],
            )
            .await
            .expect("should seed the entity edition");
        client
            .execute(
                "INSERT INTO entity_temporal_metadata (web_id, entity_uuid, entity_edition_id, \
                 decision_time, transaction_time) VALUES ($1, $2, $3, tstzrange('2020-01-01', \
                 NULL, '[)'), tstzrange('2020-01-01', NULL, '[)'))",
                &[&web, &entity, &edition],
            )
            .await
            .expect("should seed the live entity interval");
    }

    store
        .commit()
        .await
        .expect("should commit the fixture data");

    (actor, other.into())
}

impl RouteFixture {
    /// Runs a case with isolated store data and generation files, then awaits shutdown and cleanup.
    ///
    /// # Panics
    ///
    /// Panics if PostgreSQL, fixture publication or serving setup fails. Resumes a case's panic
    /// after cleanup.
    pub async fn run(case: impl AsyncFnOnce(&Self)) {
        Database::new()
            .await
            .run(async |database| {
                let pool = pool(database).await;

                let files = TamperFixture::publish_scoped(database);
                let world = World::open(files.generation().clone(), &secret())
                    .expect("should open the synthetic generation");

                let rows = [NodeRowId::new(0), NodeRowId::new(1), NodeRowId::new(6)];

                let (actor, other_actor) = seed(&pool, &world, rows).await;
                let root = GenerationRoot::new(
                    files
                        .generation()
                        .path()
                        .parent()
                        .expect("should have a generation root"),
                )
                .expect("should open the serving root");

                root.activate_verified(files.generation().id())
                    .expect("should activate the synthetic generation");

                let scratch = root.scratch().expect("should create input scratch");
                let storage = Storage::new(
                    scratch
                        .directory("inputs")
                        .expect("should create the input directory"),
                );

                let serving = ServeCommand::for_integration(root, secret())
                    .run(ServeOptions {
                        provider: Arc::new(HeaderDelegation),
                        service_secret: SecretString::from("route-test-service-secret"),
                        rate_limit: RateLimitConfig {
                            rate_limit_mode: RateLimitMode::Observe,
                            client_ip_source: ClientIpSource::ConnectInfo,
                            rate_limit_gate_per_second: crate::math::nz!(100),
                            rate_limit_gate_burst: crate::math::nz!(100),
                            rate_limit_anonymous_per_hour: crate::math::nz!(100),
                            rate_limit_anonymous_burst: crate::math::nz!(100),
                            rate_limit_actor_per_hour: crate::math::nz!(1000),
                            rate_limit_actor_burst: crate::math::nz!(1000),
                        },
                        pool: Arc::clone(&pool),
                        storage,
                        workflow: None,
                        visibility: VisibilityLimits {
                            bytes: 1 << 20,
                            soft: Duration::from_secs(30),
                            hard: Duration::from_secs(60),
                        },
                    })
                    .expect("should initialize serving");

                let shutdown = CancellationToken::new();
                let task_shutdown = shutdown.clone();

                let (router, maintenance, download) =
                    serving.into_parts(move || task_shutdown.clone().cancelled_owned());
                assert!(
                    download.is_none(),
                    "should not configure a download task for local route fixtures"
                );

                let maintenance = tokio::spawn(maintenance);
                let fixture = Self {
                    router,
                    actor,
                    other_actor,
                    generation: files.generation().id().to_string(),
                    visible_rows: rows.map(|row| world.layout.index.encode(row).get()),
                };

                let result = Box::pin(AssertUnwindSafe(case(&fixture)).catch_unwind()).await;
                shutdown.cancel();

                let joined = maintenance.await;

                drop(fixture);
                drop(world);
                drop(scratch);
                drop(files);
                drop(pool);

                if let Err(panic) = result {
                    resume_unwind(panic);
                }

                joined.expect("should join generation maintenance");
            })
            .await;
    }
}
