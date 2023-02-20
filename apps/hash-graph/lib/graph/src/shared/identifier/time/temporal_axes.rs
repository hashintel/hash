use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{
    axis::{PinnedAxis, TemporalTagged},
    bound::TemporalBound,
    DecisionTime, EntityVersionInterval, LimitedTemporalBound, LimitedTemporalInterval,
    TemporalInterval, TimeAxis, Timestamp, TransactionTime, UnresolvedTemporalInterval,
    VariableAxis,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnresolvedPinnedTemporalAxis<A> {
    pub axis: A,
    pub timestamp: Option<Timestamp<A>>,
}

impl<A: Default> UnresolvedPinnedTemporalAxis<A> {
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

impl<'s, A> ToSchema<'s> for UnresolvedPinnedTemporalAxis<A>
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnresolvedVariableTemporalAxis<A> {
    pub axis: A,
    #[serde(flatten)]
    pub interval: UnresolvedTemporalInterval<A>,
}

impl<A: Default> UnresolvedVariableTemporalAxis<A> {
    #[must_use]
    pub fn new(start: Option<TemporalBound<A>>, end: Option<LimitedTemporalBound<A>>) -> Self {
        Self {
            axis: A::default(),
            interval: UnresolvedTemporalInterval { start, end },
        }
    }

    pub fn resolve(self, now: Timestamp<()>) -> VariableTemporalAxis<A> {
        VariableTemporalAxis {
            axis: self.axis,
            interval: LimitedTemporalInterval::new(
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

impl<'s, A> ToSchema<'s> for UnresolvedVariableTemporalAxis<A>
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum UnresolvedTemporalAxes {
    #[schema(title = "UnresolvedDecisionTimeAxes")]
    DecisionTime {
        #[schema(inline)]
        pinned: UnresolvedPinnedTemporalAxis<TransactionTime>,
        #[schema(inline)]
        variable: UnresolvedVariableTemporalAxis<DecisionTime>,
    },
    #[schema(title = "UnresolvedTransactionTimeAxes")]
    TransactionTime {
        #[schema(inline)]
        pinned: UnresolvedPinnedTemporalAxis<DecisionTime>,
        #[schema(inline)]
        variable: UnresolvedVariableTemporalAxis<TransactionTime>,
    },
}

impl Default for UnresolvedTemporalAxes {
    fn default() -> Self {
        Self::DecisionTime {
            pinned: UnresolvedPinnedTemporalAxis::new(None),
            variable: UnresolvedVariableTemporalAxis::new(Some(TemporalBound::Unbounded), None),
        }
    }
}

impl UnresolvedTemporalAxes {
    #[must_use]
    pub fn resolve(self) -> TemporalAxes {
        let now = Timestamp::now();
        match self {
            Self::DecisionTime { pinned, variable } => TemporalAxes::DecisionTime {
                pinned: pinned.resolve(now),
                variable: variable.resolve(now),
            },
            Self::TransactionTime { pinned, variable } => TemporalAxes::TransactionTime {
                pinned: pinned.resolve(now),
                variable: variable.resolve(now),
            },
        }
    }
}

/// The pinned axis of a [`TemporalAxes`].
///
/// Please refer to the documentation of [`TemporalAxes`] for more information.
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

/// The variable time of a [`TemporalAxes`].
///
/// Please refer to the documentation of [`TemporalAxes`] for more information.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariableTemporalAxis<A> {
    pub axis: A,
    #[serde(flatten)]
    pub interval: LimitedTemporalInterval<A>,
}

impl<A> VariableTemporalAxis<A> {
    pub fn intersect(mut self, interval: EntityVersionInterval<A>) -> Option<Self> {
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
                    "start",
                    openapi::Ref::from_schema_name(TemporalBound::<A>::schema().0),
                )
                .required("start")
                .property(
                    "end",
                    openapi::Ref::from_schema_name(LimitedTemporalBound::<A>::schema().0),
                )
                .required("end")
                .into(),
        )
    }
}

/// Constrains the temporal data in the Graph to a specific [`TimeAxis`].
///
/// When querying the Graph, temporal data is returned. The Graph is implemented as a bitemporal
/// data store, which means the knowledge data contains information about the time of when the
/// knowledge was inserted into the Graph, the [`TransactionTime`], and when the knowledge was
/// decided to be inserted, the [`DecisionTime`].
///
/// In order to query data from the Graph, only one of the two time axes can be used. This is
/// achieved by using a `TimeProjection`. The `TimeProjection` pins one axis to a specified
/// [`Timestamp`], while the other axis can be a [`Interval`]. The pinned axis is called the
/// [`PinnedTemporalAxis`] and the other axis is called the [`VariableTemporalAxis`] of a
/// projection. The returned data will then only contain temporal data that is contained in the
/// [`Interval`] of the [`VariableTemporalAxis`], the [`VariableAxis`], for the given [`Timestamp`]
/// of the [`PinnedTemporalAxis`].
///
/// [`Interval`]: crate::interval::Interval
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum TemporalAxes {
    #[schema(title = "DecisionTimeAxes")]
    DecisionTime {
        #[schema(inline)]
        pinned: PinnedTemporalAxis<TransactionTime>,
        #[schema(inline)]
        variable: VariableTemporalAxis<DecisionTime>,
    },
    #[schema(title = "TransactionTimeAxes")]
    TransactionTime {
        #[schema(inline)]
        pinned: PinnedTemporalAxis<DecisionTime>,
        #[schema(inline)]
        variable: VariableTemporalAxis<TransactionTime>,
    },
}

impl TemporalAxes {
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
    pub fn variable_interval(&self) -> LimitedTemporalInterval<VariableAxis> {
        match self {
            Self::DecisionTime { variable, .. } => variable.interval.cast(),
            Self::TransactionTime { variable, .. } => variable.interval.cast(),
        }
    }

    /// Intersects the image of the projection with the provided [`Interval`].
    ///
    /// If the two intervals do not overlap, [`None`] is returned.
    ///
    /// [`Interval`]: crate::interval::Interval
    #[must_use]
    pub fn intersect_variable_interval(
        self,
        version_interval: EntityVersionInterval<VariableAxis>,
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

    pub fn set_variable_interval(&mut self, interval: LimitedTemporalInterval<VariableAxis>) {
        match self {
            Self::DecisionTime { variable, .. } => variable.interval = interval.cast(),
            Self::TransactionTime { variable, .. } => variable.interval = interval.cast(),
        }
    }
}
