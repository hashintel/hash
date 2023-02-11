use std::ops::Bound;

use derivative::Derivative;
use serde::{Deserialize, Serialize};
use utoipa::{
    openapi,
    openapi::{RefOr, Schema},
    ToSchema,
};

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
#[serde(
    rename_all = "camelCase",
    bound = "",
    tag = "bound",
    content = "timestamp"
)]
pub enum TimeIntervalBound<A> {
    Unbounded,
    Included(Timestamp<A>),
    Excluded(Timestamp<A>),
}

impl<A> TemporalTagged for TimeIntervalBound<A> {
    type Axis = A;
    type Tagged<T> = TimeIntervalBound<T>;

    fn cast<T>(self) -> TimeIntervalBound<T> {
        match self {
            Self::Unbounded => TimeIntervalBound::Unbounded,
            Self::Included(limit) => TimeIntervalBound::Included(limit.cast()),
            Self::Excluded(limit) => TimeIntervalBound::Excluded(limit.cast()),
        }
    }
}

impl<A> IntervalBound<Timestamp<A>> for TimeIntervalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Unbounded => Bound::Unbounded,
            Self::Included(limit) => Bound::Included(limit),
            Self::Excluded(limit) => Bound::Excluded(limit),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Included(limit) => Bound::Included(limit),
            Self::Excluded(limit) => Bound::Excluded(limit),
            Self::Unbounded => Bound::Unbounded,
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(limit) => Self::Included(limit),
            Bound::Excluded(limit) => Self::Excluded(limit),
            Bound::Unbounded => Self::Unbounded,
        }
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
#[serde(
    rename_all = "camelCase",
    bound = "",
    tag = "bound",
    content = "timestamp"
)]
pub enum LimitedTimeIntervalBound<A> {
    Included(Timestamp<A>),
    Excluded(Timestamp<A>),
}

impl<A> TemporalTagged for LimitedTimeIntervalBound<A> {
    type Axis = A;
    type Tagged<T> = LimitedTimeIntervalBound<T>;

    fn cast<T>(self) -> LimitedTimeIntervalBound<T> {
        match self {
            Self::Included(limit) => LimitedTimeIntervalBound::Included(limit.cast()),
            Self::Excluded(limit) => LimitedTimeIntervalBound::Excluded(limit.cast()),
        }
    }
}

impl<A> IntervalBound<Timestamp<A>> for LimitedTimeIntervalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self {
            Self::Included(limit) => Bound::Included(limit),
            Self::Excluded(limit) => Bound::Excluded(limit),
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Included(limit) => Bound::Included(limit),
            Self::Excluded(limit) => Bound::Excluded(limit),
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(limit) => Self::Included(limit),
            Bound::Excluded(limit) => Self::Excluded(limit),
            Bound::Unbounded => {
                unimplemented!("Cannot convert unbounded bound to limited temporal bound")
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
#[serde(transparent)]
pub struct IncludedTimeIntervalBound<A>(Timestamp<A>);

impl<A> From<IncludedTimeIntervalBound<A>> for Timestamp<A> {
    fn from(value: IncludedTimeIntervalBound<A>) -> Self {
        value.0
    }
}

impl<A> From<Timestamp<A>> for IncludedTimeIntervalBound<A> {
    fn from(value: Timestamp<A>) -> Self {
        Self(value)
    }
}

impl<A> TemporalTagged for IncludedTimeIntervalBound<A> {
    type Axis = A;
    type Tagged<T> = IncludedTimeIntervalBound<T>;

    fn cast<T>(self) -> IncludedTimeIntervalBound<T> {
        IncludedTimeIntervalBound(self.0.cast())
    }
}

impl<A> IntervalBound<Timestamp<A>> for IncludedTimeIntervalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        Bound::Included(&self.0)
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        Bound::Included(self.0)
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(limit) => Self(limit),
            Bound::Excluded(_) => {
                unimplemented!("Cannot convert excluded bound to included temporal bound")
            }
            Bound::Unbounded => {
                unimplemented!("Cannot convert unbounded bound to included temporal bound")
            }
        }
    }
}

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(transparent)]
pub struct UnboundedOrExcludedTimeIntervalBound<A>(Option<Timestamp<A>>);

impl<A> ToSchema<'_> for UnboundedOrExcludedTimeIntervalBound<A> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "UnboundedOrExcludedBound",
            openapi::Schema::Object(
                openapi::ObjectBuilder::new()
                    .schema_type(openapi::SchemaType::String)
                    .format(Some(openapi::SchemaFormat::KnownFormat(
                        openapi::KnownFormat::DateTime,
                    )))
                    .nullable(true)
                    .build(),
            )
            .into(),
        )
    }
}

impl<A> From<UnboundedOrExcludedTimeIntervalBound<A>> for Option<Timestamp<A>> {
    fn from(value: UnboundedOrExcludedTimeIntervalBound<A>) -> Self {
        value.0
    }
}

impl<A> From<Option<Timestamp<A>>> for UnboundedOrExcludedTimeIntervalBound<A> {
    fn from(value: Option<Timestamp<A>>) -> Self {
        Self(value)
    }
}

impl<A> TemporalTagged for UnboundedOrExcludedTimeIntervalBound<A> {
    type Axis = A;
    type Tagged<T> = UnboundedOrExcludedTimeIntervalBound<T>;

    fn cast<T>(self) -> UnboundedOrExcludedTimeIntervalBound<T> {
        UnboundedOrExcludedTimeIntervalBound(self.0.map(Timestamp::cast))
    }
}

impl<A> IntervalBound<Timestamp<A>> for UnboundedOrExcludedTimeIntervalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        match self.0 {
            Some(ref limit) => Bound::Excluded(limit),
            None => Bound::Unbounded,
        }
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        match self.0 {
            Some(limit) => Bound::Excluded(limit),
            None => Bound::Unbounded,
        }
    }

    fn from_bound(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(_) => {
                unimplemented!("Cannot convert included bound to unbounded or excluded bound")
            }
            Bound::Excluded(limit) => Self(Some(limit)),
            Bound::Unbounded => Self(None),
        }
    }
}
