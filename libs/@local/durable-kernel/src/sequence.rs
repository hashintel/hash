//! Defines [`JournalSequence`].

use core::{
    fmt,
    ops::{Bound, RangeBounds},
};

use serde::{Deserialize, Serialize};

/// The sequence a shard's journal assigns to a record when it is appended.
///
/// All keys in a journal share one sequence. It increases with each append and can have gaps.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    derive_more::Display,
)]
#[serde(transparent)]
pub struct JournalSequence(u64);

impl JournalSequence {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    #[must_use]
    pub const fn saturating_next(self) -> Self {
        Self(self.0.saturating_add(1))
    }

    #[must_use]
    pub const fn checked_next(self) -> Option<Self> {
        match self.0.checked_add(1) {
            Some(next) => Some(Self(next)),
            None => None,
        }
    }
}

/// A range of journal sequences, displayed in interval notation such as `[3, 9)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SequenceRange<T = JournalSequence> {
    pub start: Bound<T>,
    pub end: Bound<T>,
}

impl<T: Clone> SequenceRange<T> {
    #[must_use]
    pub fn from_bounds(range: &impl RangeBounds<T>) -> Self {
        Self {
            start: range.start_bound().cloned(),
            end: range.end_bound().cloned(),
        }
    }
}

impl<T> SequenceRange<T> {
    /// Returns this range with `convert` applied to both bounds.
    pub fn map<U>(self, mut convert: impl FnMut(T) -> U) -> SequenceRange<U> {
        SequenceRange {
            start: self.start.map(&mut convert),
            end: self.end.map(convert),
        }
    }
}

impl<T> RangeBounds<T> for SequenceRange<T> {
    fn start_bound(&self) -> Bound<&T> {
        self.start.as_ref()
    }

    fn end_bound(&self) -> Bound<&T> {
        self.end.as_ref()
    }
}

impl<T: fmt::Display> fmt::Display for SequenceRange<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.start {
            Bound::Included(start) => write!(formatter, "[{start}, ")?,
            Bound::Excluded(start) => write!(formatter, "({start}, ")?,
            Bound::Unbounded => formatter.write_str("(.., ")?,
        }
        match &self.end {
            Bound::Included(end) => write!(formatter, "{end}]"),
            Bound::Excluded(end) => write!(formatter, "{end})"),
            Bound::Unbounded => formatter.write_str("..)"),
        }
    }
}
