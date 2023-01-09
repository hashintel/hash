use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{
    DecisionTime, Timespan, TimespanBound, Timestamp, TransactionTime, UnresolvedTimespan,
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
