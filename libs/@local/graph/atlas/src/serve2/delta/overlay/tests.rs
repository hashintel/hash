use core::cell::Cell;

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
    serve2::delta::history::CAPACITY as HISTORY_SIZE,
};

struct Base {
    key: ArchivedOntologyTypeUuid,
    key_reads: Cell<usize>,
    row_reads: Cell<usize>,
}

impl Base {
    fn new() -> Self {
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

    fn payload_of_key(&self, key: ArchivedOntologyTypeUuid) -> Option<&Icon> {
        self.key_reads.set(self.key_reads.get() + 1);
        (key == self.key).then_some(Icon::new("base"))
    }

    fn payload_of_row(&self, row: OntologyRowId) -> Option<&Icon> {
        self.row_reads.set(self.row_reads.get() + 1);
        self.key_of(row).map(|_| Icon::new("base"))
    }
}

type IconResidual = IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon>;

fn add_arrival(
    data: &mut IconResidual,
    birth: DeltaRevision,
) -> (ArchivedOntologyTypeUuid, OntologyRowId) {
    let key = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (universe, row) = data.universe.grow().expect("should have a free row");
    data.universe = universe;
    data.forward.insert(key, row);
    data.inverse.push(Versioned::new(key, birth));
    data.payload.insert(key, OwnedIcon::from("arrival"));
    (key, row)
}

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

#[test]
fn payload_replacements() {
    let base = Base::new();
    let origin = NaiveIdentityProvider::from_ref(&base);
    let mut data = IdentityProviderResidual::new(origin);
    let arrival = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (universe, row) = data.universe.grow().expect("should have a free row");
    data.universe = universe;
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

#[test]
fn arrival_lifetime() {
    let base = NaiveIdentityProvider::new(Base::new());
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

#[test]
fn arrival_origin_rollover() {
    let base = NaiveIdentityProvider::new(Base::new());
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

#[test]
fn nested_origin_revision() {
    let base = NaiveIdentityProvider::new(Base::new());
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
        assert_eq!(upper.provide_universe().size(), 2);
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

#[test]
fn naive_borrowed_unsized() {
    let mut base = Base::new();
    let row = OntologyRowId::new(0);
    {
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
    let key = base.key;
    {
        let erased: &mut dyn IdentityProvider<ArchivedOntologyTypeUuid, OntologyRowId> = &mut base;
        let provider = NaiveIdentityProvider::from_mut(erased);
        assert_at(provider, key, row, DeltaRevision::new(0), Some("base"));
    }
    let replacement = ArchivedOntologyTypeUuid::from(Uuid::from_u128(3));
    NaiveIdentityProvider::from_mut(&mut base).0.key = replacement;
    assert_eq!(base.key, replacement);
}
