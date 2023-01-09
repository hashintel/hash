use std::{
    collections::Bound,
    error::Error,
    ops::{Add, Mul, RangeBounds, Sub},
};

use interval_ops::{ContinuousInterval, Interval, LowerBound, UpperBound};
use postgres_protocol::types::timestamp_from_sql;
use postgres_types::{FromSql, Type};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::time::timestamp::Timestamp;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
pub struct VersionTimespan<A> {
    pub start: Timestamp<A>,
    pub end: Option<Timestamp<A>>,
}

impl<A> Interval<Timestamp<A>> for VersionTimespan<A> {
    type LowerBound = Timestamp<A>;
    type UpperBound = Option<Timestamp<A>>;

    fn empty() -> Self {
        unimplemented!("An empty interval is not a valid version interval")
    }

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

impl<A> VersionTimespan<A> {
    #[must_use]
    pub fn from_anonymous(interval: VersionTimespan<()>) -> Self {
        Self {
            start: Timestamp::from_anonymous(interval.start),
            end: interval.end.map(Timestamp::from_anonymous),
        }
    }

    #[must_use]
    pub fn into_continuous_interval(self) -> ContinuousInterval<Timestamp<A>> {
        ContinuousInterval::from_range(self)
    }
}

impl<A> RangeBounds<Timestamp<A>> for VersionTimespan<A> {
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

impl FromSql<'_> for VersionTimespan<()> {
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

impl<A, I: Interval<Timestamp<A>>> Add<I> for VersionTimespan<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn add(self, rhs: I) -> Self::Output {
        self.into_continuous_interval()
            .union(rhs)
            .expect("interval union result in disjoint spans")
    }
}

impl<A, I: Interval<Timestamp<A>>> Sub<I> for VersionTimespan<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn sub(self, rhs: I) -> Self::Output {
        self.into_continuous_interval()
            .difference(rhs)
            .expect("interval difference result in disjoint spans")
    }
}

impl<A, I: Interval<Timestamp<A>>> Mul<I> for VersionTimespan<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn mul(self, rhs: I) -> Self::Output {
        self.into_continuous_interval().intersect(rhs)
    }
}
