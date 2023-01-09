use std::{
    collections::Bound,
    error::Error,
    ops::{Add, Mul, RangeBounds, Sub},
};

use interval_ops::{ContinuousInterval, Interval, LowerBound, UpperBound};
use postgres_types::{FromSql, Type};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::time::timestamp::Timestamp;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
pub struct VersionInterval<A> {
    pub start: Timestamp<A>,
    pub end: Option<Timestamp<A>>,
}

impl<A> Interval<Timestamp<A>> for VersionInterval<A> {
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

impl<A> VersionInterval<A> {
    #[must_use]
    pub fn from_anonymous(interval: VersionInterval<()>) -> Self {
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

impl<A> RangeBounds<Timestamp<A>> for VersionInterval<A> {
    fn start_bound(&self) -> Bound<&Timestamp<A>> {
        LowerBound::as_bound(&self.start)
    }

    fn end_bound(&self) -> Bound<&Timestamp<A>> {
        UpperBound::as_bound(&self.end)
    }
}

impl FromSql<'_> for VersionInterval<()> {
    fn from_sql(_: &Type, buf: &[u8]) -> Result<Self, Box<dyn Error + Send + Sync>> {
        match postgres_protocol::types::range_from_sql(buf)? {
            postgres_protocol::types::Range::Empty => {
                unimplemented!("Empty ranges are not supported")
            }
            postgres_protocol::types::Range::Nonempty(lower, upper) => Ok(Self {
                start: LowerBound::from_bound(super::parse_bound(&lower)?),
                end: UpperBound::from_bound(super::parse_bound(&upper)?),
            }),
        }
    }

    fn accepts(ty: &Type) -> bool {
        matches!(ty, &Type::TSTZ_RANGE)
    }
}

impl<A> Add<ContinuousInterval<Timestamp<A>>> for VersionInterval<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn add(self, rhs: ContinuousInterval<Timestamp<A>>) -> Self::Output {
        self.into_continuous_interval()
            .union(rhs)
            .expect("interval union result in disjoint spans")
    }
}

impl<A> Sub<ContinuousInterval<Timestamp<A>>> for VersionInterval<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn sub(self, rhs: ContinuousInterval<Timestamp<A>>) -> Self::Output {
        self.into_continuous_interval()
            .difference(rhs)
            .expect("interval difference result in disjoint spans")
    }
}

impl<A> Mul<ContinuousInterval<Timestamp<A>>> for VersionInterval<A> {
    type Output = ContinuousInterval<Timestamp<A>>;

    fn mul(self, rhs: ContinuousInterval<Timestamp<A>>) -> Self::Output {
        self.into_continuous_interval().intersect(rhs)
    }
}
