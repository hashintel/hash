use std::{error::Error, fmt, ops::Bound};

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
pub enum TimeIntervalBound<A> {
    Unbounded,
    Included(Timestamp<A>),
    Excluded(Timestamp<A>),
}

impl<A> TimeIntervalBound<A> {
    #[must_use]
    pub const fn cast<B>(&self) -> TimeIntervalBound<B> {
        match self {
            Self::Unbounded => TimeIntervalBound::Unbounded,
            Self::Included(timestamp) => TimeIntervalBound::Included(timestamp.cast()),
            Self::Excluded(timestamp) => TimeIntervalBound::Excluded(timestamp.cast()),
        }
    }
}

impl<A> From<Bound<Timestamp<A>>> for TimeIntervalBound<A> {
    fn from(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Included(timestamp) => Self::Included(timestamp),
            Bound::Excluded(timestamp) => Self::Excluded(timestamp),
            Bound::Unbounded => Self::Unbounded,
        }
    }
}

impl<A> From<TimeIntervalBound<A>> for Bound<Timestamp<A>> {
    fn from(bound: TimeIntervalBound<A>) -> Self {
        match bound {
            TimeIntervalBound::Included(timestamp) => Self::Included(timestamp),
            TimeIntervalBound::Excluded(timestamp) => Self::Excluded(timestamp),
            TimeIntervalBound::Unbounded => Self::Unbounded,
        }
    }
}

impl<A> LowerBound<Timestamp<A>> for TimeIntervalBound<A> {
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

impl<A> UpperBound<Timestamp<A>> for TimeIntervalBound<A> {
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

impl<A> ToSchema for TimeIntervalBound<A> {
    fn schema() -> openapi::RefOr<openapi::Schema> {
        openapi::Schema::OneOf(
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
                            openapi::ObjectBuilder::new()
                                .enum_values(Some(["included", "excluded"])),
                        )
                        .required("bound")
                        .property("timestamp", Timestamp::<A>::schema())
                        .required("timestamp"),
                )
                .build(),
        )
        .into()
    }
}

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct UnresolvedTimeInterval<A> {
    pub start: Option<TimeIntervalBound<A>>,
    pub end: Option<TimeIntervalBound<A>>,
}

impl<A> ToSchema for UnresolvedTimeInterval<A> {
    fn schema() -> openapi::RefOr<openapi::Schema> {
        openapi::ObjectBuilder::new()
            .property(
                "start",
                openapi::Schema::OneOf(
                    openapi::OneOfBuilder::new()
                        .item(openapi::Ref::from_schema_name("TimeIntervalBound"))
                        .nullable(true)
                        .build(),
                ),
            )
            .required("start")
            .property(
                "end",
                openapi::Schema::OneOf(
                    openapi::OneOfBuilder::new()
                        .item(openapi::Ref::from_schema_name("TimeIntervalBound"))
                        .nullable(true)
                        .build(),
                ),
            )
            .required("end")
            .build()
            .into()
    }
}

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct TimeInterval<A> {
    pub start: TimeIntervalBound<A>,
    pub end: TimeIntervalBound<A>,
}

impl<A> TimeInterval<A> {
    #[must_use]
    pub const fn cast<B>(&self) -> TimeInterval<B> {
        TimeInterval {
            start: self.start.cast(),
            end: self.end.cast(),
        }
    }

    #[must_use]
    pub fn into_interval_bounds(self) -> IntervalBounds<Timestamp<A>> {
        IntervalBounds::from_range((Bound::from(self.start), Bound::from(self.end)))
    }
}

impl<A> fmt::Debug for TimeInterval<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.start {
            TimeIntervalBound::Unbounded => write!(fmt, "(-∞, ")?,
            TimeIntervalBound::Included(start) => write!(fmt, "[{}, ", start)?,
            TimeIntervalBound::Excluded(start) => write!(fmt, "({}, ", start)?,
        }
        match self.end {
            TimeIntervalBound::Unbounded => write!(fmt, "+∞)")?,
            TimeIntervalBound::Included(end) => write!(fmt, "{}]", end)?,
            TimeIntervalBound::Excluded(end) => write!(fmt, "{})", end)?,
        }
        Ok(())
    }
}

impl<A> Interval<Timestamp<A>> for TimeInterval<A> {
    type LowerBound = TimeIntervalBound<A>;
    type UpperBound = TimeIntervalBound<A>;

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

impl<A> ToSql for TimeInterval<A> {
    postgres_types::accepts!(TSTZ_RANGE);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        buf: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>> {
        fn bound_to_sql<A>(
            bound: TimeIntervalBound<A>,
            buf: &mut BytesMut,
        ) -> Result<RangeBound<postgres_protocol::IsNull>, Box<dyn Error + Sync + Send>> {
            Ok(match bound {
                TimeIntervalBound::Unbounded => RangeBound::Unbounded,
                TimeIntervalBound::Included(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Inclusive(postgres_protocol::IsNull::No)
                }
                TimeIntervalBound::Excluded(timestamp) => {
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
