use super::{DeltaRevision, EntryKind, HISTORY_SIZE, History, Versioned};

pub(in crate::serve::delta) const CAPACITY: usize = HISTORY_SIZE;

#[test]
fn history_boundaries() {
    let mut history = History::new(EntryKind::Withdrawn, DeltaRevision::new(3));
    assert_eq!(history.at(DeltaRevision::new(2)), None);
    assert_eq!(
        history.at(DeltaRevision::new(3)),
        Some(EntryKind::Withdrawn)
    );
    history.push(EntryKind::Live, DeltaRevision::new(7));
    assert_eq!(history.at(DeltaRevision::new(2)), None);
    assert_eq!(
        history.at(DeltaRevision::new(3)),
        Some(EntryKind::Withdrawn)
    );
    assert_eq!(
        history.at(DeltaRevision::new(6)),
        Some(EntryKind::Withdrawn)
    );
    assert_eq!(history.at(DeltaRevision::new(7)), Some(EntryKind::Live));
    assert_eq!(history.at(DeltaRevision::new(8)), Some(EntryKind::Live));
    assert_eq!(history.now(), EntryKind::Live);
}

#[test]
fn history_rollover() {
    let mut history = History::new(EntryKind::Live, DeltaRevision::new(0));
    let end = u64::try_from(HISTORY_SIZE + 3).expect("should fit the history size");
    for revision in 1..=end {
        let kind = if revision.is_multiple_of(2) {
            EntryKind::Live
        } else {
            EntryKind::Withdrawn
        };
        history.push(kind, DeltaRevision::new(revision));
    }
    let first = end - u64::try_from(HISTORY_SIZE).expect("should fit the history size") + 1;
    assert_eq!(history.at(DeltaRevision::new(first - 1)), None);
    for revision in first..=end {
        let kind = if revision.is_multiple_of(2) {
            EntryKind::Live
        } else {
            EntryKind::Withdrawn
        };
        assert_eq!(history.at(DeltaRevision::new(revision)), Some(kind));
    }
    assert_eq!(history.at(DeltaRevision::new(end + 1)), Some(history.now()));
}

#[test]
fn history_unchanged_retention() {
    for initial in [EntryKind::Live, EntryKind::Withdrawn] {
        let next = match initial {
            EntryKind::Live => EntryKind::Withdrawn,
            EntryKind::Withdrawn => EntryKind::Live,
        };
        let mut history = History::new(initial, DeltaRevision::new(3));
        assert!(history.push(next, DeltaRevision::new(5)));
        let end = 6 + u64::try_from(HISTORY_SIZE).expect("should fit the history size");
        for revision in 6..=end {
            assert!(!history.push(next, DeltaRevision::new(revision)));
        }
        assert_eq!(history.at(DeltaRevision::new(2)), None);
        assert_eq!(history.at(DeltaRevision::new(3)), Some(initial));
        assert_eq!(history.at(DeltaRevision::new(4)), Some(initial));
        assert_eq!(history.at(DeltaRevision::new(5)), Some(next));
        assert_eq!(history.at(DeltaRevision::new(end)), Some(next));
        assert_eq!(history.now(), next);
    }
}

#[test]
fn history_same_revision() {
    let mut history = History::new(EntryKind::Live, DeltaRevision::new(3));
    for _ in 0..=HISTORY_SIZE {
        history.push(EntryKind::Live, DeltaRevision::new(5));
        history.push(EntryKind::Withdrawn, DeltaRevision::new(5));
    }
    assert_eq!(history.at(DeltaRevision::new(3)), Some(EntryKind::Live));
    assert_eq!(
        history.at(DeltaRevision::new(5)),
        Some(EntryKind::Withdrawn)
    );
}

#[test]
#[should_panic(expected = "history revisions must be nondecreasing")]
fn history_backwards_revision() {
    let mut history = History::new(EntryKind::Live, DeltaRevision::new(5));
    history.push(EntryKind::Withdrawn, DeltaRevision::new(4));
}

#[test]
fn history_max_revision() {
    let mut history = History::new(EntryKind::Live, DeltaRevision::new(u64::MAX - 1));
    history.push(EntryKind::Withdrawn, DeltaRevision::new(u64::MAX));
    assert_eq!(
        history.at(DeltaRevision::new(u64::MAX - 1)),
        Some(EntryKind::Live)
    );
    assert_eq!(
        history.at(DeltaRevision::new(u64::MAX)),
        Some(EntryKind::Withdrawn)
    );
}

#[test]
fn versioned_birth_rollover() {
    let mut value = Versioned::new("value", DeltaRevision::new(3));
    assert!(value.push(EntryKind::Withdrawn, DeltaRevision::new(4)));
    let capacity = u64::try_from(HISTORY_SIZE).expect("should fit the history size");
    for offset in 1..=capacity {
        let revision = 4 + 2 * offset;
        assert!(value.push(EntryKind::Live, DeltaRevision::new(revision - 1)));
        assert!(value.push(EntryKind::Withdrawn, DeltaRevision::new(revision)));
    }
    assert_eq!(value.history.at(DeltaRevision::new(4)), None);
    assert!(!value.is_live(Some(DeltaRevision::new(2))));
    assert!(value.is_live(Some(DeltaRevision::new(3))));
    assert!(value.is_live(Some(DeltaRevision::new(4))));
    assert!(!value.is_live(None));
    assert_eq!(value.data(), &"value");
}

#[test]
fn versioned_change_flag() {
    let mut value = Versioned::new((), DeltaRevision::new(3));
    assert!(!value.push(EntryKind::Live, DeltaRevision::new(4)));
    assert!(value.push(EntryKind::Withdrawn, DeltaRevision::new(5)));
    assert!(!value.push(EntryKind::Withdrawn, DeltaRevision::new(6)));
    assert!(value.push(EntryKind::Live, DeltaRevision::new(6)));
    assert!(value.is_live(None));
}

#[test]
#[should_panic(expected = "history revisions must be nondecreasing")]
fn versioned_prebirth_decision() {
    let mut value = Versioned::new((), DeltaRevision::new(3));
    value.push(EntryKind::Withdrawn, DeltaRevision::new(2));
}
