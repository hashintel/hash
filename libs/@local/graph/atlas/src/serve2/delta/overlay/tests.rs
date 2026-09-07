use core::cell::Cell;

use uuid::Uuid;

use super::{DeltaIdentityProvider, IdentityProviderResidual};
use crate::{
    dataset::auxiliary::{Icon, OwnedIcon},
    identity::OntologyRowId,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::fit::prepare::IdentityProvider,
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

#[test]
fn payload_base() {
    let base = Base::new();
    let data = IdentityProviderResidual::new(&base);
    let provider = DeltaIdentityProvider::from_parts(&data, &base);

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
    let mut data = IdentityProviderResidual::new(&base);
    let arrival = ArchivedOntologyTypeUuid::from(Uuid::from_u128(2));
    let (universe, row) = data.universe.grow().expect("should have a free row");
    data.universe = universe;
    data.inverse.push(arrival);
    data.forward.insert(arrival, row);
    data.payload.insert(base.key, OwnedIcon::from("updated"));
    data.payload.insert(arrival, OwnedIcon::from("arrival"));
    let provider = DeltaIdentityProvider::from_parts(&data, &base);

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
