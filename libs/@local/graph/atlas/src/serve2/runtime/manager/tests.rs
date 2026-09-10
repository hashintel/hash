//! Promotion, retention, recovery and retirement of one process's generations.
//!
//! Controlled feeds separate cancellation from completion. Supplied maintenance instants exercise
//! retirement without sleeping.

use alloc::sync::Arc;
use core::{
    future::{self, Future},
    mem,
    pin::pin,
    time::Duration,
};
use std::{fs, time::Instant};

use error_stack::Report;
use futures::{FutureExt as _, future::BoxFuture};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use tokio::sync::oneshot;
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;

use super::{
    GenerationManager, ManagerOptions,
    error::ManagerError,
    slot::{Execution, Registration, RuntimeSlot},
    source::RuntimeSource,
};
use crate::{
    file::{
        generation::{GenerationId, GenerationRoot},
        repository::Artifact as _,
        salt::artifact,
    },
    identity::NodeRowId,
    math::nz,
    serve2::{
        delta::{Delta, DeltaReader, DeltaReference},
        runtime::{
            Feed, Runtime,
            registry::{ObserveError, UniverseRegistry},
        },
        tests::fixture::{TamperFixture, secret},
        world::World,
    },
};

/// The retention interval every case measures its deadlines against.
const HARD: Duration = Duration::from_secs(60);

/// One published generation and its opened world.
struct Fixture {
    files: TamperFixture,
    world: Arc<World>,
}

impl Fixture {
    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let world = Arc::new(
            World::open(files.generation().clone(), &secret())
                .expect("the synthetic generation should open"),
        );

        Self { files, world }
    }

    /// Publishes a second generation in the same root, marked by `marker`.
    #[track_caller]
    fn variant(&self, marker: &str) -> Arc<World> {
        let generation = self.files.tamper(&artifact::Representations::NAME, |path| {
            fs::remove_file(path).expect("the staged placeholder should be removable");
            fs::write(path, marker).expect("the variant placeholder should write");
        });
        let world =
            Arc::new(World::open(generation, &secret()).expect("the variant world should open"));
        assert_ne!(
            world.generation().id(),
            self.world.generation().id(),
            "the variant should carry its own generation identity"
        );

        world
    }

    /// The root the manager sources its generations from.
    fn root(&self) -> GenerationRoot {
        GenerationRoot::new(
            self.world
                .generation()
                .path()
                .parent()
                .expect("the fixture generation has a root"),
        )
        .expect("the fixture root should open")
    }
}

/// The handshakes of one controlled feed.
struct Handshake {
    /// Completes once the task observes cancellation.
    observed: oneshot::Receiver<()>,
    /// Releases the task from its wait.
    release: oneshot::Sender<()>,
    /// Completes once the task's body ends.
    ended: oneshot::Receiver<()>,
}

/// Runs `test` on a paused runtime that fails rather than hangs on a stalled task.
#[track_caller]
fn controlled(test: impl Future<Output = ()>) {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .start_paused(true)
        .build()
        .expect("should build the runtime");

    let result =
        runtime.block_on(async { tokio::time::timeout(Duration::from_secs(1), test).await });
    result.expect("the controlled test should finish without a stalled task");
}

/// A pool that never connects, for openings that must not reach a database.
async fn pool() -> Arc<PostgresStorePool> {
    Arc::new(
        PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "manager-test".to_owned(),
                String::new(),
                "/no-manager-test-postgres".to_owned(),
                5432,
                "manager-test".to_owned(),
            ),
            &DatabasePoolConfig {
                max_connections: nz!(1),
            },
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("should construct an unconnected pool"),
    )
}

/// A manager over `fixture`'s root whose current-pointer read never resolves.
///
/// The unresolved read leaves the source's own pointer read unstarted. Each case supplies its
/// selection directly, and draining the manager removes the read first.
async fn maintainer(fixture: &Fixture, options: ManagerOptions) -> GenerationManager {
    let source = RuntimeSource {
        root: fixture.root(),
        secret: secret(),
        pool: pool().await,
        feed: None,
    };
    let mut manager = GenerationManager::new(source, options, HARD)
        .expect("a non-zero interval should construct a manager");
    manager.current = Some(unresolved_pointer());

    manager
}

/// The instant `offset` after `base`.
#[track_caller]
fn after(base: Instant, offset: Duration) -> Instant {
    base.checked_add(offset)
        .expect("the offset should fit the instant's range")
}

/// A current-pointer read that never resolves.
fn unresolved_pointer() -> BoxFuture<'static, Result<Option<GenerationId>, Report<ManagerError>>> {
    Box::pin(future::pending())
}

/// An opening that never resolves.
fn unresolved_opening() -> BoxFuture<'static, Result<Runtime, Report<ManagerError>>> {
    Box::pin(future::pending())
}

/// An opening that has already failed.
fn failed_opening() -> BoxFuture<'static, Result<Runtime, Report<ManagerError>>> {
    Box::pin(future::ready(Err(Report::new(ManagerError::Runtime))))
}

/// An opening that has already produced `runtime`.
fn settled_opening(runtime: Runtime) -> BoxFuture<'static, Result<Runtime, Report<ManagerError>>> {
    Box::pin(future::ready(Ok(runtime)))
}

/// A removal that completes once released, and its release.
fn released_removal() -> (
    BoxFuture<'static, Result<(), Report<ManagerError>>>,
    oneshot::Sender<()>,
) {
    let (release, released) = oneshot::channel::<()>();
    let task = Box::pin(async move {
        released.await.expect("the test should release removal");
        Ok(())
    });

    (task, release)
}

/// Returns a failed removal result without changing the directory.
fn failed_removal() -> BoxFuture<'static, Result<(), Report<ManagerError>>> {
    Box::pin(future::ready(Err(Report::new(ManagerError::Remove))))
}

/// A feed that reports observing cancellation and then ends.
fn prompt_feed() -> (Feed, oneshot::Receiver<()>) {
    let (notify, observed) = oneshot::channel::<()>();
    let shutdown = CancellationToken::new();
    let cancelled = shutdown.clone().cancelled_owned();
    let task = tokio::spawn(async move {
        cancelled.await;
        notify.send(()).expect("the observation should remain open");
        Ok(())
    });

    (Feed { shutdown, task }, observed)
}

/// A feed that reports observing cancellation and ends only once released.
fn stalled_feed() -> (Feed, Handshake) {
    let (notify, observed) = oneshot::channel::<()>();
    let (release, released) = oneshot::channel::<()>();
    let (completion, ended) = oneshot::channel::<()>();
    let shutdown = CancellationToken::new();
    let cancelled = shutdown.clone().cancelled_owned();
    let task = tokio::spawn(async move {
        cancelled.await;
        notify.send(()).expect("the observation should remain open");
        released.await.expect("the test should release the feed");
        completion
            .send(())
            .expect("the completion should remain open");
        Ok(())
    });

    (
        Feed { shutdown, task },
        Handshake {
            observed,
            release,
            ended,
        },
    )
}

/// A feed that ends on its own once released, without waiting for cancellation.
fn ending_feed() -> (Feed, oneshot::Sender<()>, oneshot::Receiver<()>) {
    let (release, released) = oneshot::channel::<()>();
    let (completion, ended) = oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        released.await.expect("the test should release the feed");
        completion
            .send(())
            .expect("the completion should remain open");
        Ok(())
    });

    (
        Feed {
            shutdown: CancellationToken::new(),
            task,
        },
        release,
        ended,
    )
}

/// A runtime over `world` whose delta identity comes from `seed`.
fn runtime(world: Arc<World>, seed: u64, feed: Option<Feed>) -> Runtime {
    let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(seed))
        .expect("the seeded generator should draw a delta identity");

    Runtime {
        world,
        reader: DeltaReader::from(delta),
        feed,
    }
}

/// A candidate slot holding an initialized runtime.
fn ready(runtime: Runtime) -> RuntimeSlot {
    RuntimeSlot {
        registration: Registration::Candidate,
        execution: Execution::Ready(runtime),
    }
}

/// A candidate slot holding a started opening.
fn opening(task: BoxFuture<'static, Result<Runtime, Report<ManagerError>>>) -> RuntimeSlot {
    RuntimeSlot {
        registration: Registration::Candidate,
        execution: Execution::Opening { world: None, task },
    }
}

/// The world and delta lifetime the registry answers a fresh request from.
///
/// Checks the active selection against `generation` and queries the pair it publishes.
#[track_caller]
fn published(
    registry: &UniverseRegistry,
    generation: GenerationId,
) -> (Arc<World>, DeltaReference) {
    let observation = registry
        .observe(None)
        .expect("the active generation should admit");
    let present = observation.present();

    assert_eq!(
        present.world().generation().id(),
        generation,
        "the active selection should hold the promoted generation's world"
    );
    assert_eq!(
        present.epoch().generation(),
        generation,
        "the epoch should name the promoted generation"
    );
    assert!(
        present
            .world()
            .layout
            .position(present.epoch(), NodeRowId::MIN)
            .is_some(),
        "the first node row should have a position at the published epoch"
    );

    (Arc::clone(present.world()), present.epoch().reference())
}

/// Checks the registry refuses `generation` as unavailable.
#[track_caller]
fn assert_unavailable(registry: &UniverseRegistry, generation: GenerationId) {
    let Err(error) = registry.observe(Some(generation)) else {
        panic!("the unavailable generation should not admit")
    };
    assert!(
        matches!(error, ObserveError::Unavailable(refused) if refused == generation),
        "the refusal should name the unavailable generation"
    );
}

/// Checks the registry has closed admission.
#[track_caller]
fn assert_closed(registry: &UniverseRegistry) {
    let Err(error) = registry.observe(None) else {
        panic!("a closed registry should not admit")
    };
    assert!(
        matches!(error, ObserveError::Closed),
        "the refusal should name closed admission"
    );
}

/// Completes an opening and returns its result to the manager for the next maintenance pass.
async fn settle_opening(manager: &mut GenerationManager, generation: GenerationId) {
    let slot = manager
        .slots
        .get_mut(&generation)
        .expect("the generation should hold a slot");
    let Execution::Opening { world, task } = mem::replace(&mut slot.execution, Execution::Removed)
    else {
        panic!("the generation should hold a started opening")
    };

    let result = task.await;
    slot.execution = Execution::Opening {
        world,
        task: Box::pin(future::ready(result)),
    };
}

/// Completes a removal and returns its result to the manager for the next maintenance pass.
async fn settle_removal(manager: &mut GenerationManager, generation: GenerationId) {
    let slot = manager
        .slots
        .get_mut(&generation)
        .expect("the generation should hold a slot");
    let Execution::Removing(task) = mem::replace(&mut slot.execution, Execution::Removed) else {
        panic!("the generation should hold a started removal")
    };

    let result = task.await;
    slot.execution = Execution::Removing(Box::pin(future::ready(result)));
}

/// Removes the pointer read, drains the manager and checks every feed observed cancellation.
async fn drain(
    manager: &mut GenerationManager,
    observations: impl IntoIterator<Item = oneshot::Receiver<()>>,
) {
    manager.current = None;
    manager.shutdown().await;
    for observation in observations {
        observation
            .await
            .expect("every stopped feed should observe cancellation");
    }
}

/// The controlled harness fails a case whose task stalls.
#[test]
#[should_panic(expected = "the controlled test should finish without a stalled task")]
fn controlled_stall() {
    controlled(async {
        tokio::time::advance(Duration::ZERO).await;
        future::pending::<()>().await;
    });
}

/// The run loop observes completed openings at its configured cadence and drains pointer reads.
#[test]
fn run_poll_interval() {
    controlled(async {
        let fixture = Fixture::new("manager-run-poll-interval");
        let interval = Duration::from_millis(10);
        let mut manager = maintainer(
            &fixture,
            ManagerOptions {
                poll_interval: interval,
                ..
            },
        )
        .await;
        let registry = Arc::clone(manager.registry());
        let generation = fixture.world.generation().id();
        let (pointer, pending_pointer) = oneshot::channel();
        manager.current = Some(Box::pin(async move {
            pending_pointer
                .await
                .expect("the test should finish the pointer read")
        }));
        let (initialize, initialized) = oneshot::channel();
        manager.slots.insert(
            generation,
            opening(Box::pin(async move {
                Ok(initialized
                    .await
                    .expect("the test should finish initialization"))
            })),
        );
        manager.desired = Some(generation);

        let shutdown = CancellationToken::new();
        let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));
        assert!(
            running.as_mut().now_or_never().is_none(),
            "the run loop should await initialization"
        );
        assert!(
            matches!(registry.observe(None), Err(ObserveError::Empty)),
            "a pending opening should admit no request"
        );

        let (feed, observed) = prompt_feed();
        assert!(
            initialize
                .send(runtime(Arc::clone(&fixture.world), 1, Some(feed)))
                .is_ok(),
            "the manager should retain its opening future"
        );
        assert!(
            running.as_mut().now_or_never().is_none(),
            "the run loop should await its next maintenance pass"
        );
        assert!(
            matches!(registry.observe(None), Err(ObserveError::Empty)),
            "a completed opening should await the next maintenance pass"
        );

        tokio::time::advance(interval).await;
        assert!(
            running.as_mut().now_or_never().is_none(),
            "the run loop should continue after promotion"
        );
        let (world, _lifetime) = published(&registry, generation);
        assert!(
            Arc::ptr_eq(&world, &fixture.world),
            "the next maintenance pass should promote the completed opening"
        );

        shutdown.cancel();
        assert!(
            running.as_mut().now_or_never().is_none(),
            "shutdown should wait for owned operations"
        );
        assert_closed(&registry);
        observed.await.expect("shutdown should stop the feed");
        assert!(
            running.as_mut().now_or_never().is_none(),
            "shutdown should retain the pending pointer read"
        );
        assert!(
            pointer.send(Ok(None)).is_ok(),
            "shutdown should retain the pointer future's receiver"
        );
        running.await;
    });
}

/// Maintenance runs once a second and keeps expired directories.
#[test]
fn options_default() {
    let options = ManagerOptions::default();

    assert_eq!(
        options.poll_interval,
        Duration::from_secs(1),
        "the default maintenance pass should run once a second"
    );
    assert!(
        !options.unlink,
        "expired directories should stay on disk by default"
    );
}

/// Construction refuses a zero polling interval under [`ManagerError::InvalidInterval`].
#[tokio::test]
async fn new_zero_interval() {
    let fixture = Fixture::new("manager-new-zero-interval");
    let source = RuntimeSource {
        root: fixture.root(),
        secret: secret(),
        pool: pool().await,
        feed: None,
    };

    let Err(error) = GenerationManager::new(
        source,
        ManagerOptions {
            poll_interval: Duration::ZERO,
            ..
        },
        HARD,
    ) else {
        panic!("a zero polling interval should not construct a manager")
    };

    assert!(
        matches!(error.current_context(), ManagerError::InvalidInterval),
        "the refusal should name the invalid interval"
    );
}

/// A selected generation publishes nothing until its opening succeeds.
#[tokio::test]
async fn open_promotes_selection() {
    let fixture = Fixture::new("manager-open-promotes-selection");
    let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let generation = fixture.world.generation().id();

    manager.desired = Some(generation);
    manager.tick(base);

    let Err(error) = registry.observe(None) else {
        panic!("an unfinished opening should not publish")
    };
    assert!(
        matches!(error, ObserveError::Empty),
        "the refusal should name the missing active generation"
    );

    settle_opening(&mut manager, generation).await;
    manager.tick(after(base, Duration::from_secs(1)));

    let (world, _lifetime) = published(&registry, generation);
    assert!(
        !Arc::ptr_eq(&world, &fixture.world),
        "the manager should publish the world its own opening produced"
    );

    drain(&mut manager, []).await;
}

/// A pending candidate keeps the previous generation's publication.
#[test]
fn promote_pending_opening() {
    controlled(async {
        let fixture = Fixture::new("manager-promote-pending-opening");
        let replacement = fixture.variant("pending opening");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let base = Instant::now();
        let active = fixture.world.generation().id();
        let candidate = replacement.generation().id();

        let (feed, observed) = prompt_feed();
        manager.slots.insert(
            active,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
        );
        manager.desired = Some(active);
        manager.tick(base);
        let (world, lifetime) = published(&registry, active);

        manager
            .slots
            .insert(candidate, opening(unresolved_opening()));
        manager.desired = Some(candidate);
        manager.tick(after(base, Duration::from_secs(1)));

        let (retained, unchanged) = published(&registry, active);
        assert!(
            Arc::ptr_eq(&retained, &world),
            "a pending candidate should keep the published world"
        );
        assert_eq!(
            unchanged, lifetime,
            "a pending candidate should keep the published lifetime"
        );
        assert_unavailable(&registry, candidate);

        drop(manager.slots.remove(&candidate));
        drain(&mut manager, [observed]).await;
    });
}

/// A failed candidate keeps the previous publication and reopens while selected.
#[tokio::test]
async fn promote_failed_opening() {
    let fixture = Fixture::new("manager-promote-failed-opening");
    let replacement = fixture.variant("failed opening");
    let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let active = fixture.world.generation().id();
    let candidate = replacement.generation().id();

    let (feed, observed) = prompt_feed();
    manager.slots.insert(
        active,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(active);
    manager.tick(base);
    let (world, lifetime) = published(&registry, active);

    manager.slots.insert(candidate, opening(failed_opening()));
    manager.desired = Some(candidate);
    manager.tick(after(base, Duration::from_secs(1)));

    let (retained, unchanged) = published(&registry, active);
    assert!(
        Arc::ptr_eq(&retained, &world),
        "a failed candidate should keep the published world"
    );
    assert_eq!(
        unchanged, lifetime,
        "a failed candidate should keep the published lifetime"
    );
    let slot = manager
        .slots
        .get(&candidate)
        .expect("the selected candidate should keep its slot");
    assert!(
        matches!(slot.execution, Execution::Opening { .. }),
        "the selected candidate should reopen after its failure"
    );

    settle_opening(&mut manager, candidate).await;
    drain(&mut manager, [observed]).await;
}

/// Reselecting a retained generation before its expiry keeps its world and lifetime.
#[test]
fn promote_reselected_before_expiry() {
    controlled(async {
        let fixture = Fixture::new("manager-promote-reselected-before-expiry");
        let replacement = fixture.variant("reselected before expiry");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let base = Instant::now();
        let first = fixture.world.generation().id();
        let second = replacement.generation().id();

        let (feed, observed) = prompt_feed();
        manager.slots.insert(
            first,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
        );
        manager.desired = Some(first);
        manager.tick(base);
        let (world, lifetime) = published(&registry, first);

        manager
            .slots
            .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
        manager.desired = Some(second);
        manager.tick(after(base, Duration::from_secs(1)));
        let (displacing, _published) = published(&registry, second);
        assert!(
            Arc::ptr_eq(&displacing, &replacement),
            "the replacement should take the active selection"
        );

        manager.desired = Some(first);
        manager.tick(after(base, Duration::from_secs(2)));

        let (reselected, resumed) = published(&registry, first);
        assert!(
            Arc::ptr_eq(&reselected, &world),
            "reselection before expiry should keep the running world"
        );
        assert_eq!(
            resumed, lifetime,
            "reselection before expiry should keep the running delta lifetime"
        );

        drain(&mut manager, [observed]).await;
    });
}

/// An expired generation joins its feed before reopening, and returns with a fresh lifetime.
#[tokio::test]
async fn promote_reactivated_after_expiry() {
    let fixture = Fixture::new("manager-promote-reactivated-after-expiry");
    let replacement = fixture.variant("reactivated after expiry");
    let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let first = fixture.world.generation().id();
    let second = replacement.generation().id();

    let (feed, handshake) = stalled_feed();
    manager.slots.insert(
        first,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(first);
    manager.tick(base);
    let (world, lifetime) = published(&registry, first);

    let retired = after(base, Duration::from_secs(1));
    manager
        .slots
        .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
    manager.desired = Some(second);
    manager.tick(retired);

    manager.tick(after(retired, HARD));
    handshake
        .observed
        .await
        .expect("expiry should stop the retained feed");

    manager.desired = Some(first);
    manager.tick(after(retired, HARD));
    let (still_active, _lifetime) = published(&registry, second);
    assert!(
        Arc::ptr_eq(&still_active, &replacement),
        "an unjoined feed should keep the replacement published"
    );
    let slot = manager
        .slots
        .get(&first)
        .expect("the reselected generation should keep its slot");
    assert!(
        matches!(slot.execution, Execution::Joining(_)),
        "reactivation should wait for the feed to join"
    );

    handshake
        .release
        .send(())
        .expect("the feed should await release");
    handshake
        .ended
        .await
        .expect("the feed should run to its end");

    manager.tick(after(retired, HARD));
    settle_opening(&mut manager, first).await;
    manager.tick(after(retired, HARD));

    let (reactivated, restarted) = published(&registry, first);
    assert!(
        Arc::ptr_eq(&reactivated, &world),
        "reactivation should reuse the retained world"
    );
    assert_ne!(
        restarted, lifetime,
        "reactivation should publish a fresh delta lifetime"
    );

    drain(&mut manager, []).await;
}

/// Expiry stops a retained feed and closes its admission without removing the directory.
#[test]
fn expire_stops_retained_feed() {
    controlled(async {
        let fixture = Fixture::new("manager-expire-stops-retained-feed");
        let replacement = fixture.variant("expire stops retained feed");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let base = Instant::now();
        let first = fixture.world.generation().id();
        let second = replacement.generation().id();

        let (feed, observed) = prompt_feed();
        manager.slots.insert(
            first,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
        );
        manager.desired = Some(first);
        manager.tick(base);

        let retired = after(base, Duration::from_secs(1));
        manager
            .slots
            .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
        manager.desired = Some(second);
        manager.tick(retired);

        let held = registry
            .observe(Some(first))
            .expect("the retained generation should admit before its expiry");

        manager.tick(after(retired, HARD));
        observed
            .await
            .expect("expiry should stop the retained feed without unlinking");

        assert_unavailable(&registry, first);
        assert!(
            Arc::ptr_eq(held.requested().world(), &fixture.world),
            "the held request should keep the retained world"
        );
        assert!(
            held.requested()
                .world()
                .layout
                .position(held.requested().epoch(), NodeRowId::MIN)
                .is_some(),
            "the held request should still answer after cleanup"
        );
        assert!(
            fixture.world.generation().path().is_dir(),
            "expiry without unlink should keep the generation's directory"
        );

        drain(&mut manager, []).await;
    });
}

/// One stalled join leaves another expired feed free to observe its own shutdown.
#[test]
fn expire_stalled_join() {
    controlled(async {
        let fixture = Fixture::new("manager-expire-stalled-join");
        let second_world = fixture.variant("stalled join second");
        let third_world = fixture.variant("stalled join third");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let base = Instant::now();
        let first = fixture.world.generation().id();
        let second = second_world.generation().id();
        let third = third_world.generation().id();

        let (stalled, handshake) = stalled_feed();
        let (prompt, observed) = prompt_feed();
        manager.slots.insert(
            first,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(stalled))),
        );
        manager.desired = Some(first);
        manager.tick(base);

        let first_retired = after(base, Duration::from_secs(1));
        manager.slots.insert(
            second,
            ready(runtime(Arc::clone(&second_world), 2, Some(prompt))),
        );
        manager.desired = Some(second);
        manager.tick(first_retired);

        let second_retired = after(first_retired, Duration::from_secs(1));
        manager
            .slots
            .insert(third, ready(runtime(Arc::clone(&third_world), 3, None)));
        manager.desired = Some(third);
        manager.tick(second_retired);

        manager.tick(after(second_retired, HARD));
        handshake
            .observed
            .await
            .expect("the stalled feed should observe cancellation");
        observed
            .await
            .expect("the second expired feed should observe cancellation behind a stalled join");

        manager.tick(after(second_retired, HARD));
        assert!(
            !manager.slots.contains_key(&second),
            "the joined expired generation should leave no slot"
        );
        assert!(
            manager.slots.contains_key(&first),
            "the stalled expired generation should keep its slot"
        );

        handshake
            .release
            .send(())
            .expect("the stalled feed should await release");
        drain(&mut manager, []).await;
        handshake
            .ended
            .await
            .expect("the stalled feed should run to its end");
    });
}

/// An ended present feed recovers into a fresh lifetime over the retained world.
#[tokio::test]
async fn recovery_after_present_feed_end() {
    let fixture = Fixture::new("manager-recovery-after-present-feed-end");
    let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let generation = fixture.world.generation().id();

    let (feed, release, ended) = ending_feed();
    manager.slots.insert(
        generation,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(generation);
    manager.tick(base);
    let (world, lifetime) = published(&registry, generation);

    release.send(()).expect("the feed should await release");
    ended.await.expect("the feed should run to its end");
    manager.tick(after(base, Duration::from_secs(1)));

    let (retained, unchanged) = published(&registry, generation);
    assert!(
        Arc::ptr_eq(&retained, &world),
        "recovery should keep the published world"
    );
    assert_eq!(
        unchanged, lifetime,
        "recovery should keep the published lifetime until it succeeds"
    );

    settle_opening(&mut manager, generation).await;
    manager.tick(after(base, Duration::from_secs(2)));

    let (recovered, restarted) = published(&registry, generation);
    assert!(
        Arc::ptr_eq(&recovered, &world),
        "recovery should reuse the retained world"
    );
    assert_ne!(
        restarted, lifetime,
        "recovery should publish a fresh delta lifetime"
    );

    drain(&mut manager, []).await;
}

/// A retained generation whose feed ends recovers only at its next selection.
#[tokio::test]
async fn recovery_deferred_while_retained() {
    let fixture = Fixture::new("manager-recovery-deferred-while-retained");
    let replacement = fixture.variant("deferred recovery");
    let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let first = fixture.world.generation().id();
    let second = replacement.generation().id();

    let (feed, release, ended) = ending_feed();
    manager.slots.insert(
        first,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(first);
    manager.tick(base);
    let (world, lifetime) = published(&registry, first);

    let retired = after(base, Duration::from_secs(1));
    manager
        .slots
        .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
    manager.desired = Some(second);
    manager.tick(retired);

    release.send(()).expect("the feed should await release");
    ended.await.expect("the feed should run to its end");
    manager.tick(after(retired, Duration::from_secs(1)));

    let observation = registry
        .observe(Some(first))
        .expect("the retained generation should admit within its retention");
    assert!(
        Arc::ptr_eq(observation.requested().world(), &world),
        "a retained generation should keep its final world"
    );
    assert_eq!(
        observation.requested().epoch().reference(),
        lifetime,
        "a retained generation should keep its final publication"
    );
    let slot = manager
        .slots
        .get(&first)
        .expect("the retained generation should keep its slot");
    assert!(
        matches!(slot.execution, Execution::Stopped(_)),
        "a retained generation should not start recovery"
    );

    manager.desired = Some(first);
    manager.tick(after(retired, Duration::from_secs(2)));
    settle_opening(&mut manager, first).await;
    manager.tick(after(retired, Duration::from_secs(3)));

    let (recovered, restarted) = published(&registry, first);
    assert!(
        Arc::ptr_eq(&recovered, &world),
        "reselection should recover over the retained world"
    );
    assert_ne!(
        restarted, lifetime,
        "reselection should recover into a fresh delta lifetime"
    );

    drain(&mut manager, []).await;
}

/// A generation without a feed preserves its lifetime across maintenance passes.
#[test]
fn recovery_absent_without_feed() {
    controlled(async {
        let fixture = Fixture::new("manager-recovery-absent-without-feed");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let base = Instant::now();
        let generation = fixture.world.generation().id();

        manager.slots.insert(
            generation,
            ready(runtime(Arc::clone(&fixture.world), 1, None)),
        );
        manager.desired = Some(generation);
        manager.tick(base);
        let (world, lifetime) = published(&registry, generation);

        manager.tick(after(base, Duration::from_secs(1)));
        manager.tick(after(base, Duration::from_secs(2)));

        let (unchanged, held) = published(&registry, generation);
        assert!(
            Arc::ptr_eq(&unchanged, &world),
            "a static generation should keep its published world"
        );
        assert_eq!(
            held, lifetime,
            "a static generation should keep its published lifetime"
        );
        let slot = manager
            .slots
            .get(&generation)
            .expect("the static generation should keep its slot");
        assert!(
            matches!(slot.execution, Execution::Running(_)),
            "a static generation should stay healthy"
        );

        drain(&mut manager, []).await;
    });
}

/// Shutdown stops every initialized feed and closes admission before any join returns.
#[test]
fn shutdown_signals_before_join() {
    controlled(async {
        let fixture = Fixture::new("manager-shutdown-signals-before-join");
        let replacement = fixture.variant("shutdown signals");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let base = Instant::now();
        let first = fixture.world.generation().id();
        let second = replacement.generation().id();

        let (retained_feed, retained) = stalled_feed();
        let (active_feed, active) = stalled_feed();
        manager.slots.insert(
            first,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(retained_feed))),
        );
        manager.desired = Some(first);
        manager.tick(base);

        manager.slots.insert(
            second,
            ready(runtime(Arc::clone(&replacement), 2, Some(active_feed))),
        );
        manager.desired = Some(second);
        manager.tick(after(base, Duration::from_secs(1)));

        manager.current = None;
        assert!(
            manager.shutdown().now_or_never().is_none(),
            "the wait should not finish while both feeds are joining"
        );
        assert_closed(&registry);
        retained
            .observed
            .await
            .expect("the retained feed should observe shutdown");
        active
            .observed
            .await
            .expect("the active feed should observe shutdown");

        retained
            .release
            .send(())
            .expect("the retained feed should await release");
        active
            .release
            .send(())
            .expect("the active feed should await release");
        manager.shutdown().await;

        retained
            .ended
            .await
            .expect("the retained feed should run to its end");
        active
            .ended
            .await
            .expect("the active feed should run to its end");
    });
}

/// A cancelled shutdown wait keeps the unjoined feed's result in the manager.
#[test]
fn shutdown_cancelled_wait() {
    controlled(async {
        let fixture = Fixture::new("manager-shutdown-cancelled-wait");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let base = Instant::now();
        let generation = fixture.world.generation().id();

        let (feed, handshake) = stalled_feed();
        manager.slots.insert(
            generation,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
        );
        manager.desired = Some(generation);
        manager.tick(base);

        manager.current = None;
        assert!(
            manager.shutdown().now_or_never().is_none(),
            "the first wait should not finish while the feed is joining"
        );
        handshake
            .observed
            .await
            .expect("the feed should observe shutdown");
        assert!(
            manager.shutdown().now_or_never().is_none(),
            "the retained result should keep the resumed wait pending"
        );

        handshake
            .release
            .send(())
            .expect("the feed should await release");
        manager.shutdown().await;
        handshake
            .ended
            .await
            .expect("the retained result should reach the resumed wait");
    });
}

/// An unselected initialized candidate stops and joins its feed instead of publishing.
#[test]
fn reconcile_superseded_candidate() {
    controlled(async {
        let fixture = Fixture::new("manager-reconcile-superseded-candidate");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let base = Instant::now();
        let generation = fixture.world.generation().id();

        let (feed, observed) = prompt_feed();
        manager.slots.insert(
            generation,
            ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
        );
        manager.tick(base);

        observed
            .await
            .expect("the superseded candidate should observe cancellation");
        let Err(error) = registry.observe(None) else {
            panic!("an unselected candidate should not publish")
        };
        assert!(
            matches!(error, ObserveError::Empty),
            "the refusal should name the missing active generation"
        );

        manager.tick(after(base, Duration::from_secs(1)));
        assert!(
            !manager.slots.contains_key(&generation),
            "the joined candidate should leave no slot"
        );

        drain(&mut manager, []).await;
    });
}

/// Shutdown stops and joins the feed of an opening that completed unselected.
#[test]
fn shutdown_superseded_opening() {
    controlled(async {
        let fixture = Fixture::new("manager-shutdown-superseded-opening");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let generation = fixture.world.generation().id();

        let (feed, observed) = prompt_feed();
        manager.slots.insert(
            generation,
            opening(settled_opening(runtime(
                Arc::clone(&fixture.world),
                1,
                Some(feed),
            ))),
        );

        drain(&mut manager, [observed]).await;
        assert_closed(&registry);
    });
}

/// Selecting an expired generation reopens it instead of unlinking its directory.
#[tokio::test]
async fn expire_precedes_unlink() {
    let fixture = Fixture::new("manager-expire-precedes-unlink");
    let replacement = fixture.variant("expiry precedes unlink");
    let mut manager = maintainer(&fixture, ManagerOptions { unlink: true, .. }).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let first = fixture.world.generation().id();
    let second = replacement.generation().id();

    let (feed, observed) = prompt_feed();
    manager.slots.insert(
        first,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(first);
    manager.tick(base);
    let (world, lifetime) = published(&registry, first);

    let retired = after(base, Duration::from_secs(1));
    manager
        .slots
        .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
    manager.desired = Some(second);
    manager.tick(retired);

    manager.tick(after(retired, HARD));
    observed.await.expect("expiry should stop the feed");

    manager.desired = Some(first);
    manager.tick(after(retired, HARD));
    let slot = manager
        .slots
        .get(&first)
        .expect("the reselected generation should keep its slot");
    assert!(
        matches!(slot.execution, Execution::Opening { .. }),
        "selection should reopen the expired generation"
    );
    assert!(
        world.generation().path().is_dir(),
        "selection should keep the directory an unstarted unlink would remove"
    );

    settle_opening(&mut manager, first).await;
    manager.tick(after(retired, HARD));

    let (reopened, restarted) = published(&registry, first);
    assert!(
        Arc::ptr_eq(&reopened, &world),
        "the reselected generation should serve its retained world"
    );
    assert_ne!(
        restarted, lifetime,
        "the reselected generation should publish a fresh delta lifetime"
    );

    drain(&mut manager, []).await;
}

/// A started removal finishes before the generation opens again.
#[tokio::test]
async fn open_after_started_removal() {
    let fixture = Fixture::new("manager-open-after-started-removal");
    let replacement = fixture.variant("open after started removal");
    let mut manager = maintainer(&fixture, ManagerOptions { unlink: true, .. }).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let first = fixture.world.generation().id();
    let second = replacement.generation().id();

    manager
        .slots
        .insert(first, ready(runtime(Arc::clone(&fixture.world), 1, None)));
    manager.desired = Some(first);
    manager.tick(base);

    let retired = after(base, Duration::from_secs(1));
    manager
        .slots
        .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
    manager.desired = Some(second);
    manager.tick(retired);

    manager.tick(after(retired, HARD));
    let (removal, release) = released_removal();
    let slot = manager
        .slots
        .get_mut(&first)
        .expect("the expired generation should keep its slot");
    assert!(
        matches!(slot.execution, Execution::Stopped(_)),
        "expiry should join the generation before its removal"
    );
    slot.execution = Execution::Removing(removal);

    manager.desired = Some(first);
    manager.tick(after(retired, HARD));
    let slot = manager
        .slots
        .get(&first)
        .expect("the removing generation should keep its slot");
    assert!(
        matches!(slot.execution, Execution::Removing(_)),
        "a started removal should finish before a fresh opening"
    );

    release.send(()).expect("the removal should await release");
    manager.tick(after(retired, HARD));
    settle_opening(&mut manager, first).await;
    manager.tick(after(retired, HARD));

    let (reopened, _lifetime) = published(&registry, first);
    assert!(
        !Arc::ptr_eq(&reopened, &fixture.world),
        "the opening after a removal should read the generation from disk"
    );

    drain(&mut manager, []).await;
}

/// Removal follows joining, empties the directory and leaves held requests answering.
#[tokio::test]
async fn remove_expired_directory() {
    let fixture = Fixture::new("manager-remove-expired-directory");
    let replacement = fixture.variant("remove expired directory");
    let mut manager = maintainer(&fixture, ManagerOptions { unlink: true, .. }).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let first = fixture.world.generation().id();
    let second = replacement.generation().id();
    let directory = fixture.world.generation().path().to_owned();

    let (feed, observed) = prompt_feed();
    manager.slots.insert(
        first,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(first);
    manager.tick(base);

    let retired = after(base, Duration::from_secs(1));
    manager
        .slots
        .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
    manager.desired = Some(second);
    manager.tick(retired);

    let held = registry
        .observe(Some(first))
        .expect("the retained generation should admit before its expiry");

    manager.tick(after(retired, HARD));
    observed.await.expect("expiry should stop the feed");
    assert!(
        directory.is_dir(),
        "removal should follow the feed's joining"
    );

    manager.tick(after(retired, HARD));
    settle_removal(&mut manager, first).await;
    manager.tick(after(retired, HARD));

    assert!(
        !directory.is_dir(),
        "removal should not wait for the request-held world"
    );
    assert!(
        !manager.slots.contains_key(&first),
        "the removed generation should leave no slot"
    );
    assert!(
        held.requested()
            .world()
            .layout
            .position(held.requested().epoch(), NodeRowId::MIN)
            .is_some(),
        "the held request should answer after the removal deletes its directory"
    );

    drain(&mut manager, []).await;
}

/// A failed removal reopens the generation from disk instead of reusing its world.
#[tokio::test]
async fn remove_failure_reopens_from_disk() {
    let fixture = Fixture::new("manager-remove-failure-reopens-from-disk");
    let replacement = fixture.variant("remove failure reopens");
    let mut manager = maintainer(&fixture, ManagerOptions { unlink: true, .. }).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let first = fixture.world.generation().id();
    let second = replacement.generation().id();

    manager
        .slots
        .insert(first, ready(runtime(Arc::clone(&fixture.world), 1, None)));
    manager.desired = Some(first);
    manager.tick(base);

    let retired = after(base, Duration::from_secs(1));
    manager
        .slots
        .insert(second, ready(runtime(Arc::clone(&replacement), 2, None)));
    manager.desired = Some(second);
    manager.tick(retired);

    manager.tick(after(retired, HARD));
    let slot = manager
        .slots
        .get_mut(&first)
        .expect("the expired generation should keep its slot");
    slot.execution = Execution::Removing(failed_removal());

    manager.desired = Some(first);
    manager.tick(after(retired, HARD));
    settle_opening(&mut manager, first).await;
    manager.tick(after(retired, HARD));

    let (reopened, _lifetime) = published(&registry, first);
    assert!(
        !Arc::ptr_eq(&reopened, &fixture.world),
        "a failed removal should force the generation's validation from disk"
    );

    drain(&mut manager, []).await;
}

/// An opening that completes with the runtime its case delivers.
fn delivered_opening() -> (
    BoxFuture<'static, Result<Runtime, Report<ManagerError>>>,
    oneshot::Sender<Runtime>,
) {
    let (delivery, arrival) = oneshot::channel::<Runtime>();
    let task = Box::pin(async move {
        Ok(arrival
            .await
            .expect("the case should deliver the initialized runtime"))
    });

    (task, delivery)
}

/// Completes the real opening before substituting a failed recovery result.
async fn fail_started_opening(manager: &mut GenerationManager, generation: GenerationId) {
    let slot = manager
        .slots
        .get_mut(&generation)
        .expect("the generation should hold a slot");
    let Execution::Opening { world, task } = mem::replace(&mut slot.execution, Execution::Removed)
    else {
        panic!("the generation should hold a started recovery")
    };

    drop(task.await.expect("the manager's recovery should open"));
    slot.execution = Execution::Opening {
        world,
        task: failed_opening(),
    };
}

/// A failed recovery keeps the ended feed's publication until a later attempt succeeds.
#[tokio::test]
async fn recovery_failed_attempt() {
    let fixture = Fixture::new("manager-recovery-failed-attempt");
    let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
    let registry = Arc::clone(manager.registry());
    let base = Instant::now();
    let generation = fixture.world.generation().id();

    let (feed, release, ended) = ending_feed();
    manager.slots.insert(
        generation,
        ready(runtime(Arc::clone(&fixture.world), 1, Some(feed))),
    );
    manager.desired = Some(generation);
    manager.tick(base);
    let (world, lifetime) = published(&registry, generation);

    release.send(()).expect("the feed should await release");
    ended.await.expect("the feed should run to its end");
    manager.tick(after(base, Duration::from_secs(1)));
    fail_started_opening(&mut manager, generation).await;
    manager.tick(after(base, Duration::from_secs(2)));

    let (retained, unchanged) = published(&registry, generation);
    assert!(
        Arc::ptr_eq(&retained, &world),
        "a failed recovery should keep the published world"
    );
    assert_eq!(
        unchanged, lifetime,
        "a failed recovery should keep the published lifetime"
    );

    settle_opening(&mut manager, generation).await;
    manager.tick(after(base, Duration::from_secs(3)));

    let (recovered, restarted) = published(&registry, generation);
    assert!(
        Arc::ptr_eq(&recovered, &world),
        "a later recovery should reuse the retained world"
    );
    assert_ne!(
        restarted, lifetime,
        "a later recovery should publish a fresh delta lifetime"
    );

    drain(&mut manager, []).await;
}

/// A cancelled shutdown wait resumes over an opening that finishes after it.
#[test]
fn shutdown_pending_opening() {
    controlled(async {
        let fixture = Fixture::new("manager-shutdown-pending-opening");
        let mut manager = maintainer(&fixture, ManagerOptions::default()).await;
        let registry = Arc::clone(manager.registry());
        let generation = fixture.world.generation().id();

        let (task, delivery) = delivered_opening();
        manager.slots.insert(generation, opening(task));
        manager.desired = Some(generation);
        manager.current = None;

        assert!(
            manager.shutdown().now_or_never().is_none(),
            "the wait should not finish while the opening is pending"
        );
        assert_closed(&registry);

        let (feed, observed) = prompt_feed();
        assert!(
            delivery
                .send(runtime(Arc::clone(&fixture.world), 1, Some(feed)))
                .is_ok(),
            "the pending opening should still await its runtime"
        );

        manager.shutdown().await;
        observed
            .await
            .expect("the delivered runtime should stop and join its feed");
        assert_closed(&registry);
    });
}
