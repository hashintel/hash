use std::{collections::Bound, error::Error, ops::RangeBounds};

use interval_ops::{Interval, LowerBound, UpperBound};
use postgres_protocol::types::timestamp_from_sql;
use postgres_types::{FromSql, Type};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::time::{timestamp::Timestamp, TimeInterval, TimeIntervalBound};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
pub struct VersionInterval<A> {
    pub start: Timestamp<A>,
    pub end: Option<Timestamp<A>>,
}

impl<A> Interval<Timestamp<A>> for VersionInterval<A> {
    type LowerBound = Timestamp<A>;
    type UpperBound = Option<Timestamp<A>>;

    fn from_bounds(lower: Timestamp<A>, upper: Option<Timestamp<A>>) -> Self {
        if let Some(upper) = upper {
            assert!(
                lower <= upper,
                "Lower bound must be less than or equal to upper bound"
            );
        }

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

impl<A> VersionInterval<A> {
    #[must_use]
    pub fn from_anonymous(interval: VersionInterval<()>) -> Self {
        Self {
            start: Timestamp::from_anonymous(interval.start),
            end: interval.end.map(Timestamp::from_anonymous),
        }
    }

    #[must_use]
    pub fn into_time_interval(self) -> TimeInterval<A> {
        TimeInterval::from_bounds(
            TimeIntervalBound::Included(self.start),
            self.end
                .map_or(TimeIntervalBound::Unbounded, TimeIntervalBound::Excluded),
        )
    }

    #[must_use]
    pub fn cast<B>(self) -> VersionInterval<B> {
        VersionInterval {
            start: self.start.cast(),
            end: self.end.map(Timestamp::cast),
        }
    }
}

impl<A> RangeBounds<Timestamp<A>> for VersionInterval<A> {
    fn start_bound(&self) -> Bound<&Timestamp<A>> {
        LowerBound::as_bound(&self.start)
    }

    fn end_bound(&self) -> Bound<&Timestamp<A>> {
        UpperBound::as_bound(&self.end)
    }
}

fn is_infinity(bytes: &[u8]) -> Result<bool, Box<dyn Error + Send + Sync>> {
    let sql_timestamp = timestamp_from_sql(bytes)?;
    Ok(sql_timestamp == i64::MIN || sql_timestamp == i64::MAX)
}

fn parse_bound(
    bound: &postgres_protocol::types::RangeBound<Option<&[u8]>>,
) -> Result<Bound<Timestamp<()>>, Box<dyn Error + Send + Sync>> {
    match bound {
        postgres_protocol::types::RangeBound::Inclusive(Some(bytes))
        | postgres_protocol::types::RangeBound::Exclusive(Some(bytes))
            if is_infinity(bytes)? =>
        {
            tracing::warn!(
                "Found an `-infinity` or `infinity` timestamp in the database, falling back to \
                 unbounded range instead"
            );
            Ok(Bound::Unbounded)
        }
        postgres_protocol::types::RangeBound::Inclusive(Some(bytes)) => Ok(Bound::Included(
            Timestamp::from_sql(&Type::TIMESTAMPTZ, bytes)?,
        )),
        postgres_protocol::types::RangeBound::Exclusive(Some(bytes)) => Ok(Bound::Excluded(
            Timestamp::from_sql(&Type::TIMESTAMPTZ, bytes)?,
        )),
        postgres_protocol::types::RangeBound::Inclusive(None)
        | postgres_protocol::types::RangeBound::Exclusive(None) => {
            unimplemented!("null ranges are not supported")
        }
        postgres_protocol::types::RangeBound::Unbounded => Ok(Bound::Unbounded),
    }
}

impl FromSql<'_> for VersionInterval<()> {
    fn from_sql(_: &Type, buf: &[u8]) -> Result<Self, Box<dyn Error + Send + Sync>> {
        match postgres_protocol::types::range_from_sql(buf)? {
            postgres_protocol::types::Range::Empty => {
                unimplemented!("Empty ranges are not supported")
            }
            postgres_protocol::types::Range::Nonempty(lower, upper) => Ok(Self {
                start: LowerBound::from_bound(parse_bound(&lower)?),
                end: UpperBound::from_bound(parse_bound(&upper)?),
            }),
        }
    }

    fn accepts(ty: &Type) -> bool {
        matches!(ty, &Type::TSTZ_RANGE)
    }
}
