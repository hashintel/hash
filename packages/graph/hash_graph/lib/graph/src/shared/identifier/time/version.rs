use std::{collections::Bound, error::Error, ops::RangeBounds};

use postgres_types::{FromSql, Type};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::time::timestamp::Timestamp;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
pub struct VersionTimespan<A> {
    pub start: Timestamp<A>,
    pub end: Option<Timestamp<A>>,
}

impl<A> VersionTimespan<A> {
    #[must_use]
    pub const fn new(start: Timestamp<A>, end: Option<Timestamp<A>>) -> Self {
        Self { start, end }
    }

    #[must_use]
    pub fn from_anonymous(timespan: VersionTimespan<()>) -> Self {
        Self {
            start: Timestamp::from_anonymous(timespan.start),
            end: timespan.end.map(Timestamp::from_anonymous),
        }
    }
}

impl<A> RangeBounds<Timestamp<A>> for VersionTimespan<A> {
    fn start_bound(&self) -> Bound<&Timestamp<A>> {
        Bound::Included(&self.start)
    }

    fn end_bound(&self) -> Bound<&Timestamp<A>> {
        self.end.as_ref().map_or(Bound::Unbounded, Bound::Excluded)
    }
}

impl FromSql<'_> for VersionTimespan<()> {
    fn from_sql(_: &Type, buf: &[u8]) -> Result<Self, Box<dyn Error + Send + Sync>> {
        match postgres_protocol::types::range_from_sql(buf)? {
            postgres_protocol::types::Range::Empty => {
                unimplemented!("Empty ranges are not supported")
            }
            postgres_protocol::types::Range::Nonempty(lower, upper) => Ok(Self {
                start: match super::parse_bound(&lower)? {
                    Bound::Included(timestamp) => timestamp,
                    Bound::Excluded(_) => unimplemented!(
                        "Excluded lower bounds are not supported on version timespans"
                    ),
                    Bound::Unbounded => unimplemented!(
                        "Unbounded lower bounds are not supported on version timespans"
                    ),
                },
                end: match super::parse_bound(&upper)? {
                    Bound::Included(_) => unimplemented!(
                        "Included upper bounds are not supported on version timespans"
                    ),
                    Bound::Excluded(timestamp) => Some(timestamp),
                    Bound::Unbounded => None,
                },
            }),
        }
    }

    fn accepts(ty: &Type) -> bool {
        matches!(ty, &Type::TSTZ_RANGE)
    }
}
