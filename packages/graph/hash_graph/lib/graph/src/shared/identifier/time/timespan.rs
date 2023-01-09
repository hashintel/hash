use derivative::Derivative;
use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::Timestamp;

#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(
    rename_all = "camelCase",
    bound = "",
    tag = "bound",
    content = "timestamp"
)]
pub enum TimespanBound<A> {
    Unbounded,
    Included(Timestamp<A>),
    Excluded(Timestamp<A>),
}

impl<A> ToSchema for TimespanBound<A> {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(
                openapi::ObjectBuilder::new()
                    .property(
                        "bound",
                        openapi::ObjectBuilder::new().enum_values(Some(["unbounded"])),
                    )
                    .required("bound"),
            )
            .item(
                openapi::ObjectBuilder::new()
                    .property(
                        "bound",
                        openapi::ObjectBuilder::new().enum_values(Some(["included", "excluded"])),
                    )
                    .required("bound")
                    .property("timestamp", Timestamp::<A>::schema())
                    .required("timestamp"),
            )
            .build()
            .into()
    }
}

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct UnresolvedTimespan<A> {
    pub start: Option<TimespanBound<A>>,
    pub end: Option<TimespanBound<A>>,
}

#[derive(Derivative, Serialize, Deserialize, ToSchema)]
#[derivative(
    Debug(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = "")
)]
#[serde(rename_all = "camelCase", bound = "", deny_unknown_fields)]
pub struct Timespan<A> {
    pub start: TimespanBound<A>,
    pub end: TimespanBound<A>,
}
