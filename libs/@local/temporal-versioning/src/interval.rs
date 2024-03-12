use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
    iter::{once, Chain, Once},
    marker::PhantomData,
    ops::{Bound, RangeBounds},
};
#[cfg(feature = "postgres")]
use std::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_protocol::types::{timestamp_from_sql, RangeBound};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql, Type};
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};

use crate::bounds::{compare_bounds, BoundType, IntervalBound, IntervalBoundHelper};
#[cfg(feature = "postgres")]
use crate::Timestamp;

enum Return<T> {
    None,
    One(Once<T>),
    Two(Chain<Once<T>, Once<T>>),
}

impl<T> Return<T> {
    const fn none() -> Self {
        Self::None
    }

    fn one(value: T) -> Self {
        Self::One(once(value))
    }

    fn two(first: T, second: T) -> Self {
        Self::Two(once(first).chain(once(second)))
    }
}

impl<T> Iterator for Return<T> {
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::None => None,
            Self::One(value) => value.next(),
            Self::Two(values) => values.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Self::None => (0, Some(0)),
            Self::One(_) => (1, Some(1)),
            Self::Two(_) => (2, Some(2)),
        }
    }
}

impl<T> ExactSizeIterator for Return<T> {
    fn len(&self) -> usize {
        self.size_hint().0
    }
}

#[derive(Copy, Clone, Serialize, Deserialize)]
#[serde(bound(
    serialize = "S: Serialize, E: Serialize",
    deserialize = "S: Deserialize<'de>, E: Deserialize<'de>"
))]
pub struct Interval<T, S, E> {
    start: S,
    end: E,
    #[serde(skip)]
    _marker: PhantomData<T>,
}

impl<T, S, E> Interval<T, S, E> {
    /// Creates an interval from the given bounds.
    ///
    /// The start bound must be less than or equal to the end bound.
    pub const fn new_unchecked(start: S, end: E) -> Self {
        Self {
            start,
            end,
            _marker: PhantomData,
        }
    }

    /// Returns a reference to the start bound of this interval
    pub const fn start(&self) -> &S {
        &self.start
    }

    /// Returns a reference to the end bound of this interval
    pub const fn end(&self) -> &E {
        &self.end
    }

    /// Converts the interval into its bounds.
    pub fn into_bounds(self) -> (S, E) {
        (self.start, self.end)
    }
}

impl<T, S: IntervalBound<T>, E: IntervalBound<T>> Interval<T, S, E> {
    /// Creates an interval from the given bounds.
    ///
    /// # Panics
    ///
    /// Panics if the start bound is greater than the end bound.
    pub fn new(start: S, end: E) -> Self
    where
        T: Ord,
    {
        assert_ne!(
            compare_bounds(
                start.as_bound(),
                end.as_bound(),
                BoundType::Start,
                BoundType::End,
                Ord::cmp,
            ),
            Ordering::Greater,
            "Start bound must be less than or equal to end bound"
        );
        Self::new_unchecked(start, end)
    }

    pub fn convert<S2, E2>(self) -> Interval<T, E2, S2>
    where
        E2: IntervalBound<T>,
        S2: IntervalBound<T>,
    {
        let (lower, upper) = self.into_bounds();
        Interval::new_unchecked(
            E2::from_bound(lower.into_bound()),
            S2::from_bound(upper.into_bound()),
        )
    }

    /// Returns `true` if both intervals have any points in common.
    #[must_use]
    pub fn overlaps(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> bool
    where
        T: Ord,
    {
        // Examples |      1     |     2
        // =========|============|============
        // Range A  |    [-----] | [-----]
        // Range B  | [-----]    |    [-----]
        matches!(
            self.cmp_start_to_start(other),
            Ordering::Greater | Ordering::Equal
        ) && matches!(
            self.cmp_start_to_end(other),
            Ordering::Less | Ordering::Equal
        ) || matches!(
            other.cmp_start_to_start(self),
            Ordering::Greater | Ordering::Equal
        ) && matches!(
            other.cmp_start_to_end(self),
            Ordering::Less | Ordering::Equal
        )
    }

    /// Returns `true` if both intervals are adjacent but do not overlap.
    #[must_use]
    pub fn is_adjacent_to(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> bool
    where
        T: Eq,
    {
        fn bounds_are_adjacent<T>(lhs: &impl IntervalBound<T>, rhs: &impl IntervalBound<T>) -> bool
        where
            T: Eq,
        {
            match (lhs.as_bound(), rhs.as_bound()) {
                (Bound::Included(lhs), Bound::Excluded(rhs))
                | (Bound::Excluded(lhs), Bound::Included(rhs)) => lhs == rhs,
                _ => false,
            }
        }

        bounds_are_adjacent(self.start(), other.end())
            || bounds_are_adjacent(other.start(), self.end())
    }

    /// Checks if this interval contains the other value.
    ///
    /// Returns `true` if this interval's start bound is less than or equal to `other` and this
    /// interval's end bound is greater than or equal to `other`.
    #[must_use]
    pub fn contains_point(&self, other: &T) -> bool
    where
        T: Ord,
    {
        matches!(
            compare_bounds(
                self.start().as_bound(),
                Bound::Included(other),
                BoundType::Start,
                BoundType::Start,
                Ord::cmp,
            ),
            Ordering::Less | Ordering::Equal
        ) && matches!(
            compare_bounds(
                self.end().as_bound(),
                Bound::Included(other),
                BoundType::End,
                BoundType::End,
                Ord::cmp,
            ),
            Ordering::Greater | Ordering::Equal
        )
    }

    /// Checks if this interval completely contains the other interval.
    ///
    /// Returns `true` if this interval's start bound is less than or equal to the other interval's
    /// start bound and this interval's end bound is greater than or equal to the other
    /// interval's end bound.
    #[must_use]
    pub fn contains_interval(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> bool
    where
        T: Ord,
    {
        matches!(
            self.cmp_start_to_start(other),
            Ordering::Less | Ordering::Equal
        ) && matches!(
            self.cmp_end_to_end(other),
            Ordering::Greater | Ordering::Equal
        )
    }

    /// Returns the complement of this interval.
    ///
    /// A complement is the interval of all points that are not in the this interval. The resulting
    /// interval and this interval do not overlap.
    #[must_use]
    pub fn complement(self) -> impl ExactSizeIterator<Item = Self>
    where
        T: Ord,
    {
        // Examples   |      1      |    2    |    3    |    4    |    5
        // =========================|=========|=========|=========|=========
        // Range      |   [-----]   | ---)    | ---]    |    (--- |    [---
        // -------------------------|---------|---------|---------|---------
        // Complement | --)     (-- |    [--- |    (--- | ---]    | ---)
        let start = S::from_bound(Bound::Unbounded);
        let end = E::from_bound(Bound::Unbounded);
        Self::new_unchecked(start, end).difference(self)
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::union`], this method does also return the points between the
    /// intervals if they do not overlap.
    #[must_use]
    pub fn merge(self, other: Self) -> Self
    where
        T: Ord,
    {
        let start_ordering = self.cmp_start_to_start(&other);
        let end_ordering = self.cmp_end_to_end(&other);
        // Examples |     1     |      2    |        3        |        4        |      5
        // =========|===========|===========|=================|=================|=============
        // Range A  |   [-----] | [-----]   | [-----]         |         [-----] | [---------]
        // Range B  | [-----]   |   [-----] |         [-----] | [-----]         |   [-----]
        // ---------|-----------|-----------|-----------------|-----------------|-------------
        // Merge    | [-------] | [-------] | [-------------] | [-------------] | [---------]
        Self::new_unchecked(
            match start_ordering {
                Ordering::Less | Ordering::Equal => self.start,
                Ordering::Greater => other.start,
            },
            match end_ordering {
                Ordering::Greater | Ordering::Equal => self.end,
                Ordering::Less => other.end,
            },
        )
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::merge`], this method returns two intervals if they don't overlap.
    /// If two intervals are returned, the ordering is stable, i.e. `self` is always the first
    /// interval and `other` is always the second interval.
    pub fn union(self, other: Self) -> impl ExactSizeIterator<Item = Self>
    where
        T: Ord,
    {
        if self.overlaps(&other) || self.is_adjacent_to(&other) {
            Return::one(self.merge(other))
        } else {
            Return::two(self, other)
        }
    }

    /// Returns a new interval that contains all points in both intervals.
    #[must_use]
    pub fn intersect(self, other: Self) -> Option<Self>
    where
        T: Ord,
    {
        self.overlaps(&other).then(|| {
            let start_ordering = self.cmp_start_to_start(&other);
            let end_ordering = self.cmp_end_to_end(&other);

            // Examples     |     1     |     2
            // =============|===========|===========
            // Range A      |   [-----] | [-----]
            // Range B      | [-----]   |   [-----]
            // -------------|-----------|-----------
            // Intersection |   [---]   |   [---]
            Self::new_unchecked(
                match start_ordering {
                    Ordering::Less | Ordering::Equal => other.start,
                    Ordering::Greater => self.start,
                },
                match end_ordering {
                    Ordering::Less | Ordering::Equal => self.end,
                    Ordering::Greater => other.end,
                },
            )
        })
    }

    /// Returns the first interval without the second interval.
    ///
    /// If the intervals do not overlap, the first interval is returned. If the result would be two
    /// disjoint intervals, `None` is returned.
    pub fn difference(self, other: Self) -> impl ExactSizeIterator<Item = Self>
    where
        T: Ord,
    {
        match (
            self.cmp_start_to_start(&other),
            self.cmp_start_to_end(&other),
            self.cmp_end_to_start(&other),
            self.cmp_end_to_end(&other),
        ) {
            // Range B is completely contained in range A:
            // Example    |         1
            // ===========|===================
            // Range A    | [---------------]
            // Range B    |     [-------]
            // -----------|-------------------
            // Difference | [---]       [---]
            (Ordering::Less, _, _, Ordering::Greater) => Return::two(
                Self::new_unchecked(self.start, other.start.flip()),
                Self::new_unchecked(other.end.flip(), self.end),
            ),

            // Ranges do not overlap:
            // Example    |      1
            // ===========|==============
            // Range A    |        [---]
            // Range B    | [---]
            // -----------|--------------
            // Difference |        [---]
            (_, Ordering::Greater, ..) | (_, _, Ordering::Less, _) => Return::one(self),

            // Range A is completely contained in range B:
            // Examples   |     1     |    2    |    3    |   4
            // ===========|===========|=========|=========|=======
            // Range A    |   [---]   | [---]   |   [---] | [---]
            // Range B    | [-------] | [-----] | [-----] | [---]
            // -----------|-----------|---------|---------|-------
            // Difference |   empty   |  empty  |  empty  | empty
            (Ordering::Greater | Ordering::Equal, .., Ordering::Less | Ordering::Equal) => {
                Return::none()
            }

            // Range A starts before range B:
            // Examples   |     1     |     2
            // ===========|===========|===========
            // Range A    | [-----]   | [-------]
            // Range B    |     [---] |     [---]
            // -----------|-----------|-----------
            // Difference | [---]     | [---]
            (
                Ordering::Less,
                _,
                Ordering::Greater | Ordering::Equal,
                Ordering::Less | Ordering::Equal,
            ) => Return::one(Self::new_unchecked(self.start, other.start.flip())),

            // Range A ends after range B:
            // Examples   |     1     |     2
            // ===========|===========|===========
            // Range A    |   [-----] | [-------]
            // Range B    | [---]     | [---]
            // -----------|-----------|-----------
            // Difference |     [---] |     [---]
            (
                Ordering::Greater | Ordering::Equal,
                Ordering::Less | Ordering::Equal,
                _,
                Ordering::Greater,
            ) => Return::one(Self::new_unchecked(other.end.flip(), self.end)),
        }
    }
}

impl<T, S, E> RangeBounds<T> for Interval<T, S, E>
where
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    fn start_bound(&self) -> Bound<&T> {
        self.start.as_bound()
    }

    fn end_bound(&self) -> Bound<&T> {
        self.end.as_bound()
    }
}

impl<T, S, E, R> PartialEq<R> for Interval<T, S, E>
where
    T: PartialEq,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
    R: RangeBounds<T>,
{
    fn eq(&self, other: &R) -> bool {
        self.start_bound() == other.start_bound() && self.end_bound() == other.end_bound()
    }
}

impl<T, S, E> Eq for Interval<T, S, E>
where
    T: Eq,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
}

impl<T, S, E> PartialOrd for Interval<T, S, E>
where
    T: PartialOrd,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        let start_ordering = compare_bounds(
            self.start_bound(),
            other.start_bound(),
            BoundType::Start,
            BoundType::Start,
            PartialOrd::partial_cmp,
        )?;
        match start_ordering {
            Ordering::Equal => compare_bounds(
                self.end_bound(),
                other.end_bound(),
                BoundType::End,
                BoundType::End,
                PartialOrd::partial_cmp,
            ),
            ordering => Some(ordering),
        }
    }
}

impl<T, S, E> Ord for Interval<T, S, E>
where
    T: Ord,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    fn cmp(&self, other: &Self) -> Ordering {
        self.cmp_start_to_start(other)
            .then_with(|| self.cmp_end_to_end(other))
    }
}

impl<T, S, E> Hash for Interval<T, S, E>
where
    S: Hash,
    E: Hash,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.start.hash(state);
        self.end.hash(state);
    }
}

impl<T, S, E> fmt::Debug for Interval<T, S, E>
where
    T: fmt::Debug,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.start_bound() {
            Bound::Included(limit) => write!(fmt, "[{limit:?}")?,
            Bound::Excluded(limit) => write!(fmt, "({limit:?}")?,
            Bound::Unbounded => write!(fmt, "(-\u{221e}")?, // ∞
        }
        fmt.write_str(", ")?;
        match self.end_bound() {
            Bound::Included(limit) => write!(fmt, "{limit:?}]"),
            Bound::Excluded(limit) => write!(fmt, "{limit:?})"),
            Bound::Unbounded => write!(fmt, "+\u{221e})"), // ∞
        }
    }
}

#[cfg(feature = "postgres")]
impl<A, S, E> ToSql for Interval<Timestamp<A>, S, E>
where
    S: IntervalBound<Timestamp<A>> + fmt::Debug,
    E: IntervalBound<Timestamp<A>> + fmt::Debug,
{
    postgres_types::to_sql_checked!();

    fn accepts(ty: &Type) -> bool {
        *ty == Type::TSTZ_RANGE
    }

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

#[cfg(feature = "postgres")]
fn is_infinity(bytes: &[u8]) -> Result<bool, Box<dyn Error + Send + Sync>> {
    let sql_timestamp = timestamp_from_sql(bytes)?;
    Ok(sql_timestamp == i64::MIN || sql_timestamp == i64::MAX)
}

#[cfg(feature = "postgres")]
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
        RangeBound::Inclusive(Some(bytes)) => Ok(Bound::Included(Timestamp::from_sql(
            &Type::TIMESTAMPTZ,
            bytes,
        )?)),
        RangeBound::Exclusive(Some(bytes)) => Ok(Bound::Excluded(Timestamp::from_sql(
            &Type::TIMESTAMPTZ,
            bytes,
        )?)),
        RangeBound::Inclusive(None) | RangeBound::Exclusive(None) => {
            unimplemented!("null ranges are not supported")
        }
        RangeBound::Unbounded => Ok(Bound::Unbounded),
    }
}

#[cfg(feature = "postgres")]
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
        *ty == Type::TSTZ_RANGE
    }
}

#[cfg(feature = "utoipa")]
// utoipa does not properly support generics yet, so we need to manually implement ToSchema for
// Interval. `#[schema(inline)]` does not work as well as it does not add a `ToSchema` bound.
impl<'s, A, S, E> ToSchema<'s> for Interval<A, S, E>
where
    S: ToSchema<'s>,
    E: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "Interval",
            openapi::Schema::Object(
                openapi::ObjectBuilder::new()
                    .property("start", openapi::Ref::from_schema_name(S::schema().0))
                    .required("start")
                    .property("end", openapi::Ref::from_schema_name(E::schema().0))
                    .required("end")
                    .build(),
            )
            .into(),
        )
    }
}
