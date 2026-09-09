//! Logical expiry with backing-cache retention held fixed.
//!
//! The backing cache has no TTL. Entries straddle the exact `HARD` boundary at a fixed supplied
//! time. Other-generation keys are synthetic. These checks do not simulate generation promotion.
//! Resolver delay and lock contention are outside their scope.

use alloc::sync::Arc;
use core::time::Duration;
use std::time::Instant;

use arc_swap::Guard;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{
    CacheEntry, CacheKey, PendingCacheEntry, PublicationProducer, VisibilityCache,
    VisibilityLimits, weight_of,
};
use crate::{
    allocator::HeapMemoryUsage as _,
    file::generation::GenerationId,
    serve2::{
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
    _files: TamperFixture,
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
            _files: files,
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
            actor: self.actor,
            filter: None,
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
    let held = fixture.seed(key(), HARD - Duration::from_nanos(1)).await;

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
    let held = fixture.seed(key(), HARD - Duration::from_nanos(1)).await;

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
