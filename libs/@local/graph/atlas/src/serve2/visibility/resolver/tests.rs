//! Cache reuse and miss eligibility for captured requests.
//!
//! A missing PostgreSQL socket makes attempted store resolution observable as a connection error.

use alloc::sync::Arc;
use core::{
    future::{Future, poll_fn},
    pin::{Pin, pin},
    task::Poll,
    time::Duration,
};
use std::{fs, time::Instant};

use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use serde_json::value::RawValue;
use tokio::time::timeout;
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::ScopeResolver;
use crate::{
    file::{
        generation::{Generation, GenerationRoot},
        repository::Artifact as _,
        salt::artifact,
    },
    math::nz,
    serve2::{
        delta::epoch::Epoch,
        hydrate::visibility::VisibilityProofError,
        runtime::{
            manager::{GenerationManager, ManagerOptions, source::RuntimeSource},
            registry::ObserveError,
        },
        tests::fixture::{TamperFixture, secret},
        visibility::{
            VisibilityActor, VisibilityMask,
            cache::{
                CacheEntry, CacheKey, FilterDigest, PendingCacheEntry, VisibilityCache,
                VisibilityLimits,
            },
        },
        world::World,
    },
};

const POLL_INTERVAL: Duration = Duration::from_millis(5);
const BUDGET: Duration = Duration::from_secs(5);
const RETENTION: Duration = Duration::from_secs(30);
const SHORT_RETENTION: Duration = Duration::from_millis(80);
const LIMITS: VisibilityLimits = VisibilityLimits {
    bytes: u64::MAX,
    soft: Duration::from_secs(30),
    hard: Duration::from_secs(60),
};

fn root_of(files: &TamperFixture) -> GenerationRoot {
    GenerationRoot::new(
        files
            .generation()
            .path()
            .parent()
            .expect("the fixture generation has a root"),
    )
    .expect("the fixture root should open")
}

fn variant_of(files: &TamperFixture, marker: &[u8]) -> Generation {
    files.tamper(&artifact::Representations::NAME, |path| {
        fs::remove_file(path).expect("the staged placeholder should be removable");
        fs::write(path, marker).expect("the variant placeholder should write");
    })
}

async fn pool() -> Arc<PostgresStorePool> {
    Arc::new(
        PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "resolver-test".to_owned(),
                String::new(),
                "/no-resolver-test-postgres".to_owned(),
                5432,
                "resolver-test".to_owned(),
            ),
            &DatabasePoolConfig {
                max_connections: nz!(1),
            },
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("an unconnected pool should construct"),
    )
}

async fn boot(
    name: &str,
    retention: Duration,
) -> (TamperFixture, Arc<PostgresStorePool>, GenerationManager) {
    let files = TamperFixture::publish(name);
    root_of(&files)
        .activate(files.generation().id())
        .expect("the fixture generation should activate");
    let pool = pool().await;
    let source = RuntimeSource {
        root: root_of(&files),
        secret: secret(),
        pool: Arc::clone(&pool),
        feed: None,
    };
    let manager = GenerationManager::new(
        source,
        ManagerOptions {
            poll_interval: POLL_INTERVAL,
            ..
        },
        retention,
    )
    .expect("a non-zero interval should construct a manager");

    (files, pool, manager)
}

// Paused Tokio time can exhaust the timeout while Rayon is still opening a generation.
async fn advance<T>(
    mut running: Pin<&mut impl Future<Output = ()>>,
    mut probe: impl FnMut() -> Option<T>,
) -> T {
    timeout(
        BUDGET,
        poll_fn(|context| {
            assert!(
                running.as_mut().poll(context).is_pending(),
                "the run loop should not finish before its shutdown signal"
            );
            probe().map_or(Poll::Pending, Poll::Ready)
        }),
    )
    .await
    .expect("the maintenance pass should not stall")
}

fn actor_of(id: u128) -> ActorId {
    ActorId::new(Uuid::from_u128(id), ActorType::User)
}

async fn seed_full(
    cache: &VisibilityCache,
    world: Arc<World>,
    epoch: &Epoch,
    now: Instant,
    actor: ActorId,
) -> Arc<CacheEntry> {
    let key = CacheKey::new(epoch, actor, None);
    cache
        .resolve(epoch, key, now, async move |epoch: &Epoch| {
            PendingCacheEntry::new(
                world,
                epoch,
                VisibilityMask::full(
                    epoch,
                    VisibilityActor {
                        id: actor,
                        instance_admin: false,
                    },
                ),
                None,
            )
            .await
        })
        .await
        .expect("seeding an eligible key should not fail")
        .expect("an eligible key should seed an entry")
}

async fn seed_filtered(
    cache: &VisibilityCache,
    world: Arc<World>,
    epoch: &Epoch,
    now: Instant,
    actor: ActorId,
    digest: FilterDigest,
    document: Arc<RawValue>,
) -> Arc<CacheEntry> {
    let key = CacheKey::new(epoch, actor, Some(digest));
    cache
        .resolve(epoch, key, now, async move |epoch: &Epoch| {
            PendingCacheEntry::new(
                world,
                epoch,
                VisibilityMask::full(
                    epoch,
                    VisibilityActor {
                        id: actor,
                        instance_admin: false,
                    },
                ),
                Some(document),
            )
            .await
        })
        .await
        .expect("seeding an eligible key should not fail")
        .expect("an eligible key should seed an entry")
}

#[tokio::test]
async fn resolve_fresh_unfiltered_hit() {
    let (_files, pool, mut manager) = boot("resolver-fresh-unfiltered-hit", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();

    let (seeded, answer) = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let observation = advance(running.as_mut(), || registry.observe(None).ok()).await;

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor = actor_of(1);
        let seeded = seed_full(
            &resolver.cache,
            Arc::clone(observation.present().world()),
            observation.present().epoch(),
            observation.admitted_at(),
            actor,
        )
        .await;

        let answer = resolver
            .resolve(&observation, actor, None, None)
            .await
            .expect("a cache hit should not touch the unconnected pool")
            .expect("the fresh entry should remain reachable");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        (seeded, answer)
    };
    manager.shutdown().await;

    assert!(
        Arc::ptr_eq(&seeded, &answer),
        "the hit should return the seeded publication"
    );
}

#[tokio::test]
async fn resolve_filtered_cached_document() {
    let (_files, pool, mut manager) = boot("resolver-filtered-cached-document", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();

    let (seeded, answer) = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let observation = advance(running.as_mut(), || registry.observe(None).ok()).await;

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor = actor_of(1);
        let document: Arc<RawValue> = Arc::from(
            RawValue::from_string(r#"{"path":["fixture"]}"#.to_owned())
                .expect("the fixture filter document should parse"),
        );
        let digest = FilterDigest::of(document.get().as_bytes());
        let seeded = seed_filtered(
            &resolver.cache,
            Arc::clone(observation.present().world()),
            observation.present().epoch(),
            observation.admitted_at(),
            actor,
            digest,
            document,
        )
        .await;

        let answer = resolver
            .resolve(&observation, actor, Some(digest), None)
            .await
            .expect("a cached document should not touch the unconnected pool")
            .expect("the cached document should reach its publication");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        (seeded, answer)
    };
    manager.shutdown().await;

    assert!(
        Arc::ptr_eq(&seeded, &answer),
        "an unresent filter should still reach the retained document's publication"
    );
}

#[tokio::test]
async fn resolve_filtered_missing_document() {
    let (_files, pool, mut manager) = boot("resolver-filtered-missing-document", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();

    let answer = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let observation = advance(running.as_mut(), || registry.observe(None).ok()).await;

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor = actor_of(1);
        let digest = FilterDigest::of(b"never cached");
        let answer = resolver
            .resolve(&observation, actor, Some(digest), None)
            .await
            .expect("an uncached digest should not touch the unconnected pool");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        answer
    };
    manager.shutdown().await;

    assert!(
        answer.is_none(),
        "an uncached filtered document should resolve to nothing"
    );
}

#[tokio::test]
async fn resolve_actor_separation() {
    let (_files, pool, mut manager) = boot("resolver-actor-separation", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();

    let (entry_a, entry_b, answer_a, answer_b) = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let observation = advance(running.as_mut(), || registry.observe(None).ok()).await;

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor_a = actor_of(1);
        let actor_b = actor_of(2);
        let world = observation.present().world();
        let epoch = observation.present().epoch();
        let now = observation.admitted_at();
        let entry_a = seed_full(&resolver.cache, Arc::clone(world), epoch, now, actor_a).await;
        let entry_b = seed_full(&resolver.cache, Arc::clone(world), epoch, now, actor_b).await;

        let answer_a = resolver
            .resolve(&observation, actor_a, None, None)
            .await
            .expect("a cache hit should not touch the unconnected pool")
            .expect("actor a's entry should remain reachable");
        let answer_b = resolver
            .resolve(&observation, actor_b, None, None)
            .await
            .expect("a cache hit should not touch the unconnected pool")
            .expect("actor b's entry should remain reachable");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        (entry_a, entry_b, answer_a, answer_b)
    };
    manager.shutdown().await;

    assert!(
        !Arc::ptr_eq(&entry_a, &entry_b),
        "distinct actors should seed distinct publications"
    );
    assert!(
        Arc::ptr_eq(&answer_a, &entry_a),
        "actor a should reach its own publication"
    );
    assert!(
        Arc::ptr_eq(&answer_b, &entry_b),
        "actor b should reach its own publication"
    );
}

#[tokio::test]
async fn resolve_retained_hit() {
    let (files, pool, mut manager) = boot("resolver-retained-hit", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();
    let root = root_of(&files);

    let (seeded, answer, retained_generation, first_id) = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let first = advance(running.as_mut(), || registry.observe(None).ok()).await;
        let first_id = first.present().epoch().generation();

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor = actor_of(1);
        let seeded = seed_full(
            &resolver.cache,
            Arc::clone(first.present().world()),
            first.present().epoch(),
            first.admitted_at(),
            actor,
        )
        .await;

        let replacement = variant_of(&files, b"resolver-retained-hit variant");
        root.activate(replacement.id())
            .expect("the replacement generation should activate");
        let retained = advance(running.as_mut(), || {
            let observation = registry.observe(Some(first_id)).ok()?;
            (observation.present().epoch().generation() != first_id).then_some(observation)
        })
        .await;
        let retained_generation = retained.requested().epoch().generation();

        let answer = resolver
            .resolve(&retained, actor, None, None)
            .await
            .expect("a retained hit should not touch the unconnected pool")
            .expect("the retained entry should remain reachable");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        (seeded, answer, retained_generation, first_id)
    };
    manager.shutdown().await;

    assert_eq!(
        retained_generation, first_id,
        "the retained observation should answer the originally requested generation"
    );
    assert!(
        Arc::ptr_eq(&seeded, &answer),
        "the retained lookup should return the seeded publication"
    );
}

#[tokio::test]
async fn resolve_retained_missing() {
    let (files, pool, mut manager) = boot("resolver-retained-missing", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();
    let root = root_of(&files);

    let answer = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let first = advance(running.as_mut(), || registry.observe(None).ok()).await;
        let first_id = first.present().epoch().generation();

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor = actor_of(1);

        let replacement = variant_of(&files, b"resolver-retained-missing variant");
        root.activate(replacement.id())
            .expect("the replacement generation should activate");
        let retained = advance(running.as_mut(), || {
            let observation = registry.observe(Some(first_id)).ok()?;
            (observation.present().epoch().generation() != first_id).then_some(observation)
        })
        .await;

        let answer = resolver
            .resolve(&retained, actor, None, None)
            .await
            .expect("a retained miss should not touch the unconnected pool");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        answer
    };
    manager.shutdown().await;

    assert!(
        answer.is_none(),
        "an unseeded retained epoch should resolve to nothing"
    );
}

#[tokio::test]
async fn resolve_reopened_missing() {
    let (files, pool, mut manager) = boot("resolver-reopened-missing", SHORT_RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();
    let root = root_of(&files);

    let (error, reopened_generation, first_id, delta_changed) = {
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        let first = advance(running.as_mut(), || registry.observe(None).ok()).await;
        let first_id = first.present().epoch().generation();
        let first_delta = first.present().epoch().reference().id;

        let resolver = ScopeResolver::new(Arc::clone(&pool), LIMITS);
        let actor = actor_of(1);
        let _seeded = seed_full(
            &resolver.cache,
            Arc::clone(first.present().world()),
            first.present().epoch(),
            first.admitted_at(),
            actor,
        )
        .await;

        let replacement = variant_of(&files, b"resolver-reopened-missing variant");
        root.activate(replacement.id())
            .expect("the replacement generation should activate");
        advance(running.as_mut(), || {
            let observation = registry.observe(None).ok()?;
            (observation.present().epoch().generation() != first_id).then_some(())
        })
        .await;

        advance(running.as_mut(), || {
            matches!(
                registry.observe(Some(first_id)),
                Err(ObserveError::Unavailable(refused)) if refused == first_id
            )
            .then_some(())
        })
        .await;

        root.activate(files.generation().id())
            .expect("reactivating the original generation should succeed");
        let reopened = advance(running.as_mut(), || {
            let observation = registry.observe(None).ok()?;
            let epoch = observation.present().epoch();
            (epoch.generation() == first_id && epoch.reference().id != first_delta)
                .then_some(observation)
        })
        .await;
        let reopened_generation = reopened.present().epoch().generation();
        let delta_changed = reopened.present().epoch().reference().id != first_delta;

        let error = timeout(BUDGET, resolver.resolve(&reopened, actor, None, None))
            .await
            .expect("the missing socket should fail within the timeout")
            .expect_err("a fresh delta lifetime should carry no seeded entry");

        shutdown.cancel();
        timeout(BUDGET, running.as_mut())
            .await
            .expect("the cancelled run should finish within its budget");

        (error, reopened_generation, first_id, delta_changed)
    };
    manager.shutdown().await;

    assert_eq!(
        reopened_generation, first_id,
        "reopening should keep the original generation identity"
    );
    assert!(
        delta_changed,
        "reopening should draw a fresh delta lifetime"
    );
    assert!(
        matches!(error.current_context(), VisibilityProofError::Connect),
        "a cache miss should reach the unconnected pool: {error:?}"
    );
}
