use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{ResolvedTimespan, Timespan, TimespanBound, Timestamp};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Kernel<A> {
    pub axis: A,
    pub timestamp: Option<Timestamp<A>>,
}

impl<A: Default> Kernel<A> {
    #[must_use]
    pub fn new(timestamp: Option<Timestamp<A>>) -> Self {
        Self {
            axis: A::default(),
            timestamp,
        }
    }
}

impl<A: ToSchema> ToSchema for Kernel<A> {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("axis", A::schema())
            .required("axis")
            .property("timestamp", Timestamp::<A>::schema())
            .build()
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedKernel<A> {
    pub axis: A,
    pub timestamp: Timestamp<A>,
}

impl<A: ToSchema> ToSchema for ResolvedKernel<A> {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("axis", A::schema())
            .required("axis")
            .property("timestamp", Timestamp::<A>::schema())
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

impl<A: Default> Image<A> {
    #[must_use]
    pub fn new(start: Option<TimespanBound<A>>, end: Option<TimespanBound<A>>) -> Self {
        Self {
            axis: A::default(),
            span: Timespan { start, end },
        }
    }
}

impl<A: ToSchema> ToSchema for Image<A> {
    fn schema() -> openapi::Schema {
        openapi::AllOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property("axis", A::schema())
                    .required("axis"),
            )
            .item(Timespan::<A>::schema())
            .build()
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedImage<A> {
    pub axis: A,
    #[serde(flatten)]
    pub span: ResolvedTimespan<A>,
}

impl<A: ToSchema> ToSchema for ResolvedImage<A> {
    fn schema() -> openapi::Schema {
        openapi::AllOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property("axis", A::schema())
                    .required("axis"),
            )
            .item(ResolvedTimespan::<A>::schema())
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
    pub fn resolve(self) -> ResolvedProjection<K, I> {
        let now = Timestamp::now();
        ResolvedProjection {
            kernel: ResolvedKernel {
                axis: self.kernel.axis,
                timestamp: self
                    .kernel
                    .timestamp
                    .unwrap_or_else(|| Timestamp::from_anonymous(now)),
            },
            image: ResolvedImage {
                axis: self.image.axis,
                span: ResolvedTimespan {
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

impl<K: ToSchema, I: ToSchema> ToSchema for Projection<K, I> {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("kernel", Kernel::<K>::schema())
            .required("kernel")
            .property("image", Image::<I>::schema())
            .required("image")
            .build()
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedProjection<K, I> {
    pub kernel: ResolvedKernel<K>,
    pub image: ResolvedImage<I>,
}

impl<K: ToSchema, I: ToSchema> ToSchema for ResolvedProjection<K, I> {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("kernel", ResolvedKernel::<K>::schema())
            .required("kernel")
            .property("image", ResolvedImage::<I>::schema())
            .required("image")
            .build()
            .into()
    }
}
