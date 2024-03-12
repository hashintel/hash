use derivative::Derivative;
use serde::{Deserialize, Serialize};
use temporal_versioning::{
    DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound, RightBoundedTemporalInterval,
    TemporalBound, TemporalInterval, TemporalTagged, TimeAxis, Timestamp, TransactionTime,
};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};

/// Marker trait for any temporal axis.
///
/// Contains useful metadata about the temporal axis.
#[cfg(feature = "utoipa")]
trait TemporalAxisSchema {
    /// The name of the temporal axis.
    fn noun() -> &'static str;
}

#[cfg(feature = "utoipa")]
impl TemporalAxisSchema for DecisionTime {
    fn noun() -> &'static str {
        "Decision"
    }
}

#[cfg(feature = "utoipa")]
impl TemporalAxisSchema for TransactionTime {
    fn noun() -> &'static str {
        "Transaction"
    }
}

/// Time axis for the variable temporal axis used in [`QueryTemporalAxes`]s.
///
/// This is used as the generic argument to time-related structs. Please refer to the documentation
/// of [`QueryTemporalAxes`] for more information.
///
/// [`QueryTemporalAxes`]: crate::subgraph::temporal_axes::QueryTemporalAxes
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct VariableAxis;

/// Time axis for the pinned temporal axis used in [`QueryTemporalAxes`]s.
///
/// This is used as the generic argument to time-related structs. Please refer to the documentation
/// of [`QueryTemporalAxes`] for more information.
///
/// [`QueryTemporalAxes`]: crate::subgraph::temporal_axes::QueryTemporalAxes
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PinnedAxis;

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

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct RightBoundedTemporalIntervalUnresolved<A> {
    pub start: Option<TemporalBound<A>>,
    pub end: Option<LimitedTemporalBound<A>>,
}

#[cfg(feature = "utoipa")]
impl<'s, A> ToSchema<'s> for RightBoundedTemporalIntervalUnresolved<A>
where
    A: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedRightBoundedTemporalInterval",
            openapi::ObjectBuilder::new()
                .property(
                    "start",
                    openapi::Schema::OneOf(
                        openapi::OneOfBuilder::new()
                            .item(openapi::Ref::from_schema_name(
                                TemporalBound::<A>::schema().0,
                            ))
                            .nullable(true)
                            .build(),
                    ),
                )
                .required("start")
                .property(
                    "end",
                    openapi::Schema::OneOf(
                        openapi::OneOfBuilder::new()
                            .item(openapi::Ref::from_schema_name(
                                LimitedTemporalBound::<A>::schema().0,
                            ))
                            .nullable(true)
                            .build(),
                    ),
                )
                .required("end")
                .into(),
        )
    }
}

#[cfg(feature = "utoipa")]
impl<'s, A> ToSchema<'s> for PinnedTemporalAxisUnresolved<A>
where
    A: ToSchema<'s> + TemporalAxisSchema,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedPinnedTemporalAxis",
            openapi::ObjectBuilder::new()
                .title(Some(format!("UnresolvedPinned{}Axis", A::noun())))
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

#[cfg(feature = "utoipa")]
impl<'s, A> ToSchema<'s> for VariableTemporalAxisUnresolved<A>
where
    A: ToSchema<'s> + TemporalAxisSchema,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedVariableTemporalAxis",
            openapi::ObjectBuilder::new()
                .title(Some(format!("UnresolvedVariable{}Axis", A::noun())))
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(untagged)]
pub enum QueryTemporalAxesUnresolved {
    #[cfg_attr(
        feature = "utoipa",
        schema(title = "QueryTemporalAxesUnresolvedDecisionTime")
    )]
    DecisionTime {
        #[cfg_attr(feature = "utoipa", schema(inline))]
        pinned: PinnedTemporalAxisUnresolved<TransactionTime>,
        #[cfg_attr(feature = "utoipa", schema(inline))]
        variable: VariableTemporalAxisUnresolved<DecisionTime>,
    },
    #[cfg_attr(
        feature = "utoipa",
        schema(title = "QueryTemporalAxesUnresolvedTransactionTime")
    )]
    TransactionTime {
        #[cfg_attr(feature = "utoipa", schema(inline))]
        pinned: PinnedTemporalAxisUnresolved<DecisionTime>,
        #[cfg_attr(feature = "utoipa", schema(inline))]
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

impl<A: Default> PinnedTemporalAxis<A> {
    #[must_use]
    pub fn new(timestamp: Timestamp<A>) -> Self {
        Self {
            axis: A::default(),
            timestamp,
        }
    }
}

#[cfg(feature = "utoipa")]
impl<'s, A> ToSchema<'s> for PinnedTemporalAxis<A>
where
    A: ToSchema<'s> + TemporalAxisSchema,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "PinnedTemporalAxis",
            openapi::ObjectBuilder::new()
                .title(Some(format!("Pinned{}Axis", A::noun())))
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

impl<A> VariableTemporalAxis<A>
where
    A: Default,
{
    #[must_use]
    pub fn new(start: TemporalBound<A>, end: LimitedTemporalBound<A>) -> Self {
        Self {
            axis: A::default(),
            interval: RightBoundedTemporalInterval::new(start, end),
        }
    }
}

impl<A> VariableTemporalAxis<A> {
    pub fn intersect(mut self, interval: LeftClosedTemporalInterval<A>) -> Option<Self> {
        let variable_interval: TemporalInterval<A> = self.interval.convert();
        let intersection = variable_interval.intersect(interval.convert())?;
        self.interval = intersection.convert();
        Some(self)
    }
}

#[cfg(feature = "utoipa")]
impl<'s, A> ToSchema<'s> for VariableTemporalAxis<A>
where
    A: ToSchema<'s> + TemporalAxisSchema,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "VariableTemporalAxis",
            openapi::ObjectBuilder::new()
                .title(Some(format!("Variable{}Axis", A::noun())))
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
/// [`Interval`]: temporal_versioning::Interval
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(untagged)]
pub enum QueryTemporalAxes {
    #[cfg_attr(feature = "utoipa", schema(title = "QueryTemporalAxesDecisionTime"))]
    DecisionTime {
        #[cfg_attr(feature = "utoipa", schema(inline))]
        pinned: PinnedTemporalAxis<TransactionTime>,
        #[cfg_attr(feature = "utoipa", schema(inline))]
        variable: VariableTemporalAxis<DecisionTime>,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "QueryTemporalAxesTransactionTime"))]
    TransactionTime {
        #[cfg_attr(feature = "utoipa", schema(inline))]
        pinned: PinnedTemporalAxis<DecisionTime>,
        #[cfg_attr(feature = "utoipa", schema(inline))]
        variable: VariableTemporalAxis<TransactionTime>,
    },
}

impl QueryTemporalAxes {
    #[must_use]
    pub fn from_variable_time_axis(
        time_axis: TimeAxis,
        pinned: Timestamp<PinnedAxis>,
        variable: RightBoundedTemporalInterval<VariableAxis>,
    ) -> Self {
        match time_axis {
            TimeAxis::DecisionTime => Self::DecisionTime {
                pinned: PinnedTemporalAxis {
                    axis: TransactionTime::TransactionTime,
                    timestamp: pinned.cast(),
                },
                variable: VariableTemporalAxis {
                    axis: DecisionTime::DecisionTime,
                    interval: variable.cast(),
                },
            },
            TimeAxis::TransactionTime => Self::TransactionTime {
                pinned: PinnedTemporalAxis {
                    axis: DecisionTime::DecisionTime,
                    timestamp: pinned.cast(),
                },
                variable: VariableTemporalAxis {
                    axis: TransactionTime::TransactionTime,
                    interval: variable.cast(),
                },
            },
        }
    }

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

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
pub struct SubgraphTemporalAxes {
    pub initial: QueryTemporalAxesUnresolved,
    pub resolved: QueryTemporalAxes,
}
