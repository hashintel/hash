mod axis;
mod projection;
mod timespan;
mod timestamp;
mod version;

use std::{error::Error, ops::Bound};

use postgres_types::{FromSql, Type};

pub use self::{
    axis::{
        DecisionTime, DecisionTimeProjection, DecisionTimeVersionTimespan, DecisionTimestamp,
        ProjectedTime, ProjectedTimestamp, ResolvedDecisionTimeProjection, ResolvedTimeProjection,
        ResolvedTransactionTimeProjection, TimeAxis, TimeProjection, TransactionTime,
        TransactionTimeProjection, TransactionTimeVersionTimespan, TransactionTimestamp,
    },
    projection::{Image, Kernel, Projection, ResolvedImage, ResolvedKernel, ResolvedProjection},
    timespan::{ResolvedTimespan, Timespan, TimespanBound},
    timestamp::Timestamp,
};

fn parse_bound(
    bound: &postgres_protocol::types::RangeBound<Option<&[u8]>>,
) -> Result<Bound<Timestamp<()>>, Box<dyn Error + Send + Sync>> {
    match bound {
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
