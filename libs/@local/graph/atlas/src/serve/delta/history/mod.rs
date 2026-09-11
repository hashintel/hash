//! Bounded visibility decisions without historical payload copies.
//!
//! [`History`] returns no decision once retention can no longer answer a query. [`Versioned`] keeps
//! birth separately so eviction cannot make a value appear before its creation.

use super::DeltaRevision;

#[cfg(test)]
mod tests;

// Identity, layout and topology eviction tests share this retention capacity.
#[cfg(test)]
pub(super) use self::tests::CAPACITY;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum EntryKind {
    Live,
    Withdrawn,
}

impl EntryKind {
    pub(super) const fn is_live(self) -> bool {
        matches!(self, Self::Live)
    }

    pub(super) const fn is_withdrawn(self) -> bool {
        matches!(self, Self::Withdrawn)
    }
}

type HistoryBitset = u8;
const HISTORY_SIZE: usize = HistoryBitset::BITS as usize;

#[derive(Debug, Copy, Clone)]
pub(super) struct History {
    revisions: [DeltaRevision; HISTORY_SIZE],
    alive: HistoryBitset,
}

impl History {
    pub(super) const fn new(kind: EntryKind, revision: DeltaRevision) -> Self {
        Self {
            revisions: [revision; HISTORY_SIZE],
            alive: match kind {
                EntryKind::Live => HistoryBitset::MAX,
                EntryKind::Withdrawn => HistoryBitset::MIN,
            },
        }
    }

    /// Records a visibility transition, replacing one at the same revision.
    ///
    /// Returns whether visibility changed. Repeated states preserve retained history.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the latest recorded transition.
    pub(super) fn push(&mut self, kind: EntryKind, revision: DeltaRevision) -> bool {
        let latest = self.revisions[HISTORY_SIZE - 1];
        assert!(
            revision >= latest,
            "history revisions must be nondecreasing"
        );

        let prev = self.alive & 1;
        let next = match kind {
            EntryKind::Live => 1,
            EntryKind::Withdrawn => 0,
        };

        if prev == next {
            return false;
        }

        if revision > latest {
            self.revisions.shift_left([revision]);
            self.alive <<= 1;
        } else {
            self.alive &= !1;
        }

        self.alive |= next;

        next != prev
    }

    pub(super) const fn now(&self) -> EntryKind {
        if self.alive & 1 != 0 {
            EntryKind::Live
        } else {
            EntryKind::Withdrawn
        }
    }

    /// Returns the newest retained decision at or before `revision`.
    ///
    /// `None` lets the caller fall back to the initial state or the base provider.
    pub(super) fn at(&self, revision: DeltaRevision) -> Option<EntryKind> {
        self.revisions
            .iter()
            .rev()
            .position(|&history| history <= revision)
            .map(|index| {
                if (self.alive >> index) & 1 != 0 {
                    EntryKind::Live
                } else {
                    EntryKind::Withdrawn
                }
            })
    }
}

/// A value with permanent birth tracking and bounded visibility decisions.
#[derive(Debug, Copy, Clone)]
pub(super) struct Versioned<T> {
    data: T,
    birth: DeltaRevision,
    history: History,
}

impl<T> Versioned<T> {
    pub(super) const fn new(data: T, birth: DeltaRevision) -> Self {
        Self {
            data,
            birth,
            history: History::new(EntryKind::Live, birth),
        }
    }

    pub(super) const fn data(&self) -> &T {
        &self.data
    }

    /// Records a visibility transition without changing the birth revision.
    ///
    /// Returns whether visibility changed.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes birth or the latest recorded transition.
    pub(super) fn push(&mut self, kind: EntryKind, revision: DeltaRevision) -> bool {
        self.history.push(kind, revision)
    }

    pub(super) fn is_live(&self, revision: Option<DeltaRevision>) -> bool {
        revision.map_or_else(
            || self.history.now() == EntryKind::Live,
            |revision| {
                revision >= self.birth
                    && self.history.at(revision).unwrap_or(EntryKind::Live) == EntryKind::Live
            },
        )
    }

    pub(super) fn is_withdrawn(&self, revision: Option<DeltaRevision>) -> bool {
        revision.map_or_else(
            || self.history.now() == EntryKind::Withdrawn,
            |revision| {
                revision >= self.birth
                    && self.history.at(revision).unwrap_or(EntryKind::Withdrawn)
                        == EntryKind::Withdrawn
            },
        )
    }
}
