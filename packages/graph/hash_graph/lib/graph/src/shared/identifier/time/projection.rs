use std::ops::{Bound, RangeBounds};

use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::{ResolvedTimespan, Timespan, Timestamp};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Kernel<A> {
    axis: A,
    timestamp: Option<Timestamp<A>>,
}

impl<A: Default> Kernel<A> {
    #[must_use]
    fn new(timestamp: Option<Timestamp<A>>) -> Self {
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
struct ResolvedKernel<A> {
    axis: A,
    timestamp: Timestamp<A>,
}

impl<A: Default> ResolvedKernel<A> {
    #[must_use]
    fn new(timestamp: Timestamp<A>) -> Self {
        Self {
            axis: A::default(),
            timestamp,
        }
    }
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
struct Image<A> {
    axis: A,
    #[serde(flatten)]
    span: Timespan<A>,
}

impl<A: Default> Image<A> {
    #[must_use]
    fn new(timespan: impl Into<Timespan<A>>) -> Self {
        Self {
            axis: A::default(),
            span: timespan.into(),
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
struct ResolvedImage<A> {
    axis: A,
    #[serde(flatten)]
    span: ResolvedTimespan<A>,
}

impl<A: Default> ResolvedImage<A> {
    #[must_use]
    fn new(timespan: impl RangeBounds<Timestamp<A>>) -> Self {
        Self {
            axis: A::default(),
            span: ResolvedTimespan::new(timespan),
        }
    }
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
    kernel: Kernel<K>,
    image: Image<I>,
}

impl<K: Default, I: Default> Projection<K, I> {
    pub fn new(kernel: Option<Timestamp<K>>, image: impl Into<Timespan<I>>) -> Self {
        Self {
            kernel: Kernel::new(kernel),
            image: Image::new(image),
        }
    }
}

impl<K, I> Projection<K, I> {
    pub const fn kernel(&self) -> Option<Timestamp<K>> {
        self.kernel.timestamp
    }

    pub const fn image(&self) -> &Timespan<I> {
        &self.image.span
    }

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
                span: ResolvedTimespan::new((
                    self.image
                        .span
                        .start_bound()
                        .unwrap_or_else(|| Bound::Included(Timestamp::from_anonymous(now))),
                    self.image
                        .span
                        .end_bound()
                        .unwrap_or_else(|| Bound::Included(Timestamp::from_anonymous(now))),
                )),
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
    kernel: ResolvedKernel<K>,
    image: ResolvedImage<I>,
}

impl<K: Default, I: Default> ResolvedProjection<K, I> {
    pub fn new(kernel: Timestamp<K>, image: impl RangeBounds<Timestamp<I>>) -> Self {
        Self {
            kernel: ResolvedKernel::new(kernel),
            image: ResolvedImage::new(image),
        }
    }
}

impl<K, I> ResolvedProjection<K, I> {
    pub const fn kernel(&self) -> Timestamp<K> {
        self.kernel.timestamp
    }

    pub const fn image(&self) -> &ResolvedTimespan<I> {
        &self.image.span
    }
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
