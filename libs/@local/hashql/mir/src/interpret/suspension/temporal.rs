//! Temporal types for bi-temporal graph queries.
//!
//! These types represent evaluated temporal axes that are extracted from
//! interpreter [`Value`]s during [`GraphRead`] suspension. They provide
//! a concrete, backend-agnostic representation of the temporal context
//! needed to execute a graph query.
//!
//! [`Value`]: crate::interpret::value::Value
//! [`GraphRead`]: crate::body::terminator::GraphRead

use core::ops::Bound;

use crate::interpret::value::Int;

/// An evaluated timestamp value, in milliseconds since the Unix epoch.
#[derive(Debug, Copy, Clone)]
pub struct Timestamp(Int);

impl From<Int> for Timestamp {
    fn from(value: Int) -> Self {
        Self(value)
    }
}

impl From<Timestamp> for Int {
    fn from(value: Timestamp) -> Self {
        value.0
    }
}

/// A half-open or closed interval over [`Timestamp`]s.
#[derive(Debug, Clone)]
pub struct TemporalInterval {
    pub start: Bound<Timestamp>,
    pub end: Bound<Timestamp>,
}

impl TemporalInterval {
    /// Creates a point interval `[value, value]`.
    pub(crate) const fn point(value: Timestamp) -> Self {
        Self {
            start: Bound::Included(value),
            end: Bound::Included(value),
        }
    }

    /// Creates an interval from explicit bounds.
    pub(crate) const fn interval((start, end): (Bound<Timestamp>, Bound<Timestamp>)) -> Self {
        Self { start, end }
    }
}

/// The evaluated temporal axes for a bi-temporal graph query.
///
/// HashQL's graph store is bi-temporal: every fact is tracked along both
/// a decision time axis (when the fact was decided) and a transaction time
/// axis (when it was recorded). A query must specify intervals on both axes
/// to determine which version of the data is visible.
#[derive(Debug, Clone)]
pub struct TemporalAxesInterval {
    pub decision_time: TemporalInterval,
    pub transaction_time: TemporalInterval,
}
