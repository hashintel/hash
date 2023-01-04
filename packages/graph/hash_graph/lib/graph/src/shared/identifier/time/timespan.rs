use std::{
    cmp::Ordering,
    ops::{Bound, RangeBounds},
};

use derivative::Derivative;
use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::Timestamp;

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
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
    const fn new(bound: Bound<Timestamp<A>>) -> Self {
        match bound {
            Bound::Unbounded => Self::Unbounded,
            Bound::Included(timestamp) => Self::Included(timestamp),
            Bound::Excluded(timestamp) => Self::Excluded(timestamp),
        }
    }

    #[must_use]
    const fn as_bound(self) -> Bound<Timestamp<A>> {
        match self {
            Self::Unbounded => Bound::Unbounded,
            Self::Included(timestamp) => Bound::Included(timestamp),
            Self::Excluded(timestamp) => Bound::Excluded(timestamp),
        }
    }
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

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(transparent, bound = "")]
struct LowerBound<A>(TimespanBound<A>);

impl<A> ToSchema for LowerBound<A> {
    fn schema() -> openapi::Schema {
        TimespanBound::<A>::schema()
    }
}

impl<A> LowerBound<A> {
    #[must_use]
    const fn new(bound: Bound<Timestamp<A>>) -> Self {
        Self(TimespanBound::new(bound))
    }
}

impl<A> PartialOrd for LowerBound<A> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<A> Ord for LowerBound<A> {
    fn cmp(&self, other: &Self) -> Ordering {
        match (&self.0, &other.0) {
            // (∞, _] vs (∞, _]
            (TimespanBound::Unbounded, TimespanBound::Unbounded) => Ordering::Equal,
            // (∞, _] vs [?, _]
            (TimespanBound::Unbounded, _) => Ordering::Less,
            // [?, _] vs (∞, _]
            (_, TimespanBound::Unbounded) => Ordering::Greater,

            // [x, _] vs (x, _]
            (TimespanBound::Included(lhs), TimespanBound::Excluded(rhs)) if lhs == rhs => {
                Ordering::Greater
            }
            // (x, _] vs [x, _]
            (TimespanBound::Excluded(lhs), TimespanBound::Included(rhs)) if lhs == rhs => {
                Ordering::Less
            }

            // [x, _] vs [y, _]
            // (x, _] vs (y, _]
            // [x, _] vs (y, _]
            // (x, _] vs [y, _]
            (
                TimespanBound::Included(lhs) | TimespanBound::Excluded(lhs),
                TimespanBound::Included(rhs) | TimespanBound::Excluded(rhs),
            ) => lhs.cmp(rhs),
        }
    }
}

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(transparent, bound = "")]
struct UpperBound<A>(TimespanBound<A>);

impl<A> UpperBound<A> {
    #[must_use]
    const fn new(bound: Bound<Timestamp<A>>) -> Self {
        Self(TimespanBound::new(bound))
    }
}

impl<A> ToSchema for UpperBound<A> {
    fn schema() -> openapi::Schema {
        TimespanBound::<A>::schema()
    }
}

impl<A> PartialOrd for UpperBound<A> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<A> Ord for UpperBound<A> {
    fn cmp(&self, other: &Self) -> Ordering {
        match (&self.0, &other.0) {
            // [_, ∞) vs [_, ∞)
            (TimespanBound::Unbounded, TimespanBound::Unbounded) => Ordering::Equal,
            // [_, ∞) vs [_, ?]
            (TimespanBound::Unbounded, _) => Ordering::Greater,
            // [_, ?] vs [_, ∞)
            (_, TimespanBound::Unbounded) => Ordering::Less,

            // [_, x] vs [_, x)
            (TimespanBound::Included(lhs), TimespanBound::Excluded(rhs)) if lhs == rhs => {
                Ordering::Less
            }
            // [_, x) vs [_, x]
            (TimespanBound::Excluded(lhs), TimespanBound::Included(rhs)) if lhs == rhs => {
                Ordering::Greater
            }

            // [_, x] vs [_, y]
            // [_, x) vs [_, y)
            // [_, x] vs [_, y)
            // [_, x] vs [_, y)
            (
                TimespanBound::Included(lhs) | TimespanBound::Excluded(lhs),
                TimespanBound::Included(rhs) | TimespanBound::Excluded(rhs),
            ) => lhs.cmp(rhs),
        }
    }
}

impl<A> PartialEq<LowerBound<A>> for UpperBound<A> {
    fn eq(&self, other: &LowerBound<A>) -> bool {
        if let (TimespanBound::Included(lhs), TimespanBound::Included(rhs)) = (&self.0, &other.0) {
            lhs == rhs
        } else {
            false
        }
    }
}

impl<A> PartialOrd<LowerBound<A>> for UpperBound<A> {
    fn partial_cmp(&self, other: &LowerBound<A>) -> Option<Ordering> {
        match (&self.0, &other.0) {
            // [_, ∞) vs (x, _]
            // [_, ∞) vs [x, _]
            // [_, ∞) vs (∞, _]
            // [_, x] vs (∞, _]
            // [_, x) vs (∞, _]
            (TimespanBound::Unbounded, _) | (_, TimespanBound::Unbounded) => {
                Some(Ordering::Greater)
            }

            // [_, x] vs (x, _]
            // [_, x) vs [x, _]
            (TimespanBound::Included(lhs), TimespanBound::Excluded(rhs))
            | (TimespanBound::Excluded(lhs), TimespanBound::Included(rhs))
                if lhs == rhs =>
            {
                Some(Ordering::Less)
            }

            // [_, x] vs [y, _]
            // [_, x) vs (y. _]
            // [_, x] vs (y, _]
            // [_, x) vs [y, _]
            (
                TimespanBound::Included(lhs) | TimespanBound::Excluded(lhs),
                TimespanBound::Included(rhs) | TimespanBound::Excluded(rhs),
            ) => lhs.partial_cmp(rhs),
        }
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
pub struct Timespan<A> {
    start: Option<LowerBound<A>>,
    end: Option<UpperBound<A>>,
}

impl<A> Timespan<A> {
    #[must_use]
    pub fn start_bound(&self) -> Option<Bound<Timestamp<A>>> {
        self.start.map(|bound| bound.0.as_bound())
    }

    #[must_use]
    pub fn end_bound(&self) -> Option<Bound<Timestamp<A>>> {
        self.end.map(|bound| bound.0.as_bound())
    }
}

impl<A, R: RangeBounds<Timestamp<A>>> From<R> for Timespan<A> {
    fn from(range: R) -> Self {
        Self {
            start: Some(LowerBound::new(range.start_bound().cloned())),
            end: Some(UpperBound::new(range.end_bound().cloned())),
        }
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
pub struct ResolvedTimespan<A> {
    start: LowerBound<A>,
    end: UpperBound<A>,
}

impl<A> ResolvedTimespan<A> {
    #[must_use]
    pub fn new(timespan: impl RangeBounds<Timestamp<A>>) -> Self {
        Self {
            start: LowerBound::new(timespan.start_bound().cloned()),
            end: UpperBound::new(timespan.end_bound().cloned()),
        }
    }

    #[must_use]
    pub const fn cast<B>(&self) -> ResolvedTimespan<B> {
        ResolvedTimespan {
            start: LowerBound(self.start.0.cast()),
            end: UpperBound(self.end.0.cast()),
        }
    }

    /// Returns if this timespan is strictly before the given timespan.
    #[must_use]
    pub fn is_strictly_left_of(&self, other: &Self) -> bool {
        self.end < other.start
    }

    /// Returns if this timespan is strictly after the given timespan.
    #[must_use]
    pub fn is_strictly_right_of(&self, other: &Self) -> bool {
        other.is_strictly_left_of(self)
    }

    /// Returns if the two timespans have any overlap.
    #[must_use]
    pub fn overlaps(&self, other: &Self) -> bool {
        !self.is_strictly_left_of(other) && !self.is_strictly_right_of(other)
    }

    /// Returns if the passed timespan is contained within this timespan.
    #[must_use]
    pub fn contains_range(&self, other: &Self) -> bool {
        self.start <= other.start && self.end >= other.end
    }

    /// Returns the intersection of two timespans.
    ///
    /// If the two timespans do not have overlap, `None` is returned.
    #[must_use]
    pub fn intersect(&self, other: &Self) -> Option<Self> {
        if !self.overlaps(other) {
            return None;
        }

        Some(Self {
            start: self.start.max(other.start),
            end: self.end.min(other.end),
        })
    }

    /// Returns the union of two timespans.
    ///
    /// If the two timespans do not have overlap, `None` is returned as this would result in two
    /// disjoint timespans.
    #[must_use]
    pub fn union(&self, other: &Self) -> Option<Self> {
        if !self.overlaps(other) {
            return None;
        }

        Some(Self {
            start: self.start.min(other.start),
            end: self.end.max(other.end),
        })
    }
}

impl<A> RangeBounds<Timestamp<A>> for ResolvedTimespan<A> {
    fn start_bound(&self) -> Bound<&Timestamp<A>> {
        match self.start.0 {
            TimespanBound::Included(ref timestamp) => Bound::Included(timestamp),
            TimespanBound::Excluded(ref timestamp) => Bound::Excluded(timestamp),
            TimespanBound::Unbounded => Bound::Unbounded,
        }
    }

    fn end_bound(&self) -> Bound<&Timestamp<A>> {
        match self.end.0 {
            TimespanBound::Included(ref timestamp) => Bound::Included(timestamp),
            TimespanBound::Excluded(ref timestamp) => Bound::Excluded(timestamp),
            TimespanBound::Unbounded => Bound::Unbounded,
        }
    }
}
