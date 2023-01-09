use std::{
    collections::Bound,
    ops::{Add, Mul, Sub},
};

use derivative::Derivative;
use interval_ops::{ContinuousInterval, Interval, LowerBound, UpperBound};
use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::Timestamp;

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(
    rename_all = "camelCase",
    bound = "",
    tag = "bound",
    content = "timestamp"
)]
pub enum TimespanBound<A> {
    Unbounded,
    Included(Timestamp<A>),
    Excluded(Timestamp<A>),
}

impl<A> From<Bound<Timestamp<A>>> for TimespanBound<A> {
    fn from(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(timestamp) => Self::Included(timestamp),
            Bound::Excluded(timestamp) => Self::Excluded(timestamp),
            Bound::Unbounded => Self::Unbounded,
        }
    }
}

impl<A> From<TimespanBound<A>> for Bound<Timestamp<A>> {
    fn from(bound: TimespanBound<A>) -> Self {
        match bound {
            TimespanBound::Included(timestamp) => Self::Included(timestamp),
            TimespanBound::Excluded(timestamp) => Self::Excluded(timestamp),
            TimespanBound::Unbounded => Self::Unbounded,
        }
    }
}

impl<A> LowerBound<Timestamp<A>> for TimespanBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Unbounded => Bound::Unbounded,
            Self::Included(timestamp) => Bound::Included(timestamp),
            Self::Excluded(timestamp) => Bound::Excluded(timestamp),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        self.into()
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        bound.into()
    }
}

impl<A> UpperBound<Timestamp<A>> for TimespanBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Unbounded => Bound::Unbounded,
            Self::Included(timestamp) => Bound::Included(timestamp),
            Self::Excluded(timestamp) => Bound::Excluded(timestamp),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        self.into()
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        bound.into()
    }
}

impl<A> ToSchema for TimespanBound<A> {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property(
                        "bound",
                        openapi::ObjectBuilder::new().enum_values(Some(["unbounded"])),
                    )
                    .required("bound"),
            )
            .item(
                openapi::ObjectBuilder::new()
                    .property(
                        "bound",
                        openapi::ObjectBuilder::new().enum_values(Some(["included", "excluded"])),
                    )
                    .required("bound")
                    .property("timestamp", Timestamp::<A>::schema())
                    .required("timestamp"),
            )
            .build()
            .into()
    }
}

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct UnresolvedTimespan<A> {
    pub start: Option<TimespanBound<A>>,
    pub end: Option<TimespanBound<A>>,
}

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct Timespan<A> {
    pub start: TimespanBound<A>,
    pub end: TimespanBound<A>,
}

impl<A> Timespan<A> {
    #[must_use]
    pub fn into_continuous_interval(self) -> ContinuousInterval<Timestamp<A>> {
        ContinuousInterval::from_range((Bound::from(self.start), Bound::from(self.end)))
    }
}

impl<A> Interval<Timestamp<A>> for Timespan<A> {
    type LowerBound = TimespanBound<A>;
    type UpperBound = TimespanBound<A>;

    fn empty() -> Self {
        unimplemented!("An empty interval is not a valid time interval")
    }

    fn from_bounds(lower: Self::LowerBound, upper: Self::UpperBound) -> Self
    where
        Timestamp<A>: PartialOrd,
    {
        Self {
            start: lower,
            end: upper,
        }
    }

    fn bounds(&self) -> Option<(&Self::LowerBound, &Self::UpperBound)> {
        Some((&self.start, &self.end))
    }

    fn into_bounds(self) -> Option<(Self::LowerBound, Self::UpperBound)> {
        Some((self.start, self.end))
    }

    fn is_empty(&self) -> bool {
        false
    }
}

impl<A, I: Interval<Timestamp<A>>> Add<I> for Timespan<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn add(self, rhs: I) -> Self::Output {
        self.into_continuous_interval()
            .union(rhs)
            .expect("interval union result in disjoint spans")
    }
}

impl<A, I: Interval<Timestamp<A>>> Sub<I> for Timespan<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn sub(self, rhs: I) -> Self::Output {
        self.into_continuous_interval()
            .difference(rhs)
            .expect("interval difference result in disjoint spans")
    }
}

impl<A, I: Interval<Timestamp<A>>> Mul<I> for Timespan<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn mul(self, rhs: I) -> Self::Output {
        self.into_continuous_interval().intersect(rhs)
    }
}
