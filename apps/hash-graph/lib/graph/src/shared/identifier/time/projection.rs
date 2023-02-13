use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::{
    identifier::time::{
        axis::TemporalTagged, bound::TimeIntervalBound, DecisionTime, IncludedTimeIntervalBound,
        LimitedTimeIntervalBound, ProjectedTime, TimeAxis, Timestamp, TransactionTime,
        UnboundedOrExcludedTimeIntervalBound, UnresolvedTimeInterval,
    },
    interval::Interval,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnresolvedKernel<A> {
    pub axis: A,
    pub timestamp: Option<Timestamp<A>>,
}

impl<A: Default> UnresolvedKernel<A> {
    #[must_use]
    pub fn new(timestamp: Option<Timestamp<A>>) -> Self {
        Self {
            axis: A::default(),
            timestamp,
        }
    }
}

pub type UnresolvedDecisionTimeKernel = UnresolvedKernel<DecisionTime>;

impl ToSchema<'_> for UnresolvedDecisionTimeKernel {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedDecisionTimeKernel",
            openapi::ObjectBuilder::new()
                .property(
                    "axis",
                    openapi::Ref::from_schema_name(DecisionTime::schema().0),
                )
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

pub type UnresolvedTransactionTimeKernel = UnresolvedKernel<TransactionTime>;

impl ToSchema<'_> for UnresolvedTransactionTimeKernel {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedTransactionTimeKernel",
            openapi::ObjectBuilder::new()
                .property(
                    "axis",
                    openapi::Ref::from_schema_name(TransactionTime::schema().0),
                )
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
pub struct UnresolvedImage<A> {
    pub axis: A,
    #[serde(flatten)]
    pub interval: UnresolvedTimeInterval<A>,
}

impl<A: Default> UnresolvedImage<A> {
    #[must_use]
    pub fn new(
        start: Option<TimeIntervalBound<A>>,
        end: Option<LimitedTimeIntervalBound<A>>,
    ) -> Self {
        Self {
            axis: A::default(),
            interval: UnresolvedTimeInterval { start, end },
        }
    }
}

pub type UnresolvedDecisionTimeImage = UnresolvedImage<DecisionTime>;

impl ToSchema<'_> for UnresolvedImage<DecisionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedDecisionTimeImage",
            openapi::Schema::AllOf(
                openapi::AllOfBuilder::new()
                    .item(
                        openapi::ObjectBuilder::new()
                            .property(
                                "axis",
                                openapi::Ref::from_schema_name(DecisionTime::schema().0),
                            )
                            .required("axis"),
                    )
                    .item(UnresolvedTimeInterval::<DecisionTime>::schema().1)
                    .build(),
            )
            .into(),
        )
    }
}

pub type UnresolvedTransactionTimeImage = UnresolvedImage<TransactionTime>;

impl ToSchema<'_> for UnresolvedImage<TransactionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedTransactionTimeImage",
            openapi::Schema::AllOf(
                openapi::AllOfBuilder::new()
                    .item(
                        openapi::ObjectBuilder::new()
                            .property(
                                "axis",
                                openapi::Ref::from_schema_name(TransactionTime::schema().0),
                            )
                            .required("axis"),
                    )
                    .item(UnresolvedTimeInterval::<TransactionTime>::schema().1)
                    .build(),
            )
            .into(),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnresolvedProjection<K, I> {
    pub pinned: UnresolvedKernel<K>,
    pub variable: UnresolvedImage<I>,
}

impl<K, I> UnresolvedProjection<K, I> {
    pub fn resolve(self) -> Projection<K, I> {
        let now = Timestamp::now();
        Projection {
            pinned: Kernel {
                axis: self.pinned.axis,
                timestamp: self
                    .pinned
                    .timestamp
                    .unwrap_or_else(|| Timestamp::from_anonymous(now)),
            },
            variable: Image {
                axis: self.variable.axis,
                interval: Interval::new(
                    self.variable.interval.start.unwrap_or_else(|| {
                        TimeIntervalBound::Inclusive(Timestamp::from_anonymous(now))
                    }),
                    self.variable.interval.end.unwrap_or_else(|| {
                        LimitedTimeIntervalBound::Inclusive(Timestamp::from_anonymous(now))
                    }),
                ),
            },
        }
    }
}

pub type UnresolvedDecisionTimeProjection = UnresolvedProjection<TransactionTime, DecisionTime>;

impl ToSchema<'_> for UnresolvedProjection<TransactionTime, DecisionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedDecisionTimeProjection",
            openapi::ObjectBuilder::new()
                .property(
                    "pinned",
                    openapi::Ref::from_schema_name(UnresolvedKernel::<TransactionTime>::schema().0),
                )
                .required("pinned")
                .property(
                    "variable",
                    openapi::Ref::from_schema_name(UnresolvedImage::<DecisionTime>::schema().0),
                )
                .required("variable")
                .into(),
        )
    }
}

pub type UnresolvedTransactionTimeProjection = UnresolvedProjection<DecisionTime, TransactionTime>;

impl ToSchema<'_> for UnresolvedProjection<DecisionTime, TransactionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedTransactionTimeProjection",
            openapi::ObjectBuilder::new()
                .property(
                    "pinned",
                    openapi::Ref::from_schema_name(UnresolvedKernel::<DecisionTime>::schema().0),
                )
                .required("pinned")
                .property(
                    "variable",
                    openapi::Ref::from_schema_name(UnresolvedImage::<TransactionTime>::schema().0),
                )
                .required("variable")
                .into(),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UnresolvedTimeProjection {
    DecisionTime(UnresolvedProjection<TransactionTime, DecisionTime>),
    TransactionTime(UnresolvedProjection<DecisionTime, TransactionTime>),
}

impl Default for UnresolvedTimeProjection {
    fn default() -> Self {
        Self::DecisionTime(UnresolvedProjection {
            pinned: UnresolvedKernel::new(None),
            variable: UnresolvedImage::new(Some(TimeIntervalBound::Unbounded), None),
        })
    }
}

impl UnresolvedTimeProjection {
    #[must_use]
    pub fn resolve(self) -> TimeProjection {
        match self {
            Self::DecisionTime(projection) => TimeProjection::DecisionTime(projection.resolve()),
            Self::TransactionTime(projection) => {
                TimeProjection::TransactionTime(projection.resolve())
            }
        }
    }
}

impl ToSchema<'_> for UnresolvedTimeProjection {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "UnresolvedTimeProjection",
            openapi::OneOfBuilder::new()
                .item(openapi::Ref::from_schema_name(
                    UnresolvedProjection::<TransactionTime, DecisionTime>::schema().0,
                ))
                .item(openapi::Ref::from_schema_name(
                    UnresolvedProjection::<DecisionTime, TransactionTime>::schema().0,
                ))
                .into(),
        )
    }
}

/// The pinned axis of a [`TimeProjection`].
///
/// Please refer to the documentation of [`TimeProjection`] for more information.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Kernel<A> {
    pub axis: A,
    pub timestamp: Timestamp<A>,
}

pub type DecisionTimeKernel = Kernel<DecisionTime>;

impl ToSchema<'_> for Kernel<DecisionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "DecisionTimeKernel",
            openapi::ObjectBuilder::new()
                .property(
                    "axis",
                    openapi::Ref::from_schema_name(DecisionTime::schema().0),
                )
                .required("axis")
                .property(
                    "timestamp",
                    openapi::Ref::from_schema_name(Timestamp::<DecisionTime>::schema().0),
                )
                .required("timestamp")
                .build()
                .into(),
        )
    }
}

pub type TransactionTimeKernel = Kernel<TransactionTime>;

impl ToSchema<'_> for Kernel<TransactionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "TransactionTimeKernel",
            openapi::ObjectBuilder::new()
                .property(
                    "axis",
                    openapi::Ref::from_schema_name(TransactionTime::schema().0),
                )
                .required("axis")
                .property(
                    "timestamp",
                    openapi::Ref::from_schema_name(Timestamp::<TransactionTime>::schema().0),
                )
                .required("timestamp")
                .build()
                .into(),
        )
    }
}

/// The variable time of a [`TimeProjection`].
///
/// Please refer to the documentation of [`TimeProjection`] for more information.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Image<A> {
    pub axis: A,
    #[serde(flatten)]
    pub interval: Interval<Timestamp<A>, TimeIntervalBound<A>, LimitedTimeIntervalBound<A>>,
}

pub type DecisionTimeImage = Image<DecisionTime>;

impl ToSchema<'_> for Image<DecisionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "DecisionTimeImage",
            openapi::Schema::from(
                openapi::AllOfBuilder::new()
                    .item(
                        openapi::ObjectBuilder::new()
                            .property(
                                "axis",
                                openapi::Ref::from_schema_name(DecisionTime::schema().0),
                            )
                            .required("axis"),
                    )
                    .item(
                        Interval::<
                            Timestamp<DecisionTime>,
                            TimeIntervalBound<DecisionTime>,
                            LimitedTimeIntervalBound<DecisionTime>,
                        >::schema()
                        .1,
                    )
                    .build(),
            )
            .into(),
        )
    }
}

pub type TransactionTimeImage = Image<TransactionTime>;

impl ToSchema<'_> for Image<TransactionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "TransactionTimeImage",
            openapi::Schema::from(
                openapi::AllOfBuilder::new()
                    .item(
                        openapi::ObjectBuilder::new()
                            .property(
                                "axis",
                                openapi::Ref::from_schema_name(TransactionTime::schema().0),
                            )
                            .required("axis"),
                    )
                    .item(
                        Interval::<
                            Timestamp<TransactionTime>,
                            TimeIntervalBound<TransactionTime>,
                            LimitedTimeIntervalBound<TransactionTime>,
                        >::schema()
                        .1,
                    )
                    .build(),
            )
            .into(),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Projection<K, I> {
    pub pinned: Kernel<K>,
    pub variable: Image<I>,
}

impl<K, I> Projection<K, I> {
    /// Intersects the image of the projection with the provided [`Interval`].
    ///
    /// If the two intervals do not overlap, [`None`] is returned.
    pub fn intersect_image(
        mut self,
        interval: Interval<
            Timestamp<I>,
            IncludedTimeIntervalBound<I>,
            UnboundedOrExcludedTimeIntervalBound<I>,
        >,
    ) -> Option<Self> {
        let variable_interval: Interval<Timestamp<I>, TimeIntervalBound<I>, TimeIntervalBound<I>> =
            self.variable.interval.convert();
        let intersection = variable_interval.intersect(interval.convert())?;
        self.variable.interval = intersection.convert();
        Some(self)
    }
}

pub type DecisionTimeProjection = Projection<TransactionTime, DecisionTime>;

impl ToSchema<'_> for Projection<TransactionTime, DecisionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "DecisionTimeProjection",
            openapi::ObjectBuilder::new()
                .property(
                    "pinned",
                    openapi::Ref::from_schema_name(Kernel::<TransactionTime>::schema().0),
                )
                .required("pinned")
                .property(
                    "variable",
                    openapi::Ref::from_schema_name(Image::<DecisionTime>::schema().0),
                )
                .required("variable")
                .into(),
        )
    }
}

pub type TransactionTimeProjection = Projection<DecisionTime, TransactionTime>;

impl ToSchema<'_> for Projection<DecisionTime, TransactionTime> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "TransactionTimeProjection",
            openapi::ObjectBuilder::new()
                .property(
                    "pinned",
                    openapi::Ref::from_schema_name(Kernel::<DecisionTime>::schema().0),
                )
                .required("pinned")
                .property(
                    "variable",
                    openapi::Ref::from_schema_name(Image::<TransactionTime>::schema().0),
                )
                .required("variable")
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
/// [`Kernel`] and the other axis is called the [`Image`] of a projection. The returned data will
/// then only contain temporal data that is contained in the [`Interval`] of the [`Image`],
/// the [`ProjectedTime`], for the given [`Timestamp`] of the [`Kernel`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TimeProjection {
    DecisionTime(Projection<TransactionTime, DecisionTime>),
    TransactionTime(Projection<DecisionTime, TransactionTime>),
}

impl TimeProjection {
    #[must_use]
    pub const fn kernel_time_axis(&self) -> TimeAxis {
        match self {
            Self::DecisionTime(_) => TimeAxis::TransactionTime,
            Self::TransactionTime(_) => TimeAxis::DecisionTime,
        }
    }

    #[must_use]
    pub const fn image_time_axis(&self) -> TimeAxis {
        match self {
            Self::DecisionTime(_) => TimeAxis::DecisionTime,
            Self::TransactionTime(_) => TimeAxis::TransactionTime,
        }
    }

    #[must_use]
    pub fn kernel(&self) -> Timestamp<()> {
        match self {
            Self::DecisionTime(projection) => projection.pinned.timestamp.cast(),
            Self::TransactionTime(projection) => projection.pinned.timestamp.cast(),
        }
    }

    #[must_use]
    pub fn image(
        &self,
    ) -> Interval<
        Timestamp<ProjectedTime>,
        TimeIntervalBound<ProjectedTime>,
        LimitedTimeIntervalBound<ProjectedTime>,
    > {
        match self {
            Self::DecisionTime(projection) => projection.variable.interval.cast(),
            Self::TransactionTime(projection) => projection.variable.interval.cast(),
        }
    }

    /// Intersects the image of the projection with the provided [`Interval`].
    ///
    /// If the two intervals do not overlap, [`None`] is returned.
    pub fn intersect_image(
        self,
        version_interval: Interval<
            Timestamp<ProjectedTime>,
            IncludedTimeIntervalBound<ProjectedTime>,
            UnboundedOrExcludedTimeIntervalBound<ProjectedTime>,
        >,
    ) -> Option<Self> {
        match self {
            Self::DecisionTime(projection) => projection
                .intersect_image(version_interval.cast())
                .map(Self::DecisionTime),
            Self::TransactionTime(projection) => projection
                .intersect_image(version_interval.cast())
                .map(Self::TransactionTime),
        }
    }

    pub fn set_image(
        &mut self,
        interval: Interval<
            Timestamp<ProjectedTime>,
            TimeIntervalBound<ProjectedTime>,
            LimitedTimeIntervalBound<ProjectedTime>,
        >,
    ) {
        match self {
            Self::DecisionTime(projection) => projection.variable.interval = interval.cast(),
            Self::TransactionTime(projection) => projection.variable.interval = interval.cast(),
        }
    }
}

impl ToSchema<'_> for TimeProjection {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "TimeProjection",
            openapi::OneOfBuilder::new()
                .item(openapi::Ref::from_schema_name(
                    Projection::<TransactionTime, DecisionTime>::schema().0,
                ))
                .item(openapi::Ref::from_schema_name(
                    Projection::<DecisionTime, TransactionTime>::schema().0,
                ))
                .into(),
        )
    }
}
