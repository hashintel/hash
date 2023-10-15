//! General types and traits used throughout the Zanzibar authorization system.

pub use self::{
    api::ZanzibarClient,
    types::{
        Affiliation, Consistency, Permission, Relation, Resource, Tuple, UntypedTuple, Zookie,
    },
};

mod api;
pub mod types;
