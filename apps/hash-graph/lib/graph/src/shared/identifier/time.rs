mod axis;
mod bound;
mod interval;
mod temporal_axes;
mod timestamp;

pub use self::{
    axis::{DecisionTime, TemporalTagged, TimeAxis, TransactionTime, VariableAxis},
    bound::{
        InclusiveTemporalBound, LimitedTemporalBound, TemporalBound,
        UnboundedOrExclusiveTemporalBound,
    },
    interval::UnresolvedTemporalInterval,
    temporal_axes::{
        PinnedTemporalAxis, TemporalAxes, UnresolvedPinnedTemporalAxis, UnresolvedTemporalAxes,
        UnresolvedVariableTemporalAxis, VariableTemporalAxis,
    },
    timestamp::Timestamp,
};
use crate::interval::Interval;

pub type TemporalInterval<A> = Interval<Timestamp<A>, TemporalBound<A>, LimitedTemporalBound<A>>;
pub type LimitedTemporalInterval<A> =
    Interval<Timestamp<A>, TemporalBound<A>, LimitedTemporalBound<A>>;
pub type VersionInterval<A> =
    Interval<Timestamp<A>, InclusiveTemporalBound<A>, UnboundedOrExclusiveTemporalBound<A>>;
