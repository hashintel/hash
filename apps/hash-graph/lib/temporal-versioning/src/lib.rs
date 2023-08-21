#![feature(lint_reasons)]

pub mod serde;

mod axis;
mod bounds;
mod interval;
mod temporal_bound;
mod timestamp;

pub use self::{
    axis::{DecisionTime, TemporalTagged, TimeAxis, TransactionTime},
    bounds::IntervalBound,
    interval::Interval,
    temporal_bound::{ClosedTemporalBound, LimitedTemporalBound, OpenTemporalBound, TemporalBound},
    timestamp::Timestamp,
};

/// A temporal interval, where both bounds are either inclusive, exclusive, or unbounded.
pub type TemporalInterval<A> = Interval<Timestamp<A>, TemporalBound<A>, TemporalBound<A>>;

/// A temporal interval, where both bounds are either inclusive or exclusive. The lower bound may
/// also be unbounded.
pub type RightBoundedTemporalInterval<A> =
    Interval<Timestamp<A>, TemporalBound<A>, LimitedTemporalBound<A>>;

/// A temporal interval, where the lower bound is inclusive and the upper bound is either exclusive
/// or unbounded.
pub type LeftClosedTemporalInterval<A> =
    Interval<Timestamp<A>, ClosedTemporalBound<A>, OpenTemporalBound<A>>;
