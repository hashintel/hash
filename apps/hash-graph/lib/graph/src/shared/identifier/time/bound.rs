#![expect(
    clippy::let_underscore_untyped,
    reason = "Upstream issue of `derivative`"
)]

use std::ops::Bound;

use derivative::Derivative;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    identifier::time::{axis::TemporalTagged, Timestamp},
    interval::IntervalBound,
};

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum TemporalBound<A> {
    #[schema(title = "UnboundedBound")]
    Unbounded,
    #[schema(title = "InclusiveBound")]
    Inclusive(Timestamp<A>),
    #[schema(title = "ExclusiveBound")]
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

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum LimitedTemporalBound<A> {
    #[schema(title = "InclusiveBound")]
    Inclusive(Timestamp<A>),
    #[schema(title = "ExclusiveBound")]
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

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum ClosedTemporalBound<A> {
    #[schema(title = "InclusiveBound")]
    Inclusive(Timestamp<A>),
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

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", tag = "kind", content = "limit")]
pub enum OpenTemporalBound<A> {
    #[schema(title = "ExclusiveBound")]
    Exclusive(Timestamp<A>),
    #[schema(title = "UnboundedBound")]
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
