use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{
    axis::{PinnedAxis, TemporalTagged},
    bound::TemporalBound,
    DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound, RightBoundedTemporalInterval,
    RightBoundedTemporalIntervalUnresolved, TemporalInterval, TimeAxis, Timestamp, TransactionTime,
    VariableAxis,
};

/// A representation of a "pinned" temporal axis, used to project another temporal axis along the
/// given [`Timestamp`].
///
/// If the `timestamp` is `None`, then it will be filled in with the current time _when a query
/// is being resolved._
///
/// In a bitemporal system, a `PinnedTemporalAxisUnresolved` should almost always be accompanied by
/// a [`VariableTemporalAxisUnresolved`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PinnedTemporalAxisUnresolved<A> {
    pub axis: A,
    pub timestamp: Option<Timestamp<A>>,
}

impl<A: Default> PinnedTemporalAxisUnresolved<A> {
    #[must_use]
    pub fn new(timestamp: Option<Timestamp<A>>) -> Self {
        Self {
            axis: A::default(),
            timestamp,
        }
    }

    pub fn resolve(self, now: Timestamp<()>) -> PinnedTemporalAxis<A> {
        PinnedTemporalAxis {
            axis: self.axis,
            timestamp: self
                .timestamp
                .unwrap_or_else(|| Timestamp::from_anonymous(now)),
        }
    }
}

impl<'s, A> ToSchema<'s> for PinnedTemporalAxisUnresolved<A>
where
    A: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedPinnedTemporalAxis",
            openapi::ObjectBuilder::new()
                .property("axis", openapi::Ref::from_schema_name(A::schema().0))
                .required("axis")
                .property(
                    "timestamp",
                    openapi::Ref::from_schema_name("NullableTimestamp"),
                )
                .required("timestamp")
                .build()
                .into(),
        )
    }
}

/// A representation of a "variable" temporal axis, which is optionally bounded to a given interval.
///
/// The interval may have some bounds omitted for later processing (see
/// [`RightBoundedTemporalIntervalUnresolved`]), whereby `None` values are replaced with inclusive
/// bounds referring the current [`Timestamp`]. In a bitemporal system, a
/// `VariableTemporalAxisUnresolved` should almost always be accompanied by a
/// [`PinnedTemporalAxisUnresolved`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariableTemporalAxisUnresolved<A> {
    pub axis: A,
    pub interval: RightBoundedTemporalIntervalUnresolved<A>,
}

impl<A: Default> VariableTemporalAxisUnresolved<A> {
    #[must_use]
    pub fn new(start: Option<TemporalBound<A>>, end: Option<LimitedTemporalBound<A>>) -> Self {
        Self {
            axis: A::default(),
            interval: RightBoundedTemporalIntervalUnresolved { start, end },
        }
    }

    pub fn resolve(self, now: Timestamp<()>) -> VariableTemporalAxis<A> {
        VariableTemporalAxis {
            axis: self.axis,
            interval: RightBoundedTemporalInterval::new(
                self.interval
                    .start
                    .unwrap_or_else(|| TemporalBound::Inclusive(Timestamp::from_anonymous(now))),
                self.interval.end.unwrap_or_else(|| {
                    LimitedTemporalBound::Inclusive(Timestamp::from_anonymous(now))
                }),
            ),
        }
    }
}

impl<'s, A> ToSchema<'s> for VariableTemporalAxisUnresolved<A>
where
    A: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedVariableTemporalAxis",
            openapi::ObjectBuilder::new()
                .property("axis", openapi::Ref::from_schema_name(A::schema().0))
                .required("axis")
                .property(
                    "interval",
                    openapi::Ref::from_schema_name(
                        RightBoundedTemporalIntervalUnresolved::<A>::schema().0,
                    ),
                )
                .required("interval")
                .into(),
        )
    }
}

/// Defines the two possible combinations of pinned/variable temporal axes that are used in queries
/// that return [`Subgraph`]s.
///
/// The [`VariableTemporalAxisUnresolved`] is optionally bounded, in the absence of provided
/// bounds an inclusive bound at the timestamp at point of resolving is assumed.
///
/// [`Subgraph`]: crate::subgraph::Subgraph
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum QueryTemporalAxesUnresolved {
    #[schema(title = "QueryTemporalAxesUnresolvedDecisionTime")]
    DecisionTime {
        #[schema(inline)]
        pinned: PinnedTemporalAxisUnresolved<TransactionTime>,
        #[schema(inline)]
        variable: VariableTemporalAxisUnresolved<DecisionTime>,
    },
    #[schema(title = "QueryTemporalAxesUnresolvedTransactionTime")]
    TransactionTime {
        #[schema(inline)]
        pinned: PinnedTemporalAxisUnresolved<DecisionTime>,
        #[schema(inline)]
        variable: VariableTemporalAxisUnresolved<TransactionTime>,
    },
}

impl Default for QueryTemporalAxesUnresolved {
    fn default() -> Self {
        Self::DecisionTime {
            pinned: PinnedTemporalAxisUnresolved::new(None),
            variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
        }
    }
}

impl QueryTemporalAxesUnresolved {
    #[must_use]
    pub fn resolve(self) -> QueryTemporalAxes {
        let now = Timestamp::now();
        match self {
            Self::DecisionTime { pinned, variable } => QueryTemporalAxes::DecisionTime {
                pinned: pinned.resolve(now),
                variable: variable.resolve(now),
            },
            Self::TransactionTime { pinned, variable } => QueryTemporalAxes::TransactionTime {
                pinned: pinned.resolve(now),
                variable: variable.resolve(now),
            },
        }
    }
}

/// A representation of a "pinned" temporal axis, used to project another temporal axis along the
/// given [`Timestamp`].
///
/// In a bitemporal system, a `PinnedTemporalAxis` should almost always be accompanied by a
/// [`VariableTemporalAxis`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PinnedTemporalAxis<A> {
    pub axis: A,
    pub timestamp: Timestamp<A>,
}

impl<'s, A> ToSchema<'s> for PinnedTemporalAxis<A>
where
    A: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "PinnedTemporalAxis",
            openapi::ObjectBuilder::new()
                .property("axis", openapi::Ref::from_schema_name(A::schema().0))
                .required("axis")
                .property("timestamp", Timestamp::<A>::schema().1)
                .required("timestamp")
                .build()
                .into(),
        )
    }
}

/// A representation of a "variable" temporal axis, which bounded to a given
/// [`RightBoundedTemporalInterval`].
///
/// In a bitemporal system, a `VariableTemporalAxis` should almost always be accompanied by a
/// [`PinnedTemporalAxis`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariableTemporalAxis<A> {
    pub axis: A,
    pub interval: RightBoundedTemporalInterval<A>,
}

impl<A> VariableTemporalAxis<A> {
    pub fn intersect(mut self, interval: LeftClosedTemporalInterval<A>) -> Option<Self> {
        let variable_interval: TemporalInterval<A> = self.interval.convert();
        let intersection = variable_interval.intersect(interval.convert())?;
        self.interval = intersection.convert();
        Some(self)
    }
}

impl<'s, A> ToSchema<'s> for VariableTemporalAxis<A>
where
    A: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "VariableTemporalAxis",
            openapi::ObjectBuilder::new()
                .property("axis", openapi::Ref::from_schema_name(A::schema().0))
                .required("axis")
                .property(
                    "interval",
                    openapi::Ref::from_schema_name("RightBoundedTemporalInterval"),
                )
                .required("interval")
                .into(),
        )
    }
}

/// Defines the two possible combinations of pinned/variable temporal axes that are used in
/// responses to queries that return [`Subgraph`]s.
///
/// When querying the Graph, temporal data is returned. The Graph is implemented as a bitemporal
/// data store, which means the knowledge data contains information about the time of when the
/// knowledge was inserted into the Graph, the [`TransactionTime`], and when the knowledge was
/// decided to be inserted, the [`DecisionTime`].
///
/// In order to query data from the Graph, only one of the two time axes can be used. This is
/// achieved by using a `TemporalAxes`. The `TemporalAxes` pins one axis to a specified
/// [`Timestamp`], while the other axis can be a [`Interval`]. The pinned axis is called the
/// [`PinnedTemporalAxis`] and the other axis is called the [`VariableTemporalAxis`]. The returned
/// data will then only contain temporal data that is contained in the [`Interval`] of the
/// [`VariableTemporalAxis`] for the given [`Timestamp`] of the [`PinnedTemporalAxis`].
///
/// [`Subgraph`]: crate::subgraph::Subgraph
/// [`Interval`]: crate::interval::Interval
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum QueryTemporalAxes {
    #[schema(title = "QueryTemporalAxesDecisionTime")]
    DecisionTime {
        #[schema(inline)]
        pinned: PinnedTemporalAxis<TransactionTime>,
        #[schema(inline)]
        variable: VariableTemporalAxis<DecisionTime>,
    },
    #[schema(title = "QueryTemporalAxesTransactionTime")]
    TransactionTime {
        #[schema(inline)]
        pinned: PinnedTemporalAxis<DecisionTime>,
        #[schema(inline)]
        variable: VariableTemporalAxis<TransactionTime>,
    },
}

impl QueryTemporalAxes {
    #[must_use]
    pub const fn pinned_time_axis(&self) -> TimeAxis {
        match self {
            Self::DecisionTime { .. } => TimeAxis::TransactionTime,
            Self::TransactionTime { .. } => TimeAxis::DecisionTime,
        }
    }

    #[must_use]
    pub const fn variable_time_axis(&self) -> TimeAxis {
        match self {
            Self::DecisionTime { .. } => TimeAxis::DecisionTime,
            Self::TransactionTime { .. } => TimeAxis::TransactionTime,
        }
    }

    #[must_use]
    pub fn pinned_timestamp(&self) -> Timestamp<PinnedAxis> {
        match self {
            Self::DecisionTime { pinned, .. } => pinned.timestamp.cast(),
            Self::TransactionTime { pinned, .. } => pinned.timestamp.cast(),
        }
    }

    #[must_use]
    pub fn variable_interval(&self) -> RightBoundedTemporalInterval<VariableAxis> {
        match self {
            Self::DecisionTime { variable, .. } => variable.interval.cast(),
            Self::TransactionTime { variable, .. } => variable.interval.cast(),
        }
    }

    /// Intersects the variable interval of the temporal axes with the provided
    /// [`LeftClosedTemporalInterval`].
    ///
    /// If the two intervals do not overlap, [`None`] is returned.
    #[must_use]
    pub fn intersect_variable_interval(
        self,
        version_interval: LeftClosedTemporalInterval<VariableAxis>,
    ) -> Option<Self> {
        match self {
            Self::DecisionTime { pinned, variable } => variable
                .intersect(version_interval.cast())
                .map(|variable| Self::DecisionTime { pinned, variable }),
            Self::TransactionTime { pinned, variable } => variable
                .intersect(version_interval.cast())
                .map(|variable| Self::TransactionTime { pinned, variable }),
        }
    }

    pub fn set_variable_interval(&mut self, interval: RightBoundedTemporalInterval<VariableAxis>) {
        match self {
            Self::DecisionTime { variable, .. } => variable.interval = interval.cast(),
            Self::TransactionTime { variable, .. } => variable.interval = interval.cast(),
        }
    }
}
