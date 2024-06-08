use core::ops::Bound;

use derive_where::derive_where;
use serde::{Deserialize, Serialize};

use crate::{IntervalBound, TemporalTagged, Timestamp};

// We cannot use `Clone(bound = "")` as the implementation with `Copy(bound = "")` is wrong
// https://rust-lang.github.io/rust-clippy/master/index.html#/incorrect_clone_impl_on_copy_type
// The implementation must simply be `*self` and no clone should occur.
#[derive(Serialize, Deserialize)]
#[derive_where(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum TemporalBound<A> {
    #[cfg_attr(feature = "utoipa", schema(title = "UnboundedBound"))]
    Unbounded,
    #[cfg_attr(feature = "utoipa", schema(title = "InclusiveBound"))]
    Inclusive(Timestamp<A>),
    #[cfg_attr(feature = "utoipa", schema(title = "ExclusiveBound"))]
    Exclusive(Timestamp<A>),
}

impl<A> TemporalTagged for TemporalBound<A> {
    type Axis = A;
    type Tagged<T> = TemporalBound<T>;

    fn cast<T>(self) -> TemporalBound<T> {
        match self {
            Self::Unbounded => TemporalBound::Unbounded,
            Self::Inclusive(limit) => TemporalBound::Inclusive(limit.cast()),
            Self::Exclusive(limit) => TemporalBound::Exclusive(limit.cast()),
        }
    }
}

impl<A> IntervalBound<Timestamp<A>> for TemporalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Unbounded => Bound::Unbounded,
            Self::Inclusive(limit) => Bound::Included(limit),
            Self::Exclusive(limit) => Bound::Excluded(limit),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Inclusive(limit) => Bound::Included(limit),
            Self::Exclusive(limit) => Bound::Excluded(limit),
            Self::Unbounded => Bound::Unbounded,
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(limit) => Self::Inclusive(limit),
            Bound::Excluded(limit) => Self::Exclusive(limit),
            Bound::Unbounded => Self::Unbounded,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[derive_where(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum LimitedTemporalBound<A> {
    #[cfg_attr(feature = "utoipa", schema(title = "InclusiveBound"))]
    Inclusive(Timestamp<A>),
    #[cfg_attr(feature = "utoipa", schema(title = "ExclusiveBound"))]
    Exclusive(Timestamp<A>),
}

impl<A> TemporalTagged for LimitedTemporalBound<A> {
    type Axis = A;
    type Tagged<T> = LimitedTemporalBound<T>;

    fn cast<T>(self) -> LimitedTemporalBound<T> {
        match self {
            Self::Inclusive(limit) => LimitedTemporalBound::Inclusive(limit.cast()),
            Self::Exclusive(limit) => LimitedTemporalBound::Exclusive(limit.cast()),
        }
    }
}

impl<A> IntervalBound<Timestamp<A>> for LimitedTemporalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Inclusive(limit) => Bound::Included(limit),
            Self::Exclusive(limit) => Bound::Excluded(limit),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Inclusive(limit) => Bound::Included(limit),
            Self::Exclusive(limit) => Bound::Excluded(limit),
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(limit) => Self::Inclusive(limit),
            Bound::Excluded(limit) => Self::Exclusive(limit),
            Bound::Unbounded => {
                unimplemented!("Cannot convert unbounded bound to limited bound")
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[derive_where(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum ClosedTemporalBound<A> {
    #[cfg_attr(feature = "utoipa", schema(title = "InclusiveBound"))]
    Inclusive(Timestamp<A>),
}

impl<A> From<ClosedTemporalBound<A>> for Timestamp<A> {
    fn from(bound: ClosedTemporalBound<A>) -> Self {
        match bound {
            ClosedTemporalBound::Inclusive(limit) => limit,
        }
    }
}

impl<A> TemporalTagged for ClosedTemporalBound<A> {
    type Axis = A;
    type Tagged<T> = ClosedTemporalBound<T>;

    fn cast<T>(self) -> ClosedTemporalBound<T> {
        match self {
            Self::Inclusive(limit) => ClosedTemporalBound::Inclusive(limit.cast()),
        }
    }
}

impl<A> IntervalBound<Timestamp<A>> for ClosedTemporalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Inclusive(limit) => Bound::Included(limit),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Inclusive(limit) => Bound::Included(limit),
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(limit) => Self::Inclusive(limit),
            Bound::Excluded(_) => {
                unimplemented!("Cannot convert excluded bound to closed bound")
            }
            Bound::Unbounded => {
                unimplemented!("Cannot convert unbounded bound to closed bound")
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[derive_where(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum OpenTemporalBound<A> {
    #[cfg_attr(feature = "utoipa", schema(title = "ExclusiveBound"))]
    Exclusive(Timestamp<A>),
    #[cfg_attr(feature = "utoipa", schema(title = "UnboundedBound"))]
    Unbounded,
}

impl<A> TemporalTagged for OpenTemporalBound<A> {
    type Axis = A;
    type Tagged<T> = OpenTemporalBound<T>;

    fn cast<T>(self) -> OpenTemporalBound<T> {
        match self {
            Self::Exclusive(limit) => OpenTemporalBound::Exclusive(limit.cast()),
            Self::Unbounded => OpenTemporalBound::Unbounded,
        }
    }
}

impl<A> IntervalBound<Timestamp<A>> for OpenTemporalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Exclusive(limit) => Bound::Excluded(limit),
            Self::Unbounded => Bound::Unbounded,
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Exclusive(limit) => Bound::Excluded(limit),
            Self::Unbounded => Bound::Unbounded,
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(_) => {
                unimplemented!("Cannot convert included bound to open bound")
            }
            Bound::Excluded(limit) => Self::Exclusive(limit),
            Bound::Unbounded => Self::Unbounded,
        }
    }
}
