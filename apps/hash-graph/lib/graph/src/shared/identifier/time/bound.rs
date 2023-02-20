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
pub struct InclusiveTemporalBound<A>(Timestamp<A>);

impl<A> From<InclusiveTemporalBound<A>> for Timestamp<A> {
    fn from(value: InclusiveTemporalBound<A>) -> Self {
        value.0
    }
}

impl<A> From<Timestamp<A>> for InclusiveTemporalBound<A> {
    fn from(value: Timestamp<A>) -> Self {
        Self(value)
    }
}

impl<A> TemporalTagged for InclusiveTemporalBound<A> {
    type Axis = A;
    type Tagged<T> = InclusiveTemporalBound<T>;

    fn cast<T>(self) -> InclusiveTemporalBound<T> {
        InclusiveTemporalBound(self.0.cast())
    }
}

impl<A> IntervalBound<Timestamp<A>> for InclusiveTemporalBound<A> {
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
pub struct UnboundedOrExclusiveTemporalBound<A>(Option<Timestamp<A>>);

impl<A> ToSchema<'_> for UnboundedOrExclusiveTemporalBound<A> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "UnboundedOrExclusiveTemporalBound",
            Schema::Object(
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

impl<A> From<UnboundedOrExclusiveTemporalBound<A>> for Option<Timestamp<A>> {
    fn from(value: UnboundedOrExclusiveTemporalBound<A>) -> Self {
        value.0
    }
}

impl<A> From<Option<Timestamp<A>>> for UnboundedOrExclusiveTemporalBound<A> {
    fn from(value: Option<Timestamp<A>>) -> Self {
        Self(value)
    }
}

impl<A> TemporalTagged for UnboundedOrExclusiveTemporalBound<A> {
    type Axis = A;
    type Tagged<T> = UnboundedOrExclusiveTemporalBound<T>;

    fn cast<T>(self) -> UnboundedOrExclusiveTemporalBound<T> {
        UnboundedOrExclusiveTemporalBound(self.0.map(Timestamp::cast))
    }
}

impl<A> IntervalBound<Timestamp<A>> for UnboundedOrExclusiveTemporalBound<A> {
    fn as_bound(&self) -> Bound<&Timestamp<A>> {
        self.0.as_ref().map_or(Bound::Unbounded, Bound::Excluded)
    }

    fn into_bound(self) -> Bound<Timestamp<A>> {
        self.0.map_or(Bound::Unbounded, Bound::Excluded)
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
