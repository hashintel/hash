//! Coherent selection, retention boundaries and the lifetime of a held observation.
//!
//! Supplying each case its own admission instant keeps every deadline exact and every case free
//! of sleeping. One case calls [`UniverseRegistry::observe`] instead, and bounds the timestamp it
//! samples.

use alloc::sync::Arc;
use core::time::Duration;
use std::{fs, time::Instant};

use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};

use super::{Observation, ObserveError, Observer, Runtime, Universe, UniverseRegistry};
use crate::{
    file::{generation::GenerationId, repository::Artifact as _, salt::artifact},
    identity::NodeRowId,
    serve::{
        delta::{Delta, DeltaReader, DeltaReference},
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

    /// Publishes a generation whose unused representations placeholder holds `marker`.
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
}

/// A generation identity no fixture publishes.
fn absent() -> GenerationId {
    "ab".repeat(32)
        .parse()
        .expect("64 hexadecimal digits should name a generation")
}

/// The instant `offset` after `base`.
#[track_caller]
fn after(base: Instant, offset: Duration) -> Instant {
    base.checked_add(offset)
        .expect("the offset should fit the instant's range")
}

/// An observer over `world` with a delta identity drawn from `seed`.
fn observer(world: Arc<World>, seed: u64) -> Observer {
    let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(seed))
        .expect("the seeded RNG should allocate a delta identity");
    let runtime = Runtime {
        world,
        reader: DeltaReader::from(delta),
        feed: None,
    };

    Observer::from(&runtime)
}

/// The delta lifetime an observer publishes.
fn lifetime(observer: &Observer) -> DeltaReference {
    observer.delta.load().reference()
}

#[track_caller]
fn promote(registry: &UniverseRegistry, observer: Observer, now: Instant) {
    assert!(
        registry.promote(observer, now).is_ok(),
        "an open registry should accept the promotion"
    );
}

/// A registry whose second generation displaced the fixture's at the returned instant.
fn displaced_registry(
    fixture: &Fixture,
    replacement: Arc<World>,
    hard: Duration,
) -> (UniverseRegistry, Instant) {
    let registry = UniverseRegistry::new(hard);
    let opened_at = Instant::now();
    promote(
        &registry,
        observer(Arc::clone(&fixture.world), 1),
        opened_at,
    );

    let retired_at = after(opened_at, Duration::from_secs(1));
    promote(&registry, observer(replacement, 2), retired_at);

    (registry, retired_at)
}

/// Checks a selection's world identity, its epoch's generation and a query through the pair.
#[track_caller]
fn assert_universe(universe: &Universe, world: &Arc<World>) {
    assert!(
        Arc::ptr_eq(universe.world(), world),
        "the selection should hold the promoted world"
    );
    assert_eq!(
        universe.epoch().generation(),
        world.generation().id(),
        "the epoch should name its world's generation"
    );
    assert!(
        universe
            .world()
            .layout
            .position(universe.epoch(), NodeRowId::MIN)
            .is_some(),
        "the first node row should have a position at the captured epoch"
    );
}

/// Checks that both sides of `observation` are `world` at `published`.
#[track_caller]
fn assert_matching(observation: &Observation, world: &Arc<World>, published: DeltaReference) {
    assert_universe(observation.present(), world);
    assert_universe(observation.requested(), world);
    assert_eq!(
        observation.present().epoch().reference(),
        published,
        "the active side should carry the promoted lifetime"
    );
    assert_eq!(
        observation.requested().epoch().reference(),
        published,
        "a matching selection should carry the active side's publication"
    );
}

/// An empty registry refuses under [`ObserveError::Empty`] ahead of the request's availability.
#[test]
fn observe_empty() {
    let registry = UniverseRegistry::new(HARD);

    let Err(implicit) = registry.observe(None) else {
        panic!("a registry without an active generation should not admit")
    };
    assert!(
        matches!(implicit, ObserveError::Empty),
        "the refusal should name the missing active generation"
    );

    let Err(explicit) = registry.observe(Some(absent())) else {
        panic!("a registry without an active generation should not admit a request")
    };
    assert!(
        matches!(explicit, ObserveError::Empty),
        "the refusal should name the missing active generation rather than the request"
    );
}

/// A closed registry refuses under [`ObserveError::Closed`] whatever the request names.
#[test]
fn observe_closed() {
    let fixture = Fixture::new("registry-observe-closed");
    let registry = UniverseRegistry::new(HARD);
    promote(
        &registry,
        observer(Arc::clone(&fixture.world), 1),
        Instant::now(),
    );
    registry.close();

    for requested in [None, Some(fixture.world.generation().id())] {
        let Err(error) = registry.observe(requested) else {
            panic!("a closed registry should not admit {requested:?}")
        };
        assert!(
            matches!(error, ObserveError::Closed),
            "the refusal should name closed admission for {requested:?}"
        );
    }
}

/// A request for an unpromoted generation refuses under [`ObserveError::Unavailable`], naming it.
#[test]
fn observe_unknown_generation() {
    let fixture = Fixture::new("registry-observe-unknown-generation");
    let unpromoted = fixture.variant("unknown generation").generation().id();
    let registry = UniverseRegistry::new(HARD);
    promote(
        &registry,
        observer(Arc::clone(&fixture.world), 1),
        Instant::now(),
    );

    let Err(error) = registry.observe(Some(unpromoted)) else {
        panic!("an unpromoted generation should not admit")
    };
    assert!(
        matches!(error, ObserveError::Unavailable(generation) if generation == unpromoted),
        "the refusal should name the requested generation"
    );
}

/// An observation without a request selects the active generation.
#[test]
fn observe_implicit_active() {
    let fixture = Fixture::new("registry-observe-implicit-active");
    let registry = UniverseRegistry::new(HARD);
    let promoted = observer(Arc::clone(&fixture.world), 1);
    let published = lifetime(&promoted);
    promote(&registry, promoted, Instant::now());

    let observation = registry
        .observe(None)
        .expect("an active generation should admit");

    assert_matching(&observation, &fixture.world, published);
}

/// A request naming the active generation selects the active side's publication.
#[test]
fn observe_matching_request() {
    let fixture = Fixture::new("registry-observe-matching-request");
    let registry = UniverseRegistry::new(HARD);
    let promoted = observer(Arc::clone(&fixture.world), 1);
    let published = lifetime(&promoted);
    promote(&registry, promoted, Instant::now());

    let observation = registry
        .observe(Some(fixture.world.generation().id()))
        .expect("the active generation should admit its own request");

    assert_matching(&observation, &fixture.world, published);
}

/// Public admission timestamps the observation between the instants around the call.
#[test]
fn observe_admission_instant() {
    let fixture = Fixture::new("registry-observe-admission-instant");
    let registry = UniverseRegistry::new(HARD);
    promote(
        &registry,
        observer(Arc::clone(&fixture.world), 1),
        Instant::now(),
    );

    let sampled_before = Instant::now();
    let observation = registry
        .observe(None)
        .expect("an active generation should admit");
    let sampled_after = Instant::now();

    assert!(
        observation.admitted_at() >= sampled_before,
        "admission should not precede the instant sampled before the call"
    );
    assert!(
        observation.admitted_at() <= sampled_after,
        "admission should not follow the instant sampled after the call"
    );
}

/// A request for the displaced generation pairs it with the new active generation.
#[test]
fn observe_promoted_pair() {
    let fixture = Fixture::new("registry-observe-promoted-pair");
    let replacement = fixture.variant("promoted pair");
    let registry = UniverseRegistry::new(HARD);

    let opened = observer(Arc::clone(&fixture.world), 1);
    let retired_publication = lifetime(&opened);
    let opened_at = Instant::now();
    promote(&registry, opened, opened_at);

    let promoted = observer(Arc::clone(&replacement), 2);
    let active_publication = lifetime(&promoted);
    let retired_at = after(opened_at, Duration::from_secs(1));
    promote(&registry, promoted, retired_at);
    assert_ne!(
        active_publication, retired_publication,
        "the two generations should publish independent lifetimes"
    );

    let observation = registry
        .observe_at(Some(fixture.world.generation().id()), retired_at)
        .expect("the displaced generation should admit within its retention");

    assert_universe(observation.present(), &replacement);
    assert_universe(observation.requested(), &fixture.world);
    assert_eq!(
        observation.present().epoch().reference(),
        active_publication,
        "the active side should carry the promoted lifetime"
    );
    assert_eq!(
        observation.requested().epoch().reference(),
        retired_publication,
        "the selected side should carry the displaced generation's lifetime"
    );
}

/// The displaced generation admits one nanosecond before its deadline, with no cleanup pass.
#[test]
fn observe_retained_before_expiry() {
    let fixture = Fixture::new("registry-observe-retained-before-expiry");
    let replacement = fixture.variant("retained before expiry");
    let (registry, retired_at) = displaced_registry(&fixture, Arc::clone(&replacement), HARD);
    let age = HARD
        .checked_sub(Duration::from_nanos(1))
        .expect("the retention interval should exceed one nanosecond");

    let observation = registry
        .observe_at(
            Some(fixture.world.generation().id()),
            after(retired_at, age),
        )
        .expect("the displaced generation should admit before its retention elapses");

    assert_universe(observation.requested(), &fixture.world);
    assert_universe(observation.present(), &replacement);
}

/// The displaced generation refuses at its deadline, with no cleanup pass.
#[test]
fn observe_retained_at_expiry() {
    let fixture = Fixture::new("registry-observe-retained-at-expiry");
    let replacement = fixture.variant("retained at expiry");
    let (registry, retired_at) = displaced_registry(&fixture, replacement, HARD);
    let displaced = fixture.world.generation().id();

    let Err(error) = registry.observe_at(Some(displaced), after(retired_at, HARD)) else {
        panic!("the displaced generation should not admit at its deadline")
    };

    assert!(
        matches!(error, ObserveError::Unavailable(generation) if generation == displaced),
        "the refusal should name the expired generation"
    );
}

/// A zero retention interval refuses the displaced generation at its retirement instant.
#[test]
fn observe_zero_retention() {
    let fixture = Fixture::new("registry-observe-zero-retention");
    let replacement = fixture.variant("zero retention");
    let (registry, retired_at) =
        displaced_registry(&fixture, Arc::clone(&replacement), Duration::ZERO);
    let displaced = fixture.world.generation().id();

    let Err(error) = registry.observe_at(Some(displaced), retired_at) else {
        panic!("zero retention should not admit the displaced generation")
    };
    assert!(
        matches!(error, ObserveError::Unavailable(generation) if generation == displaced),
        "the refusal should name the displaced generation"
    );

    let observation = registry
        .observe_at(None, retired_at)
        .expect("zero retention should admit the active generation");
    assert_universe(observation.present(), &replacement);
}

/// Expiry appends the elapsed generation to the caller's list and removes its entry.
#[test]
fn expire_appends_output() {
    let fixture = Fixture::new("registry-expire-appends-output");
    let second = fixture.variant("expire second");
    let third = fixture.variant("expire third");
    let registry = UniverseRegistry::new(HARD);

    let opened_at = Instant::now();
    promote(
        &registry,
        observer(Arc::clone(&fixture.world), 1),
        opened_at,
    );
    let first_retired_at = after(opened_at, Duration::from_secs(1));
    promote(
        &registry,
        observer(Arc::clone(&second), 2),
        first_retired_at,
    );
    let second_retired_at = after(first_retired_at, Duration::from_secs(1));
    promote(
        &registry,
        observer(Arc::clone(&third), 3),
        second_retired_at,
    );

    let deadline = after(first_retired_at, HARD);
    let mut expired = vec![absent()];
    registry.expire(deadline, &mut expired);

    assert_eq!(
        expired,
        [absent(), fixture.world.generation().id()],
        "expiry should append the elapsed generation after the caller's entry"
    );
    registry.expire(deadline, &mut expired);
    assert_eq!(
        expired,
        [absent(), fixture.world.generation().id()],
        "a second pass at the same deadline should find the entry already removed"
    );

    let unexpired = registry
        .observe_at(Some(second.generation().id()), deadline)
        .expect("the generation within its retention should still admit");
    assert_universe(unexpired.requested(), &second);
    assert_universe(unexpired.present(), &third);
}

/// Reactivation drops the retained entry and retires the generation it displaces.
#[test]
fn promote_reactivation() {
    let fixture = Fixture::new("registry-promote-reactivation");
    let replacement = fixture.variant("reactivation");
    let (registry, retired_at) = displaced_registry(&fixture, Arc::clone(&replacement), HARD);

    let reactivated = observer(Arc::clone(&fixture.world), 3);
    let published = lifetime(&reactivated);
    promote(
        &registry,
        reactivated,
        after(retired_at, Duration::from_secs(1)),
    );

    let deadline = after(retired_at, HARD);
    let mut expired = Vec::new();
    registry.expire(deadline, &mut expired);
    assert!(
        expired.is_empty(),
        "reactivation should remove the reactivated generation's retained entry"
    );

    let observation = registry
        .observe_at(Some(replacement.generation().id()), deadline)
        .expect("the newly displaced generation should admit within its own retention");
    assert_universe(observation.present(), &fixture.world);
    assert_universe(observation.requested(), &replacement);
    assert_eq!(
        observation.present().epoch().reference(),
        published,
        "the active side should carry the reactivated lifetime"
    );
}

/// A fresh delta lifetime under the active generation's identity replaces the previous lifetime.
#[test]
fn promote_same_generation() {
    let fixture = Fixture::new("registry-promote-same-generation");
    let replacement = fixture.variant("same generation");
    let registry = UniverseRegistry::new(HARD);

    let opened = observer(Arc::clone(&fixture.world), 1);
    let stale = lifetime(&opened);
    let opened_at = Instant::now();
    promote(&registry, opened, opened_at);

    let restarted = observer(Arc::clone(&fixture.world), 2);
    let current = lifetime(&restarted);
    let restarted_at = after(opened_at, Duration::from_secs(1));
    promote(&registry, restarted, restarted_at);
    assert_ne!(
        stale, current,
        "the two lifetimes should carry independent identities"
    );

    let probed_at = after(restarted_at, HARD);
    let mut expired = Vec::new();
    registry.expire(probed_at, &mut expired);
    assert!(
        expired.is_empty(),
        "the replaced lifetime should hold no retained entry under the active generation"
    );

    let retired_at = after(probed_at, Duration::from_secs(1));
    promote(&registry, observer(replacement, 3), retired_at);
    let observation = registry
        .observe_at(Some(fixture.world.generation().id()), retired_at)
        .expect("the displaced generation should admit within its retention");
    assert_eq!(
        observation.requested().epoch().reference(),
        current,
        "retirement should retain the generation's latest lifetime"
    );
}

/// A closed registry refuses promotion and returns the supplied observer.
#[test]
fn promote_closed() {
    let fixture = Fixture::new("registry-promote-closed");
    let registry = UniverseRegistry::new(HARD);
    registry.close();

    let supplied = observer(Arc::clone(&fixture.world), 1);
    let published = lifetime(&supplied);
    let returned = registry
        .promote(supplied, Instant::now())
        .expect_err("a closed registry should refuse promotion");

    assert!(
        Arc::ptr_eq(&returned.world, &fixture.world),
        "the refusal should return the supplied world"
    );
    assert_eq!(
        lifetime(&returned),
        published,
        "the refusal should return the supplied publication"
    );
}

/// A held observation answers after retirement, cleanup and closure.
#[test]
fn observation_outlives_registry() {
    let fixture = Fixture::new("registry-observation-outlives-registry");
    let replacement = fixture.variant("outlives registry");
    let registry = UniverseRegistry::new(HARD);
    let opened_at = Instant::now();
    let opened = observer(Arc::clone(&fixture.world), 1);
    let published = lifetime(&opened);
    promote(&registry, opened, opened_at);

    let held = registry
        .observe_at(None, opened_at)
        .expect("an active generation should admit");

    let retired_at = after(opened_at, Duration::from_secs(1));
    promote(&registry, observer(replacement, 2), retired_at);
    let mut expired = Vec::new();
    registry.expire(after(retired_at, HARD), &mut expired);
    assert_eq!(
        expired,
        [fixture.world.generation().id()],
        "cleanup should remove the displaced generation"
    );
    registry.close();

    assert_eq!(
        held.admitted_at(),
        opened_at,
        "the observation should keep its supplied admission instant"
    );
    assert_matching(&held, &fixture.world, published);
}
