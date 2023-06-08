//! TODO: DOC - This module will encapsulate logic for Entities and Links, it's a parallel to the
//!  `ontology` module, i.e you have Ontologies and Knowledge-Graphs

mod entity;

pub use self::entity::{
    Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityQueryPath,
    EntityQueryPathVisitor, EntityQueryToken, EntityUuid, LinkData, LinkOrder,
};
