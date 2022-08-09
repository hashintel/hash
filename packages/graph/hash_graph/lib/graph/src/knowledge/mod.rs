//! TODO: DOC - This module will encapsulate logic for Entities and Links, it's a parallel to the
//!  `ontology` module, i.e you have Ontologies and Knowledge-Graphs

mod entity;
mod link;

pub use self::{
    entity::{Entity, EntityId, PersistedEntity, PersistedEntityIdentifier},
    link::{Link, LinkStatus, Links, Outgoing},
};
