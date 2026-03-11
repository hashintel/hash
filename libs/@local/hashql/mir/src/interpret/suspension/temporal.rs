use core::ops::Bound;

use crate::interpret::value::Int;

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

#[derive(Debug, Clone)]
pub struct TemporalInterval {
    pub start: Bound<Timestamp>,
    pub end: Bound<Timestamp>,
}

impl TemporalInterval {
    pub(crate) const fn point(value: Timestamp) -> Self {
        Self {
            start: Bound::Included(value),
            end: Bound::Included(value),
        }
    }

    pub(crate) const fn interval((start, end): (Bound<Timestamp>, Bound<Timestamp>)) -> Self {
        Self { start, end }
    }
}

#[derive(Debug, Clone)]
pub struct TemporalAxesInterval {
    pub decision_time: TemporalInterval,
    pub transaction_time: TemporalInterval,
}
