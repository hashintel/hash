use std::{error::Error, ops::Bound};

use derivative::Derivative;
use interval_ops::{Interval, IntervalBounds, LowerBound, UpperBound};
use postgres_protocol::types::RangeBound;
use postgres_types::{private::BytesMut, ToSql};
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

impl<A> TimespanBound<A> {
    #[must_use]
    pub const fn cast<B>(&self) -> TimespanBound<B> {
        match self {
            Self::Unbounded => TimespanBound::Unbounded,
            Self::Included(timestamp) => TimespanBound::Included(timestamp.cast()),
            Self::Excluded(timestamp) => TimespanBound::Excluded(timestamp.cast()),
        }
    }
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
    pub const fn cast<B>(&self) -> Timespan<B> {
        Timespan {
            start: self.start.cast(),
            end: self.end.cast(),
        }
    }

    #[must_use]
    pub fn into_interval_bounds(self) -> IntervalBounds<Timestamp<A>> {
        IntervalBounds::from_range((Bound::from(self.start), Bound::from(self.end)))
    }
}

impl<A> Interval<Timestamp<A>> for Timespan<A> {
    type LowerBound = TimespanBound<A>;
    type UpperBound = TimespanBound<A>;

    fn from_bounds(lower: Self::LowerBound, upper: Self::UpperBound) -> Self
    where
        Timestamp<A>: PartialOrd,
    {
        Self {
            start: lower,
            end: upper,
        }
    }

    fn lower_bound(&self) -> &Self::LowerBound {
        &self.start
    }

    fn upper_bound(&self) -> &Self::UpperBound {
        &self.end
    }

    fn into_bound(self) -> (Self::LowerBound, Self::UpperBound) {
        (self.start, self.end)
    }
}

impl<A> ToSql for Timespan<A> {
    postgres_types::accepts!(TSTZ_RANGE);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        buf: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>> {
        fn bound_to_sql<A>(
            bound: TimespanBound<A>,
            buf: &mut BytesMut,
        ) -> Result<RangeBound<postgres_protocol::IsNull>, Box<dyn Error + Sync + Send>> {
            Ok(match bound {
                TimespanBound::Unbounded => RangeBound::Unbounded,
                TimespanBound::Included(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Inclusive(postgres_protocol::IsNull::No)
                }
                TimespanBound::Excluded(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Exclusive(postgres_protocol::IsNull::No)
                }
            })
        }

        postgres_protocol::types::range_to_sql(
            |buf| bound_to_sql(self.start.clone(), buf),
            |buf| bound_to_sql(self.end.clone(), buf),
            buf,
        )?;
        Ok(postgres_types::IsNull::No)
    }
}
