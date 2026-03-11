use core::{error, ops::Bound};

use bytes::BytesMut;
use hashql_mir::interpret::value::Int;
use postgres_protocol::types::RangeBound;
use postgres_types::{ToSql, accepts, to_sql_checked};

#[derive(Debug, Copy, Clone)]
pub(crate) struct Timestamp(Int);

impl From<Int> for Timestamp {
    fn from(value: Int) -> Self {
        Self(value)
    }
}

// timestamp is in ms
impl ToSql for Timestamp {
    accepts!(TIMESTAMPTZ);

    to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        // The value has been determined via `Date.UTC(2000, 0, 1)` in JS, and is the same as the one that jdbc uses: https://jdbc.postgresql.org/documentation/publicapi/constant-values.html
        const BASE: i128 = 946_684_800_000;

        // Our timestamp is milliseconds since Unix epoch (1970-01-01).
        // Postgres stores microseconds since 2000-01-01.
        let value = ((self.0.as_int() - BASE) * 1000) as i64;

        postgres_protocol::types::timestamp_to_sql(value, out);
        Ok(postgres_types::IsNull::No)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct TemporalInterval {
    pub start: Bound<Timestamp>,
    pub end: Bound<Timestamp>,
}

impl TemporalInterval {
    pub(crate) const fn point(value: Timestamp) -> Self {
        Self {
            start: Bound::Included(value),
            end: Bound::Included(value),
        }
    }

    pub(crate) const fn interval((start, end): (Bound<Timestamp>, Bound<Timestamp>)) -> Self {
        Self { start, end }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct TemporalAxesInterval {
    pub decision_time: TemporalInterval,
    pub transaction_time: TemporalInterval,
}

impl ToSql for TemporalInterval {
    accepts!(TSTZ_RANGE);

    to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        fn bound_to_sql(
            bound: Bound<Timestamp>,
            buf: &mut BytesMut,
        ) -> Result<RangeBound<postgres_protocol::IsNull>, Box<dyn error::Error + Sync + Send>>
        {
            Ok(match bound {
                Bound::Unbounded => RangeBound::Unbounded,
                Bound::Included(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Inclusive(postgres_protocol::IsNull::No)
                }
                Bound::Excluded(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Exclusive(postgres_protocol::IsNull::No)
                }
            })
        }

        postgres_protocol::types::range_to_sql(
            |buf| bound_to_sql(self.start, buf),
            |buf| bound_to_sql(self.end, buf),
            out,
        )?;

        Ok(postgres_types::IsNull::No)
    }
}
