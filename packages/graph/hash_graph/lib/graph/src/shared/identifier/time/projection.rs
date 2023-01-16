use interval_ops::Interval;
use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{
    DecisionTime, ProjectedTime, TimeAxis, TimeInterval, TimeIntervalBound, Timestamp,
    TransactionTime, UnresolvedTimeInterval,
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

impl ToSchema for UnresolvedDecisionTimeKernel {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("axis", openapi::Ref::from_schema_name("DecisionTime"))
            .required("axis")
            .property("timestamp", openapi::Ref::from_schema_name("Timestamp"))
            .build()
            .into()
    }
}

pub type UnresolvedTransactionTimeKernel = UnresolvedKernel<TransactionTime>;

impl ToSchema for UnresolvedTransactionTimeKernel {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("axis", openapi::Ref::from_schema_name("TransactionTime"))
            .required("axis")
            .property("timestamp", openapi::Ref::from_schema_name("Timestamp"))
            .build()
            .into()
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
    pub fn new(start: Option<TimeIntervalBound<A>>, end: Option<TimeIntervalBound<A>>) -> Self {
        Self {
            axis: A::default(),
            interval: UnresolvedTimeInterval { start, end },
        }
    }
}

pub type UnresolvedDecisionTimeImage = UnresolvedImage<DecisionTime>;

impl ToSchema for UnresolvedDecisionTimeImage {
    fn schema() -> openapi::Schema {
        openapi::AllOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property("axis", openapi::Ref::from_schema_name("DecisionTime"))
                    .required("axis"),
            )
            .item(UnresolvedTimeInterval::<DecisionTime>::schema())
            .build()
            .into()
    }
}

pub type UnresolvedTransactionTimeImage = UnresolvedImage<TransactionTime>;

impl ToSchema for UnresolvedTransactionTimeImage {
    fn schema() -> openapi::Schema {
        openapi::AllOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property("axis", openapi::Ref::from_schema_name("TransactionTime"))
                    .required("axis"),
            )
            .item(UnresolvedTimeInterval::<DecisionTime>::schema())
            .build()
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnresolvedProjection<K, I> {
    pub kernel: UnresolvedKernel<K>,
    pub image: UnresolvedImage<I>,
}

impl<K, I> UnresolvedProjection<K, I> {
    pub fn resolve(self) -> Projection<K, I> {
        let now = Timestamp::now();
        Projection {
            kernel: Kernel {
                axis: self.kernel.axis,
                timestamp: self
                    .kernel
                    .timestamp
                    .unwrap_or_else(|| Timestamp::from_anonymous(now)),
            },
            image: Image {
                axis: self.image.axis,
                interval: TimeInterval {
                    start: self.image.interval.start.unwrap_or_else(|| {
                        TimeIntervalBound::Included(Timestamp::from_anonymous(now))
                    }),
                    end: self.image.interval.end.unwrap_or_else(|| {
                        TimeIntervalBound::Included(Timestamp::from_anonymous(now))
                    }),
                },
            },
        }
    }
}

pub type UnresolvedDecisionTimeProjection = UnresolvedProjection<TransactionTime, DecisionTime>;

impl ToSchema for UnresolvedDecisionTimeProjection {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property(
                "kernel",
                openapi::Ref::from_schema_name("UnresolvedTransactionTimeKernel"),
            )
            .required("kernel")
            .property(
                "image",
                openapi::Ref::from_schema_name("UnresolvedDecisionTimeImage"),
            )
            .required("image")
            .into()
    }
}

pub type UnresolvedTransactionTimeProjection = UnresolvedProjection<DecisionTime, TransactionTime>;

impl ToSchema for UnresolvedTransactionTimeProjection {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property(
                "kernel",
                openapi::Ref::from_schema_name("UnresolvedDecisionTimeKernel"),
            )
            .required("kernel")
            .property(
                "image",
                openapi::Ref::from_schema_name("UnresolvedTransactionTimeImage"),
            )
            .required("image")
            .into()
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
            kernel: UnresolvedKernel::new(None),
            image: UnresolvedImage::new(
                Some(TimeIntervalBound::Unbounded),
                Some(TimeIntervalBound::Unbounded),
            ),
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

impl ToSchema for UnresolvedTimeProjection {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Ref::from_schema_name(
                "UnresolvedDecisionTimeProjection",
            ))
            .item(openapi::Ref::from_schema_name(
                "UnresolvedTransactionTimeProjection",
            ))
            .into()
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

impl ToSchema for DecisionTimeKernel {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("axis", openapi::Ref::from_schema_name("DecisionTime"))
            .required("axis")
            .property("timestamp", openapi::Ref::from_schema_name("Timestamp"))
            .required("timestamp")
            .build()
            .into()
    }
}

pub type TransactionTimeKernel = Kernel<TransactionTime>;

impl ToSchema for TransactionTimeKernel {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("axis", openapi::Ref::from_schema_name("TransactionTime"))
            .required("axis")
            .property("timestamp", openapi::Ref::from_schema_name("Timestamp"))
            .required("timestamp")
            .build()
            .into()
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
    pub interval: TimeInterval<A>,
}

pub type DecisionTimeImage = Image<DecisionTime>;

impl ToSchema for DecisionTimeImage {
    fn schema() -> openapi::Schema {
        openapi::AllOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property("axis", openapi::Ref::from_schema_name("DecisionTime"))
                    .required("axis"),
            )
            .item(TimeInterval::<DecisionTime>::schema())
            .build()
            .into()
    }
}

pub type TransactionTimeImage = Image<TransactionTime>;

impl ToSchema for TransactionTimeImage {
    fn schema() -> openapi::Schema {
        openapi::AllOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property("axis", openapi::Ref::from_schema_name("TransactionTime"))
                    .required("axis"),
            )
            .item(TimeInterval::<DecisionTime>::schema())
            .build()
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Projection<K, I> {
    pub kernel: Kernel<K>,
    pub image: Image<I>,
}

impl<K, I> Projection<K, I> {
    /// Intersects the image of the projection with the provided [`TimeInterval`].
    ///
    /// If the two intervals do not overlap, [`None`] is returned.
    pub fn intersect_image(self, interval: TimeInterval<I>) -> Option<Self> {
        self.image
            .interval
            .intersect(interval)
            .map(|interval| Self {
                kernel: self.kernel,
                image: Image {
                    axis: self.image.axis,
                    interval,
                },
            })
    }
}

pub type DecisionTimeProjection = Projection<TransactionTime, DecisionTime>;

impl ToSchema for DecisionTimeProjection {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property(
                "kernel",
                openapi::Ref::from_schema_name("TransactionTimeKernel"),
            )
            .required("kernel")
            .property("image", openapi::Ref::from_schema_name("DecisionTimeImage"))
            .required("image")
            .into()
    }
}

pub type TransactionTimeProjection = Projection<DecisionTime, TransactionTime>;

impl ToSchema for TransactionTimeProjection {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property(
                "kernel",
                openapi::Ref::from_schema_name("DecisionTimeKernel"),
            )
            .required("kernel")
            .property(
                "image",
                openapi::Ref::from_schema_name("TransactionTimeImage"),
            )
            .required("image")
            .into()
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
/// [`Timestamp`], while the other axis can be a [`TimeInterval`]. The pinned axis is called the
/// [`Kernel`] and the other axis is called the [`Image`] of a projection. The returned data will
/// then only contain temporal data that is contained in the [`TimeInterval`] of the [`Image`], the
/// [`ProjectedTime`], for the given [`Timestamp`] of the [`Kernel`].
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
    pub const fn kernel(&self) -> Timestamp<()> {
        match self {
            Self::DecisionTime(projection) => projection.kernel.timestamp.cast(),
            Self::TransactionTime(projection) => projection.kernel.timestamp.cast(),
        }
    }

    #[must_use]
    pub const fn image(&self) -> TimeInterval<ProjectedTime> {
        match self {
            Self::DecisionTime(projection) => projection.image.interval.cast(),
            Self::TransactionTime(projection) => projection.image.interval.cast(),
        }
    }

    /// Intersects the image of the projection with the provided [`TimeInterval`].
    ///
    /// If the two intervals do not overlap, [`None`] is returned.
    pub fn intersect_image(self, version_interval: TimeInterval<ProjectedTime>) -> Option<Self> {
        match self {
            Self::DecisionTime(projection) => projection
                .intersect_image(version_interval.cast())
                .map(Self::DecisionTime),
            Self::TransactionTime(projection) => projection
                .intersect_image(version_interval.cast())
                .map(Self::TransactionTime),
        }
    }

    pub fn set_image(&mut self, interval: TimeInterval<ProjectedTime>) {
        match self {
            Self::DecisionTime(projection) => projection.image.interval = interval.cast(),
            Self::TransactionTime(projection) => projection.image.interval = interval.cast(),
        }
    }
}

impl ToSchema for TimeProjection {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Ref::from_schema_name("DecisionTimeProjection"))
            .item(openapi::Ref::from_schema_name("TransactionTimeProjection"))
            .into()
    }
}
