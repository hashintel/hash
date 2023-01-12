use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{
    DecisionTime, ProjectedTime, TimeAxis, Timespan, TimespanBound, Timestamp, TransactionTime,
    UnresolvedTimespan,
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
    pub span: UnresolvedTimespan<A>,
}

impl<A: Default> UnresolvedImage<A> {
    #[must_use]
    pub fn new(start: Option<TimespanBound<A>>, end: Option<TimespanBound<A>>) -> Self {
        Self {
            axis: A::default(),
            span: UnresolvedTimespan { start, end },
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
            .item(UnresolvedTimespan::<DecisionTime>::schema())
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
            .item(UnresolvedTimespan::<DecisionTime>::schema())
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
                span: Timespan {
                    start: self
                        .image
                        .span
                        .start
                        .unwrap_or_else(|| TimespanBound::Included(Timestamp::from_anonymous(now))),
                    end: self
                        .image
                        .span
                        .end
                        .unwrap_or_else(|| TimespanBound::Included(Timestamp::from_anonymous(now))),
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
                Some(TimespanBound::Unbounded),
                Some(TimespanBound::Unbounded),
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Image<A> {
    pub axis: A,
    #[serde(flatten)]
    pub span: Timespan<A>,
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
            .item(Timespan::<DecisionTime>::schema())
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
            .item(Timespan::<DecisionTime>::schema())
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TimeProjection {
    DecisionTime(Projection<TransactionTime, DecisionTime>),
    TransactionTime(Projection<DecisionTime, TransactionTime>),
}

impl TimeProjection {
    #[must_use]
    pub const fn time_axis(&self) -> TimeAxis {
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
    pub const fn image(&self) -> Timespan<ProjectedTime> {
        match self {
            Self::DecisionTime(projection) => projection.image.span.cast(),
            Self::TransactionTime(projection) => projection.image.span.cast(),
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
