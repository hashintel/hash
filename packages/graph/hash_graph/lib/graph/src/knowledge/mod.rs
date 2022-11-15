//! TODO: DOC - This module will encapsulate logic for Entities and Links, it's a parallel to the
//!  `ontology` module, i.e you have Ontologies and Knowledge-Graphs

mod entity;

pub use self::entity::{
    Entity, EntityMetadata, EntityProperties, EntityQueryPath, EntityQueryPathVisitor, EntityUuid,
    LinkEntityMetadata, LinkOrder,
};
