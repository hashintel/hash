//! General types and traits used throughout the Zanzibar authorization system.

pub use self::{
    api::ZanzibarClient,
    types::{Affiliation, Consistency, Permission, Relation, Zookie},
};

mod api;
pub mod types;
