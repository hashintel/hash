use core::cell::Cell;

use hashql_core::id::Id as _;
use uuid::Uuid;

use super::{
    DeltaIdentityProvider, DeltaRevision, DeltaRowId, EntryKind, History, IdentityProviderResidual,
    NaiveIdentityProvider, Versioned, VersionedIdentityProvider,
};
use crate::{
    dataset::auxiliary::{Icon, OwnedIcon},
    identity::OntologyRowId,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::fit::prepare::IdentityProvider,
    serve::{codec::RowDomain, delta::history::CAPACITY as HISTORY_SIZE},
};

/// A single-row ontology identity provider that counts its payload reads.
struct Base {
    key: ArchivedOntologyTypeUuid,
    key_reads: Cell<usize>,
    row_reads: Cell<usize>,
}

impl Base {
    /// Builds a single-row provider whose row 0 resolves to a fixed key with icon `"base"`.
    const fn new() -> Self {
        Self {
            key: ArchivedOntologyTypeUuid::from(Uuid::from_u128(1)),
            key_reads: Cell::new(0),
            row_reads: Cell::new(0),
        }
    }
}

impl IdentityProvider<ArchivedOntologyTypeUuid, OntologyRowId> for Base {
    fn count(&self) -> usize {
        1
    }

    fn key_of(&self, row: OntologyRowId) -> Option<ArchivedOntologyTypeUuid> {
        (row == OntologyRowId::new(0)).then_some(self.key)
    }

    fn row_of(&self, key: ArchivedOntologyTypeUuid) -> Option<OntologyRowId> {
        (key == self.key).then_some(OntologyRowId::new(0))
    }

    /// Resolves the fixed key's payload, counting the read in `key_reads`.
    fn payload_of_key(&self, key: ArchivedOntologyTypeUuid) -> Option<&Icon> {
        self.key_reads.set(self.key_reads.get() + 1);
        (key == self.key).then_some(Icon::new("base"))
    }

    /// Resolves row 0's payload via [`Self::key_of`], counting the read in `row_reads`.
    fn payload_of_row(&self, row: OntologyRowId) -> Option<&Icon> {
        self.row_reads.set(self.row_reads.get() + 1);
        self.key_of(row).map(|_| Icon::new("base"))
    }
}

/// An [`IdentityProviderResidual`] specialized to ontology rows and icons, for these tests.
type IconResidual = IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon>;

/// Records an added key at the supplied `birth` revision.
///
/// This bypasses [`IdentityProviderResidual::insert`].
///
/// # Panics
///
/// Panics if the residual row domain has no free row.
fn add_arrival(
    data: &mut IconResidual,
    birth: DeltaRevision,
) -> (ArchivedOntologyTypeUuid, OntologyRowId) {
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (universe, row) = data.domain.grow().expect("should have a free row");
    data.domain = universe;
    data.forward.insert(key, row);
    data.inverse.push(Versioned::new(key, birth));
    data.payload.insert(key, OwnedIcon::from("arrival"));
    (key, row)
}

/// Checks that `key` and `row` resolve bidirectionally to `payload` at `revision`.
///
/// Both key- and row-based payload paths must agree. `None` requires every path to report absence.
///
/// # Panics
///
/// Panics if any lookup differs from `payload` or breaks the key-row correspondence.
#[track_caller]
fn assert_at(
    provider: &(impl VersionedIdentityProvider<ArchivedOntologyTypeUuid, OntologyRowId> + ?Sized),
    key: ArchivedOntologyTypeUuid,
    row: OntologyRowId,
    revision: DeltaRevision,
    payload: Option<&str>,
) {
    assert_eq!(
        provider.provide_key_of_at(row, revision),
        payload.map(|_| key)
    );
    assert_eq!(
        provider.provide_row_of_at(key, revision),
        payload.map(|_| row)
    );
    assert_eq!(
        provider
            .provide_payload_of_key_at(key, revision)
            .map(Icon::as_ref),
        payload
    );
    assert_eq!(
        provider
            .provide_payload_of_row_at(row, revision)
            .map(Icon::as_ref),
        payload
    );
}

/// Checks that `key` and `row` currently resolve bidirectionally to `payload`.
///
/// Both key- and row-based payload paths must agree. `None` requires every path to report absence.
///
/// # Panics
///
/// Panics if any lookup differs from `payload` or breaks the key-row correspondence.
#[track_caller]
fn assert_current(
    provider: &(impl IdentityProvider<ArchivedOntologyTypeUuid, OntologyRowId> + ?Sized),
    key: ArchivedOntologyTypeUuid,
    row: OntologyRowId,
    payload: Option<&str>,
) {
    assert_eq!(provider.key_of(row), payload.map(|_| key));
    assert_eq!(provider.row_of(key), payload.map(|_| row));
    assert_eq!(provider.payload_of_key(key).map(Icon::as_ref), payload);
    assert_eq!(provider.payload_of_row(row).map(Icon::as_ref), payload);
}

/// Exposes allocated keys and rejects unknown rows through both provider forms.
#[test]
fn allocated_base() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    assert_eq!(
        VersionedIdentityProvider::provide_allocated_key_of(&origin, OntologyRowId::MIN),
        Some(base.key),
        "should forward the allocated key through a provider reference"
    );
    assert_eq!(
        origin.provide_allocated_key_of(OntologyRowId::MAX),
        None,
        "should reject an unallocated row"
    );
}

/// Hides base and delta rows on withdrawal without erasing their allocated keys.
#[test]
fn allocated_hidden() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (row, _) = data
        .insert(
            origin,
            DeltaRevision::new(1),
            key,
            OwnedIcon::from("arrival"),
        )
        .expect("should allocate a delta row");
    assert!(
        data.withdraw(origin, DeltaRevision::new(2), base.key),
        "should withdraw the base row"
    );
    assert!(
        data.withdraw(origin, DeltaRevision::new(2), key),
        "should withdraw the delta row"
    );
    let provider = DeltaIdentityProvider::from_parts(&data, origin);
    for (row, key) in [(OntologyRowId::MIN, base.key), (row, key)] {
        assert_eq!(provider.key_of(row), None, "should hide the withdrawn row");
        assert_eq!(
            provider.provide_allocated_key_of(row),
            Some(key),
            "should retain the withdrawn row's allocated key"
        );
    }
    assert_eq!(provider.provide_allocated_key_of(OntologyRowId::MAX), None);
}

/// Records only a payload update for a fitted row, without allocating a delta row.
///
/// A later insertion replaces the payload while leaving the residual domain unchanged.
#[test]
fn insert_fitted() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let row = OntologyRowId::new(0);
    assert_eq!(
        data.insert(
            origin,
            DeltaRevision::new(1),
            base.key,
            OwnedIcon::from("base")
        ),
        Some((row, false))
    );
    assert!(data.payload.is_empty());
    assert_eq!(
        data.insert(
            origin,
            DeltaRevision::new(2),
            base.key,
            OwnedIcon::from("updated")
        ),
        Some((row, true))
    );
    assert_eq!(data.domain.size(), 1);
    assert!(data.inverse.is_empty());
    let provider = DeltaIdentityProvider::from_parts(&data, origin);
    assert_current(&provider, base.key, row, Some("updated"));
}

/// Allocates one stable row for a newly inserted key.
///
/// Repeating the same payload at a later revision reports no change. The row is absent before its
/// birth revision.
#[test]
fn insert_arrival() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(&base);
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let row = OntologyRowId::new(1);
    assert_eq!(
        data.insert(
            &base,
            DeltaRevision::new(4),
            key,
            OwnedIcon::from("arrival")
        ),
        Some((row, true))
    );
    assert_eq!(
        data.insert(
            &base,
            DeltaRevision::new(5),
            key,
            OwnedIcon::from("arrival")
        ),
        Some((row, false))
    );
    assert_eq!(data.domain.size(), 2);
    assert_eq!(data.inverse.len(), 1);
    let provider = DeltaIdentityProvider::from_parts(&data, &base);
    assert_current(&provider, key, row, Some("arrival"));
    assert_at(&provider, key, row, DeltaRevision::new(3), None);
    assert_at(&provider, key, row, DeltaRevision::new(4), Some("arrival"));
}

/// Reuses an added row across withdrawal and revival.
///
/// An added key can be withdrawn and later revived on the same row with a new payload. The row
/// resolves through each visibility and payload transition at its matching revision.
#[test]
fn insert_revival() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(&base);
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (row, _) = data
        .insert(
            &base,
            DeltaRevision::new(4),
            key,
            OwnedIcon::from("arrival"),
        )
        .expect("should allocate an arrival row");
    assert!(data.withdraw(&base, DeltaRevision::new(7), key));
    assert!(!data.withdraw(&base, DeltaRevision::new(8), key));
    assert_eq!(
        data.insert(&base, DeltaRevision::new(9), key, OwnedIcon::from("latest")),
        Some((row, true))
    );
    assert_eq!(data.domain.size(), 2);
    let provider = DeltaIdentityProvider::from_parts(&data, &base);
    assert_current(&provider, key, row, Some("latest"));
    assert_at(&provider, key, row, DeltaRevision::new(3), None);
    assert_at(&provider, key, row, DeltaRevision::new(4), Some("latest"));
    assert_at(&provider, key, row, DeltaRevision::new(7), None);
    assert_at(&provider, key, row, DeltaRevision::new(9), Some("latest"));
}

/// Reuses a fitted row across withdrawal and reinsertion.
///
/// Withdrawing a fitted row hides it. A repeated withdrawal reports no change, and a later
/// re-insertion with a new payload revives the same row from its revival revision onward.
#[test]
fn withdraw_fitted() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let row = OntologyRowId::new(0);
    assert!(data.withdraw(origin, DeltaRevision::new(2), base.key));
    assert!(!data.withdraw(origin, DeltaRevision::new(3), base.key));
    assert_eq!(
        data.insert(
            origin,
            DeltaRevision::new(4),
            base.key,
            OwnedIcon::from("base")
        ),
        Some((row, true))
    );
    assert_eq!(data.domain.size(), 1);
    let provider = DeltaIdentityProvider::from_parts(&data, origin);
    assert_at(&provider, base.key, row, DeltaRevision::new(2), None);
    assert_at(
        &provider,
        base.key,
        row,
        DeltaRevision::new(4),
        Some("base"),
    );
}

/// Leaves all residual state unchanged when row allocation has no capacity.
///
/// The residual can still insert a fitted key already inside the domain.
#[test]
fn insert_exhausted() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    data.domain = RowDomain::new(OntologyRowId::MAX);
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    assert_eq!(
        data.insert(
            origin,
            DeltaRevision::new(1),
            key,
            OwnedIcon::from("arrival")
        ),
        None
    );
    assert_eq!(data.domain, RowDomain::new(OntologyRowId::MAX));
    assert!(data.forward.is_empty());
    assert!(data.inverse.is_empty());
    assert!(data.payload.is_empty());
    assert_eq!(
        data.insert(
            origin,
            DeltaRevision::new(2),
            base.key,
            OwnedIcon::from("updated")
        ),
        Some((OntologyRowId::new(0), true))
    );
}

/// Retains one residual row through an added key's insertion, withdrawal and revival.
///
/// The base remains constant, and each step writes to that row's delta index.
#[test]
fn withdraw_added_constant_base() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(&base);
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (row, _) = data
        .insert(
            &base,
            DeltaRevision::new(1),
            key,
            OwnedIcon::from("arrival"),
        )
        .expect("should allocate an arrival row");
    assert_eq!(row, OntologyRowId::new(1));
    assert_eq!(data.forward.get(&key), Some(&row));
    assert!(
        data.inverse[DeltaRowId::new(0)].is_live(None),
        "should record the arrival live"
    );

    assert!(
        data.withdraw(&base, DeltaRevision::new(2), key),
        "should withdraw the added key"
    );
    assert!(
        !data.inverse[DeltaRowId::new(0)].is_live(None),
        "should record the withdrawal on the added row"
    );
    assert!(
        !data.withdraw(&base, DeltaRevision::new(3), key),
        "should leave a repeated withdrawal unchanged"
    );

    assert_eq!(
        data.insert(
            &base,
            DeltaRevision::new(4),
            key,
            OwnedIcon::from("arrival")
        ),
        Some((row, true)),
        "should revive the added key on its row"
    );
    assert!(data.inverse[DeltaRowId::new(0)].is_live(None));
    assert_eq!(data.domain.size(), 2, "should allocate no second row");
    let provider = DeltaIdentityProvider::from_parts(&data, &base);
    assert_at(&provider, key, row, DeltaRevision::new(2), None);
    assert_at(&provider, key, row, DeltaRevision::new(4), Some("arrival"));
}

/// Panics on withdrawal after the base domain grows past an added residual row.
///
/// The upper residual snapshots the lower's domain. After the lower allocates a row, the upper
/// allocates its own row at the stale bound. The lower now reports a domain past that row.
#[test]
#[should_panic(expected = "an added identity row must follow the fitted rows")]
fn withdraw_added_grown_base() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut lower_data = IdentityProviderResidual::new(&base);
    let lower = DeltaIdentityProvider::from_parts(&lower_data, &base);
    let mut upper_data = IdentityProviderResidual::new(&lower);
    assert_eq!(upper_data.domain.size(), 1);

    let _arrival = add_arrival(&mut lower_data, DeltaRevision::new(1));
    let lower = DeltaIdentityProvider::from_parts(&lower_data, &base);
    assert_eq!(lower.provide_domain().size(), 2);

    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(3));
    let (row, _) = upper_data
        .insert(&lower, DeltaRevision::new(2), key, OwnedIcon::from("upper"))
        .expect("should allocate at the stale bound");
    assert_eq!(
        row,
        OntologyRowId::new(1),
        "should allocate at the snapshotted bound"
    );

    let _changed = upper_data.withdraw(&lower, DeltaRevision::new(3), key);
}

/// Revives a base-withdrawn key in an upper delta without reallocating it.
///
/// The row resolves through the upper payload at its birth revision while remaining absent from
/// the base layer's current state.
#[test]
fn insert_hidden_origin() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut lower_data = IdentityProviderResidual::new(&base);
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (row, _) = lower_data
        .insert(
            &base,
            DeltaRevision::new(4),
            key,
            OwnedIcon::from("arrival"),
        )
        .expect("should allocate the lower row");
    assert!(lower_data.withdraw(&base, DeltaRevision::new(7), key));
    let lower = DeltaIdentityProvider::from_parts(&lower_data, &base);
    let mut upper_data = IdentityProviderResidual::new(&lower);
    assert_eq!(
        upper_data.insert(
            &lower,
            DeltaRevision::new(8),
            key,
            OwnedIcon::from("updated")
        ),
        Some((row, true))
    );
    assert_eq!(upper_data.domain.size(), 2);
    assert!(upper_data.forward.is_empty());
    assert!(upper_data.inverse.is_empty());
    let upper = DeltaIdentityProvider::from_parts(&upper_data, &lower);
    assert_eq!(upper.provide_allocated_row_of(key), Some(row));
    assert_current(&upper, key, row, None);
    assert_at(&upper, key, row, DeltaRevision::new(4), Some("updated"));
}

/// Delegates unmodified fitted-row payload reads to the base.
///
/// The lookups count as base reads. An unallocated row resolves to no payload.
#[test]
fn payload_base() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let data = IdentityProviderResidual::new(origin);
    let provider = DeltaIdentityProvider::from_parts(&data, origin);

    assert_eq!(
        provider.payload_of_key(base.key).map(Icon::as_ref),
        Some("base")
    );
    assert_eq!(
        provider
            .payload_of_row(OntologyRowId::new(0))
            .map(Icon::as_ref),
        Some("base")
    );
    assert_eq!(base.key_reads.get(), 1);
    assert_eq!(base.row_reads.get(), 1);
    assert_eq!(provider.payload_of_row(OntologyRowId::new(1)), None);
}

/// Reads residual payload overrides without consulting the base.
///
/// This covers fitted-key overrides and newly inserted keys. An unallocated row remains absent.
#[test]
fn payload_replacements() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let arrival = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (domain, row) = data.domain.grow().expect("should have a free row");
    data.domain = domain;
    data.inverse
        .push(Versioned::new(arrival, DeltaRevision::new(4)));
    data.forward.insert(arrival, row);
    data.payload.insert(base.key, OwnedIcon::from("updated"));
    data.payload.insert(arrival, OwnedIcon::from("arrival"));
    let provider = DeltaIdentityProvider::from_parts(&data, origin);

    assert_eq!(provider.count(), 2);
    for (row, key, text) in [
        (OntologyRowId::new(0), base.key, "updated"),
        (row, arrival, "arrival"),
    ] {
        assert_eq!(provider.key_of(row), Some(key));
        assert_eq!(provider.row_of(key), Some(row));
        assert_eq!(provider.payload_of_key(key).map(Icon::as_ref), Some(text));
        assert_eq!(provider.payload_of_row(row).map(Icon::as_ref), Some(text));
    }
    assert_eq!(base.key_reads.get(), 0);
    assert_eq!(base.row_reads.get(), 0);
    assert_eq!(provider.key_of(OntologyRowId::new(2)), None);
}

/// Tracks an added row's current payload through its visibility history.
///
/// Birth initially exposes the first payload. After replacement during withdrawal, every live
/// revision returns the replacement, and revival makes the row currently visible again.
#[test]
fn arrival_lifetime() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(&base);
    let (key, row) = add_arrival(&mut data, DeltaRevision::new(4));
    {
        let provider = DeltaIdentityProvider::from_parts(&data, &base);
        assert_current(&provider, key, row, Some("arrival"));
        assert_at(&provider, key, row, DeltaRevision::new(3), None);
        assert_at(&provider, key, row, DeltaRevision::new(4), Some("arrival"));
    }

    data.inverse[DeltaRowId::new(0)].push(EntryKind::Withdrawn, DeltaRevision::new(7));
    data.payload.insert(key, OwnedIcon::from("latest"));
    {
        let provider = DeltaIdentityProvider::from_parts(&data, &base);
        assert_eq!(provider.count(), 2);
        assert_current(&provider, key, row, None);
        assert_at(&provider, key, row, DeltaRevision::new(3), None);
        assert_at(&provider, key, row, DeltaRevision::new(4), Some("latest"));
        assert_at(&provider, key, row, DeltaRevision::new(6), Some("latest"));
        assert_at(&provider, key, row, DeltaRevision::new(7), None);
    }

    data.inverse[DeltaRowId::new(0)].push(EntryKind::Live, DeltaRevision::new(9));
    let provider = DeltaIdentityProvider::from_parts(&data, &base);
    assert_current(&provider, key, row, Some("latest"));
    assert_at(&provider, key, row, DeltaRevision::new(3), None);
    assert_at(&provider, key, row, DeltaRevision::new(4), Some("latest"));
    assert_at(&provider, key, row, DeltaRevision::new(8), None);
    assert_at(&provider, key, row, DeltaRevision::new(9), Some("latest"));
    let unknown = ArchivedOntologyTypeUuid::from(Uuid::from_u128(99));
    assert_at(
        &provider,
        unknown,
        OntologyRowId::new(2),
        DeltaRevision::new(9),
        None,
    );
}

/// Tracks a fitted row's visibility independently of its payload.
///
/// Direct history overrides hide the row while withdrawn. Every live revision exposes the current
/// payload, including those preceding its replacement.
#[test]
fn base_lifetime() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let row = OntologyRowId::new(0);
    data.history.insert(
        row,
        History::new(EntryKind::Withdrawn, DeltaRevision::new(5)),
    );
    data.payload.insert(base.key, OwnedIcon::from("latest"));
    {
        let provider = DeltaIdentityProvider::from_parts(&data, origin);
        assert_current(&provider, base.key, row, None);
        assert_at(
            &provider,
            base.key,
            row,
            DeltaRevision::new(0),
            Some("latest"),
        );
        assert_at(
            &provider,
            base.key,
            row,
            DeltaRevision::new(4),
            Some("latest"),
        );
        assert_at(&provider, base.key, row, DeltaRevision::new(5), None);
    }
    data.history
        .get_mut(&row)
        .expect("should retain the row history")
        .push(EntryKind::Live, DeltaRevision::new(9));
    let provider = DeltaIdentityProvider::from_parts(&data, origin);
    assert_current(&provider, base.key, row, Some("latest"));
    assert_at(&provider, base.key, row, DeltaRevision::new(8), None);
    assert_at(
        &provider,
        base.key,
        row,
        DeltaRevision::new(9),
        Some("latest"),
    );
}

/// Preserves a fitted row's origin after visibility history rolls over.
///
/// Once retention evicts the initial withdrawal, its revision falls back to the visible base row
/// and the residual's current payload. The latest retained withdrawal still controls the current
/// state.
#[test]
fn base_origin_rollover() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let row = OntologyRowId::new(0);
    let mut history = History::new(EntryKind::Withdrawn, DeltaRevision::new(2));
    let capacity = u64::try_from(HISTORY_SIZE).expect("should fit the history size");
    let end = 2 + 2 * capacity;
    for offset in 1..=capacity {
        let revision = 2 + 2 * offset;
        assert!(history.push(EntryKind::Live, DeltaRevision::new(revision - 1)));
        assert!(history.push(EntryKind::Withdrawn, DeltaRevision::new(revision)));
    }
    assert_eq!(history.at(DeltaRevision::new(2)), None);
    data.history.insert(row, history);
    data.payload.insert(base.key, OwnedIcon::from("latest"));
    let provider = DeltaIdentityProvider::from_parts(&data, origin);
    assert_current(&provider, base.key, row, None);
    assert_at(
        &provider,
        base.key,
        row,
        DeltaRevision::new(2),
        Some("latest"),
    );
    assert_at(&provider, base.key, row, DeltaRevision::new(end), None);
}

/// Preserves an added row's birth after visibility history rolls over.
///
/// Birth remains separate after retention evicts old visibility decisions. The initial
/// withdrawal's revision falls back to birth-based liveness, while the latest retained withdrawal
/// controls current state.
#[test]
fn arrival_origin_rollover() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(&base);
    let (key, row) = add_arrival(&mut data, DeltaRevision::new(1));
    let entry = &mut data.inverse[DeltaRowId::new(0)];
    assert!(entry.push(EntryKind::Withdrawn, DeltaRevision::new(2)));
    let capacity = u64::try_from(HISTORY_SIZE).expect("should fit the history size");
    let end = 2 + 2 * capacity;
    for offset in 1..=capacity {
        let revision = 2 + 2 * offset;
        assert!(entry.push(EntryKind::Live, DeltaRevision::new(revision - 1)));
        assert!(entry.push(EntryKind::Withdrawn, DeltaRevision::new(revision)));
    }
    data.payload.insert(key, OwnedIcon::from("latest"));
    let provider = DeltaIdentityProvider::from_parts(&data, &base);
    assert_current(&provider, key, row, None);
    assert_at(&provider, key, row, DeltaRevision::new(0), None);
    assert_at(&provider, key, row, DeltaRevision::new(1), Some("latest"));
    assert_at(&provider, key, row, DeltaRevision::new(2), Some("latest"));
    assert_at(&provider, key, row, DeltaRevision::new(end), None);
}

/// Prefers an upper delta's visibility at overlapping revisions.
///
/// An upper layer's own visibility history for a lower-layer added row takes precedence over the
/// lower layer's history at revisions where both apply, while earlier revisions still resolve
/// through the lower layer alone.
#[test]
fn nested_origin_revision() {
    let base = Base::new();
    let base = NaiveIdentityProvider::from_ref(&base);
    let mut lower_data = IdentityProviderResidual::new(&base);
    let (key, row) = add_arrival(&mut lower_data, DeltaRevision::new(4));
    lower_data.inverse[DeltaRowId::new(0)].push(EntryKind::Withdrawn, DeltaRevision::new(7));
    lower_data
        .payload
        .insert(key, OwnedIcon::from("lower latest"));
    let lower = DeltaIdentityProvider::from_parts(&lower_data, &base);
    let mut upper_data = IdentityProviderResidual::new(&lower);
    {
        let upper = DeltaIdentityProvider::from_parts(&upper_data, &lower);
        assert_eq!(upper.provide_domain().size(), 2);
        assert_current(&upper, key, row, None);
        assert_at(&upper, key, row, DeltaRevision::new(3), None);
        assert_at(
            &upper,
            key,
            row,
            DeltaRevision::new(4),
            Some("lower latest"),
        );
        assert_at(&upper, key, row, DeltaRevision::new(7), None);
    }
    upper_data.history.insert(
        row,
        History::new(EntryKind::Withdrawn, DeltaRevision::new(5)),
    );
    upper_data
        .payload
        .insert(key, OwnedIcon::from("upper latest"));
    let upper = DeltaIdentityProvider::from_parts(&upper_data, &lower);
    assert_at(
        &upper,
        key,
        row,
        DeltaRevision::new(4),
        Some("upper latest"),
    );
    assert_at(&upper, key, row, DeltaRevision::new(5), None);
}

/// Preserves [`NaiveIdentityProvider::from_ref`] behavior through borrowed unsized erasure.
///
/// This holds at the domain's minimum and maximum revisions.
#[test]
fn naive_borrowed_unsized() {
    let base = Base::new();
    let row = OntologyRowId::new(0);
    let erased: &dyn IdentityProvider<ArchivedOntologyTypeUuid, OntologyRowId> = &base;
    let provider = NaiveIdentityProvider::from_ref(erased);
    assert_at(provider, base.key, row, DeltaRevision::new(0), Some("base"));
    assert_at(
        provider,
        base.key,
        row,
        DeltaRevision::new(u64::MAX),
        Some("base"),
    );
}
