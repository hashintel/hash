use std::{error::Error, fmt, ops::Bound};

use derivative::Derivative;
use postgres_protocol::types::{timestamp_from_sql, RangeBound};
use postgres_types::{private::BytesMut, FromSql, ToSql, Type};
use serde::{Deserialize, Serialize};

use crate::{
    identifier::time::{
        axis::TemporalTagged, LimitedTimeIntervalBound, TimeIntervalBound, Timestamp,
    },
    interval::{Interval, IntervalBound},
};

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
    pub end: Option<LimitedTimeIntervalBound<A>>,
}

impl<A, S, E> TemporalTagged for Interval<Timestamp<A>, S, E>
where
    S: TemporalTagged<Axis = A>,
    E: TemporalTagged<Axis = A>,
{
    type Axis = A;
    type Tagged<T> = Interval<Timestamp<T>, S::Tagged<T>, E::Tagged<T>>;

    fn cast<T>(self) -> Self::Tagged<T> {
        let (start, end) = self.into_bounds();
        Interval::new_unchecked(start.cast(), end.cast())
    }
}

impl<A, S, E> ToSql for Interval<Timestamp<A>, S, E>
where
    S: IntervalBound<Timestamp<A>> + fmt::Debug,
    E: IntervalBound<Timestamp<A>> + fmt::Debug,
{
    postgres_types::accepts!(TSTZ_RANGE);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        _: &Type,
        buf: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>> {
        fn bound_to_sql<A>(
            bound: Bound<&Timestamp<A>>,
            buf: &mut BytesMut,
        ) -> Result<RangeBound<postgres_protocol::IsNull>, Box<dyn Error + Sync + Send>> {
            Ok(match bound.as_bound() {
                Bound::Unbounded => RangeBound::Unbounded,
                Bound::Included(timestamp) => {
                    timestamp.to_sql(&Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Inclusive(postgres_protocol::IsNull::No)
                }
                Bound::Excluded(timestamp) => {
                    timestamp.to_sql(&Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Exclusive(postgres_protocol::IsNull::No)
                }
            })
        }

        postgres_protocol::types::range_to_sql(
            |buf| bound_to_sql(self.start().as_bound(), buf),
            |buf| bound_to_sql(self.end().as_bound(), buf),
            buf,
        )?;
        Ok(postgres_types::IsNull::No)
    }
}

fn is_infinity(bytes: &[u8]) -> Result<bool, Box<dyn Error + Send + Sync>> {
    let sql_timestamp = timestamp_from_sql(bytes)?;
    Ok(sql_timestamp == i64::MIN || sql_timestamp == i64::MAX)
}

fn parse_bound<A>(
    bound: &RangeBound<Option<&[u8]>>,
) -> Result<Bound<Timestamp<A>>, Box<dyn Error + Send + Sync>> {
    match bound {
        RangeBound::Inclusive(Some(bytes)) | RangeBound::Exclusive(Some(bytes))
            if is_infinity(bytes)? =>
        {
            tracing::warn!(
                "Found an `-infinity` or `infinity` timestamp in the database, falling back to \
                 unbounded range instead"
            );
            Ok(Bound::Unbounded)
        }
        RangeBound::Inclusive(Some(bytes)) => Ok(Bound::Included(
            Timestamp::from_sql(&Type::TIMESTAMPTZ, bytes)?.cast(),
        )),
        RangeBound::Exclusive(Some(bytes)) => Ok(Bound::Excluded(
            Timestamp::from_sql(&Type::TIMESTAMPTZ, bytes)?.cast(),
        )),
        RangeBound::Inclusive(None) | RangeBound::Exclusive(None) => {
            unimplemented!("null ranges are not supported")
        }
        RangeBound::Unbounded => Ok(Bound::Unbounded),
    }
}

impl<A, S, E> FromSql<'_> for Interval<Timestamp<A>, S, E>
where
    S: IntervalBound<Timestamp<A>>,
    E: IntervalBound<Timestamp<A>>,
{
    fn from_sql(_: &Type, buf: &[u8]) -> Result<Self, Box<dyn Error + Send + Sync>> {
        match postgres_protocol::types::range_from_sql(buf)? {
            postgres_protocol::types::Range::Empty => {
                unimplemented!("Empty ranges are not supported")
            }
            postgres_protocol::types::Range::Nonempty(lower, upper) => Ok(Self::new_unchecked(
                S::from_bound(parse_bound(&lower)?),
                E::from_bound(parse_bound(&upper)?),
            )),
        }
    }

    fn accepts(ty: &Type) -> bool {
        matches!(ty, &Type::TSTZ_RANGE)
    }
}
