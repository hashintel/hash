//! Logical expiry and refresh eligibility with backing-cache retention held fixed.
//!
//! The backing cache has no TTL. Backdated entries use a fixed supplied time.

use alloc::sync::Arc;
use core::{sync::atomic::Ordering, time::Duration};
use std::{fs, time::Instant};

use arc_swap::Guard;
use rand::{SeedableRng as _, rngs::StdRng};
use tokio::{sync::oneshot, time::timeout};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{
    CacheEntry, CacheKey, PendingCacheEntry, PublicationProducer, VisibilityCache,
    VisibilityLimits, weight_of,
};
use crate::{
    allocator::HeapMemoryUsage as _,
    file::{generation::GenerationId, repository::Artifact as _, salt::artifact},
    serve::{
        delta::{Delta, epoch::Epoch},
        schedule::ViewSchedule,
        tests::fixture::{TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask},
        world::World,
    },
};

const HARD: Duration = Duration::from_secs(60);

/// Synthetic serving artifacts paired with a cache whose backing entries do not expire.
struct Fixture {
    files: TamperFixture,
    world: Arc<World>,
    epoch: Epoch,
    retired: GenerationId,
    cache: VisibilityCache,
    actor: ActorId,
    now: Instant,
}

impl Fixture {
    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let world = Arc::new(
            World::open(files.generation().clone(), &secret())
                .expect("the synthetic generation should open"),
        );
        let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(0x5EED))
            .expect("the seeded RNG should allocate a delta identity");
        let epoch = Epoch::from(Guard::from_inner(Arc::new(delta)));
        let retired: GenerationId = "ab"
            .repeat(32)
            .parse()
            .expect("64 hexadecimal digits should name a generation");
        assert_ne!(epoch.generation(), retired);

        Self {
            files,
            world,
            epoch,
            retired,
            cache: VisibilityCache {
                entries: moka::future::Cache::builder().build(),
                publications: Arc::new(PublicationProducer::new()),
                limits: VisibilityLimits {
                    bytes: u64::MAX,
                    soft: Duration::from_secs(30),
                    hard: HARD,
                },
            },
            actor: ActorId::new(Uuid::from_u128(1), ActorType::User),
            now: Instant::now(),
        }
    }

    fn key(&self, generation: GenerationId) -> CacheKey {
        CacheKey {
            generation,
            ..CacheKey::new(&self.epoch, self.actor, None)
        }
    }

    async fn absent(&self, key: &CacheKey) {
        assert!(
            self.cache.entries.get(key).await.is_none(),
            "the key should be absent"
        );
    }

    async fn seed(&self, key: CacheKey, age: Duration) -> Arc<CacheEntry> {
        let resolved_at = self
            .now
            .checked_sub(age)
            .expect("the age should fit the instant's range");
        let entry = Arc::new(CacheEntry::new(
            pending(&self.world, &self.epoch, self.actor),
            resolved_at,
            self.cache.publications.next(),
        ));
        self.cache.entries.insert(key, Arc::clone(&entry)).await;
        entry
    }
}

/// Constructs a Corpus resolution without the async scheduling offload.
fn pending(world: &Arc<World>, epoch: &Epoch, actor: ActorId) -> PendingCacheEntry {
    let mask = VisibilityMask::full(
        epoch,
        VisibilityActor {
            id: actor,
            instance_admin: false,
        },
    );
    let schedule = ViewSchedule::of(Arc::clone(world), epoch, &mask);
    let weight = weight_of(
        mask.heap_memory_usage() + schedule.heap_memory_usage(),
        None,
    );

    PendingCacheEntry {
        mask,
        schedule,
        filter: None,
        occupancy: None,
        weight,
    }
}

macro_rules! resolving {
    ($fixture:expr) => {{
        let world = Arc::clone(&$fixture.world);
        let actor = $fixture.actor;
        async move |epoch: &Epoch| Ok::<_, ()>(pending(&world, epoch, actor))
    }};
}

async fn forbidden(_epoch: &Epoch) -> Result<PendingCacheEntry, ()> {
    panic!("this lookup should not invoke the resolver")
}

async fn refusing(_epoch: &Epoch) -> Result<PendingCacheEntry, &'static str> {
    Err("permission resolution failed")
}

fn other_epoch(files: &TamperFixture) -> Epoch {
    let generation = files.tamper(&artifact::Representations::NAME, |path| {
        fs::remove_file(path).expect("the staged placeholder should be removable");
        fs::write(path, b"alternate representation placeholder")
            .expect("the alternate placeholder should write");
    });
    let world =
        Arc::new(World::open(generation, &secret()).expect("the other generation should open"));
    let delta = Delta::new(world, StdRng::seed_from_u64(0xBEEF))
        .expect("the seeded RNG should allocate the other delta identity");
    Epoch::from(Guard::from_inner(Arc::new(delta)))
}

fn reopened(files: &TamperFixture) -> (Arc<World>, Epoch) {
    let world = Arc::new(
        World::open(files.generation().clone(), &secret())
            .expect("the same generation should reopen"),
    );
    let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(0xA11CE))
        .expect("the seeded RNG should allocate a new delta identity");
    (world, Epoch::from(Guard::from_inner(Arc::new(delta))))
}

/// A late resolution retains its original lifetime's key after the generation reopens.
#[tokio::test(start_paused = true)]
async fn resolve_reopened_inflight() {
    let fixture = Fixture::new("cache-resolve-reopened-inflight");
    let (world, epoch) = reopened(&fixture.files);
    assert_eq!(epoch.generation(), fixture.epoch.generation());
    assert_ne!(epoch.reference().id, fixture.epoch.reference().id);
    assert!(!Arc::ptr_eq(&world, &fixture.world));

    let (announce, started) = oneshot::channel();
    let (release, released) = oneshot::channel();
    let previous_world = Arc::clone(&fixture.world);
    let actor = fixture.actor;
    let old = fixture.cache.resolve(
        &fixture.epoch,
        CacheKey::new(&fixture.epoch, actor, None),
        fixture.now,
        async move |epoch: &Epoch| {
            announce
                .send(())
                .expect("the replacement should await resolution startup");
            released
                .await
                .expect("the replacement should release the prior resolution");
            Ok::<_, ()>(pending(&previous_world, epoch, actor))
        },
    );
    let new = async {
        started
            .await
            .expect("the prior resolution should announce startup");
        let entry = fixture
            .cache
            .resolve(
                &epoch,
                CacheKey::new(&epoch, actor, None),
                fixture.now,
                async move |epoch: &Epoch| Ok::<_, ()>(pending(&world, epoch, actor)),
            )
            .await
            .expect("the new lifetime should resolve independently")
            .expect("the new lifetime should have a publication");
        release
            .send(())
            .expect("the prior resolution should still await release");
        entry
    };
    let (old, new) = timeout(Duration::from_secs(1), async { tokio::join!(old, new) })
        .await
        .expect("independent lifetime keys should not block each other's resolution");
    let old = old
        .expect("the prior admitted resolution should finish")
        .expect("the prior resolution should return its publication");
    assert!(!Arc::ptr_eq(&old, &new));
    for (epoch, expected) in [(&fixture.epoch, old), (&epoch, new)] {
        let held = fixture
            .cache
            .entries
            .get(&CacheKey::new(epoch, actor, None))
            .await
            .expect("each lifetime should retain its own publication");
        assert!(Arc::ptr_eq(&held, &expected));
        assert_eq!(held.resolved_at, fixture.now);
    }
}

/// Reopening the same generation does not refresh or resolve its previous delta lifetime.
#[tokio::test]
async fn resolve_reopened_retired() {
    let fixture = Fixture::new("cache-resolve-reopened-retired");
    let (_world, epoch) = reopened(&fixture.files);
    assert_eq!(epoch.generation(), fixture.epoch.generation());
    assert_ne!(epoch.reference().id, fixture.epoch.reference().id);
    let key = || CacheKey::new(&fixture.epoch, fixture.actor, None);
    let held = fixture.seed(key(), fixture.cache.limits.soft).await;
    let answer = fixture
        .cache
        .resolve(&epoch, key(), fixture.now, forbidden)
        .await
        .expect("a previous lifetime lookup should not fail")
        .expect("the unexpired publication should remain usable");
    assert!(Arc::ptr_eq(&answer, &held));
    assert!(!held.refreshing.load(Ordering::Acquire));

    fixture.seed(key(), HARD).await;
    let expired = fixture
        .cache
        .resolve(&epoch, key(), fixture.now, forbidden)
        .await
        .expect("the expired lifetime should not resolve again");
    assert!(expired.is_none());
    fixture.absent(&key()).await;
    let missing = fixture
        .cache
        .resolve(&epoch, key(), fixture.now, forbidden)
        .await
        .expect("a previous lifetime miss should not resolve again");
    assert!(missing.is_none());
}

#[tokio::test]
async fn resolve_stale_retired() {
    let fixture = Fixture::new("cache-resolve-stale-retired");
    let key = || fixture.key(fixture.retired);
    let held = fixture.seed(key(), fixture.cache.limits.soft).await;
    let answer = fixture
        .cache
        .resolve(&fixture.epoch, key(), fixture.now, forbidden)
        .await
        .expect("the retired lookup should not fail")
        .expect("the unexpired entry should remain usable");

    assert!(
        Arc::ptr_eq(&answer, &held),
        "the lookup should preserve its publication"
    );
    assert!(
        !held.refreshing.load(Ordering::Acquire),
        "an ineligible lookup should leave refresh unclaimed"
    );
}

#[tokio::test(start_paused = true)]
async fn resolve_reactivated() {
    let fixture = Fixture::new("cache-resolve-reactivated");
    let other = other_epoch(&fixture.files);
    assert_ne!(
        other.generation(),
        fixture.epoch.generation(),
        "the epochs should name different generations"
    );
    let key = || fixture.key(fixture.epoch.generation());
    let held = fixture.seed(key(), fixture.cache.limits.soft).await;

    let retired = fixture
        .cache
        .resolve(&other, key(), fixture.now, forbidden)
        .await
        .expect("the retired lookup should not fail")
        .expect("the unexpired entry should remain usable under the other epoch");
    assert!(
        Arc::ptr_eq(&retired, &held),
        "the other generation should reuse the held publication"
    );

    let (announce, started) = oneshot::channel();
    let resolver = async move |epoch: &Epoch| {
        announce
            .send(())
            .expect("the lookup should await refresh startup");
        refusing(epoch).await
    };
    let active = fixture
        .cache
        .resolve(&fixture.epoch, key(), fixture.now, resolver)
        .await
        .expect("the active lookup should not fail")
        .expect("the active lookup should return the held entry");
    assert!(
        Arc::ptr_eq(&active, &held),
        "a refresh should preserve the immediate answer"
    );
    timeout(Duration::from_secs(1), started)
        .await
        .expect("refresh startup should not stall")
        .expect("reactivation should launch the eligible refresh");
    assert!(
        !held.refreshing.load(Ordering::Acquire),
        "a failed refresh should release its claim"
    );
}

/// At `HARD` age, public resolution removes the retired entry and returns no value.
#[tokio::test]
async fn resolve_expired_retired() {
    let fixture = Fixture::new("cache-resolve-expired-retired");
    let key = || fixture.key(fixture.retired);
    fixture.absent(&key()).await;
    fixture.seed(key(), HARD).await;

    let answer = fixture
        .cache
        .resolve(&fixture.epoch, key(), fixture.now, forbidden)
        .await
        .expect("a retired lookup should not fail");

    assert!(
        answer.is_none(),
        "a retired expired entry should not escape the cache"
    );
    fixture.absent(&key()).await;
}

/// The compute helper reuses a soft-stale entry one nanosecond before expiration.
#[tokio::test]
async fn compute_unexpired_active() {
    let fixture = Fixture::new("cache-compute-unexpired-active");
    let key = || fixture.key(fixture.epoch.generation());
    fixture.absent(&key()).await;
    let age = HARD
        .checked_sub(Duration::from_nanos(1))
        .expect("the expiry interval should exceed one nanosecond");
    let held = fixture.seed(key(), age).await;

    let answer = fixture
        .cache
        .get_or_insert_with(&fixture.epoch, key(), fixture.now, forbidden)
        .await
        .expect("an unexpired lookup should not fail")
        .expect("the held entry should remain usable");

    assert!(
        Arc::ptr_eq(&answer, &held),
        "reuse should preserve the held publication"
    );
}

/// An unexpired entry remains reusable under a different generation's epoch.
#[tokio::test]
async fn compute_unexpired_retired() {
    let fixture = Fixture::new("cache-compute-unexpired-retired");
    let key = || fixture.key(fixture.retired);
    fixture.absent(&key()).await;
    let age = HARD
        .checked_sub(Duration::from_nanos(1))
        .expect("the expiry interval should exceed one nanosecond");
    let held = fixture.seed(key(), age).await;

    let answer = fixture
        .cache
        .get_or_insert_with(&fixture.epoch, key(), fixture.now, forbidden)
        .await
        .expect("an unexpired lookup should not fail")
        .expect("the held entry should remain usable before expiration");

    assert!(
        Arc::ptr_eq(&answer, &held),
        "reuse should preserve the held publication"
    );
}

/// An active-generation miss resolves and retains the supplied timestamp.
#[tokio::test]
async fn resolve_missing_active() {
    let fixture = Fixture::new("cache-resolve-missing-active");
    let key = || fixture.key(fixture.epoch.generation());
    fixture.absent(&key()).await;

    let answer = fixture
        .cache
        .resolve(&fixture.epoch, key(), fixture.now, resolving!(fixture))
        .await
        .expect("an active miss should not fail")
        .expect("an active miss should resolve a new entry");

    assert_eq!(answer.resolved_at, fixture.now);
    let retained = fixture
        .cache
        .entries
        .get(&key())
        .await
        .expect("the new entry should remain cached");
    assert!(Arc::ptr_eq(&answer, &retained));
}

/// A retired-generation miss returns no entry without invoking the resolver.
#[tokio::test]
async fn resolve_missing_retired() {
    let fixture = Fixture::new("cache-resolve-missing-retired");
    let key = || fixture.key(fixture.retired);
    fixture.absent(&key()).await;

    let answer = fixture
        .cache
        .resolve(&fixture.epoch, key(), fixture.now, forbidden)
        .await
        .expect("a retired miss should not fail");

    assert!(answer.is_none(), "a retired miss should remain absent");
    fixture.absent(&key()).await;
}

/// A failed resolution propagates its error instead of falling back to an expired entry.
#[tokio::test]
async fn resolve_resolver_failure() {
    let fixture = Fixture::new("cache-resolve-resolver-failure");
    let key = || fixture.key(fixture.epoch.generation());
    fixture.absent(&key()).await;
    fixture.seed(key(), HARD).await;

    let error = fixture
        .cache
        .resolve(&fixture.epoch, key(), fixture.now, refusing)
        .await
        .expect_err("resolution failure should propagate without an expired fallback");

    assert_eq!(error, "permission resolution failed");
}

/// An expired entry inserted after a miss requires a new active-generation resolution.
#[tokio::test]
async fn compute_expired_active() {
    let fixture = Fixture::new("cache-compute-expired-active");
    let key = || fixture.key(fixture.epoch.generation());
    fixture.absent(&key()).await;
    let expired = fixture.seed(key(), HARD).await;

    let answer = fixture
        .cache
        .get_or_insert_with(&fixture.epoch, key(), fixture.now, resolving!(fixture))
        .await
        .expect("an active compute should not fail")
        .expect("the expired entry should yield a new resolution");

    assert!(
        !Arc::ptr_eq(&answer, &expired),
        "resolution should replace the expired publication"
    );
    assert_ne!(answer.publication, expired.publication);
    assert_eq!(answer.resolved_at, fixture.now);
    let retained = fixture
        .cache
        .entries
        .get(&key())
        .await
        .expect("the replacement should remain cached");
    assert!(Arc::ptr_eq(&answer, &retained));
}

/// An expired entry inserted after a miss disappears without renewing its retired generation.
#[tokio::test]
async fn compute_expired_retired() {
    let fixture = Fixture::new("cache-compute-expired-retired");
    let key = || fixture.key(fixture.retired);
    fixture.absent(&key()).await;
    fixture.seed(key(), HARD).await;

    let answer = fixture
        .cache
        .get_or_insert_with(&fixture.epoch, key(), fixture.now, forbidden)
        .await
        .expect("a retired compute should not fail");

    assert!(
        answer.is_none(),
        "an expired entry should not escape the retired-generation compute"
    );
    fixture.absent(&key()).await;
}
