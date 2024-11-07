use serde::{Deserialize, Serialize};

use crate::{Interval, Timestamp};

/// Time axis for the decision time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum DecisionTime {
    #[default]
    DecisionTime,
}

/// Time axis for the transaction time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum TransactionTime {
    #[default]
    TransactionTime,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TimeAxis {
    DecisionTime,
    TransactionTime,
}

pub trait TemporalTagged {
    type Axis;
    type Tagged<A>: TemporalTagged<Axis = A>;

    fn cast<A>(self) -> Self::Tagged<A>;
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
