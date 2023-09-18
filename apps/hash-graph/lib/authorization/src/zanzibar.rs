//! General types and traits used throughout the Zanzibar authorization system.

pub use self::{
    api::ZanzibarClient,
    types::{
        Affiliation, Consistency, Permission, Relation, Resource, Tuple, UntypedResource,
        UntypedTuple, Zookie,
    },
};

mod api;
mod types;
