use crate::salt::{
    revision::{BaseRevision, DataRevision, DeltaRevision},
    storage::read::{
        BaseReader, DeltaReader, DisabledMergedReader, DisabledReadError, IncrementalMode,
        KeyedRecord, MergedReader,
    },
};

#[derive(Debug, PartialEq, Eq)]
struct Row {
    key: u32,
    value: &'static str,
}

impl KeyedRecord for Row {
    type Key = u32;

    fn key(&self) -> &Self::Key {
        &self.key
    }
}

#[derive(Debug, Copy, Clone)]
struct SliceBase<'rows> {
    revision: BaseRevision,
    rows: &'rows [Row],
}

impl BaseReader for SliceBase<'_> {
    type Iter<'reader>
        = core::slice::Iter<'reader, Row>
    where
        Self: 'reader;
    type Record = Row;

    fn revision(&self) -> BaseRevision {
        self.revision
    }

    fn len(&self) -> usize {
        self.rows.len()
    }

    fn get(&self, key: &u32) -> Option<&Row> {
        self.rows.iter().find(|row| row.key() == key)
    }

    fn iter(&self) -> Self::Iter<'_> {
        self.rows.iter()
    }
}

#[test]
fn disabled_reader_delegates_without_allocating_or_copying() {
    let rows = [
        Row {
            key: 1,
            value: "one",
        },
        Row {
            key: 2,
            value: "two",
        },
    ];
    let base = SliceBase {
        revision: BaseRevision::ZERO,
        rows: &rows,
    };
    let merged = DisabledMergedReader::new(base, IncrementalMode::Disabled)
        .expect("should bind an initial base");

    assert_eq!(merged.revision(), DataRevision::ZERO);
    assert_eq!(merged.len(), 2);
    assert!(!merged.is_empty());
    assert_eq!(merged.get(&2).map(|row| row.value), Some("two"));
    assert!(core::ptr::eq(
        merged
            .iter()
            .next()
            .expect("should contain the first base row"),
        &rows[0]
    ));
    assert_eq!(merged.base().revision(), BaseRevision::ZERO);

    let delta = merged.delta();
    assert_eq!(delta.revision(), DeltaRevision::ZERO);
    assert_eq!(delta.len(), 0);
    assert!(delta.is_empty());
    assert!(delta.get(&1).is_none());
    assert_eq!(delta.iter().count(), 0);

    assert_eq!(merged.into_base().rows, &rows);
}

#[test]
fn disabled_reader_rejects_mutation_and_advanced_bases() {
    let rows = [Row {
        key: 1,
        value: "one",
    }];
    let initial = SliceBase {
        revision: BaseRevision::ZERO,
        rows: &rows,
    };
    let advanced = SliceBase {
        revision: BaseRevision::new(1),
        rows: &rows,
    };

    assert!(matches!(
        DisabledMergedReader::new(initial, IncrementalMode::Enabled),
        Err(DisabledReadError::IncrementalModeEnabled)
    ));
    assert!(matches!(
        DisabledMergedReader::new(advanced, IncrementalMode::Disabled),
        Err(DisabledReadError::NonInitialBase { revision })
            if revision == BaseRevision::new(1)
    ));
}

#[test]
fn empty_base_and_delta_produce_an_empty_snapshot() {
    let base = SliceBase {
        revision: BaseRevision::ZERO,
        rows: &[],
    };
    let merged = DisabledMergedReader::new(base, IncrementalMode::default())
        .expect("should bind an empty initial base");

    assert!(merged.is_empty());
    assert_eq!(merged.iter().count(), 0);
    assert!(merged.get(&99).is_none());
}
