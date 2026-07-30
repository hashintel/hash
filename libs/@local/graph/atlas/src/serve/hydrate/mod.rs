//! Detail hydration: live store reads for delivered points and edges.
//!
//! Detail hydrates at request time from Postgres, inline in the trailer - no published label
//! columns. Reads are live (`now()`, not the snapshot's decision time): text edited after publish
//! shows on snapshot geometry.
//!
//! # What a trailer carries
//!
//! Two guarantees compose here, at two altitudes. Hydration reads only post-intersection ids, so
//! every hydrated entity is one the request's proof admits: that is the guarantee about *rows*.
//! Inside an admitted row, the deployment's property protection decides which *fields* may leave
//! the store, and an entity's **deliverable set** is what it leaves: every property no protection
//! withholds.
//! Property values reach a trailer from the deliverable set, and the caps, counts, and completeness
//! flags below are stated over that set.
//!
//! The store's protection is a per-actor condition, and this surface evaluates none: the queries
//! remove the protected keys for every caller, which withholds at least what the store withholds
//! from any actor, the owner of a protected value included. A trailer's property map is therefore
//! one function of the entity, identical for every caller the row admits.
//!
//! Labels stand outside that rule, here and on the graph's own read path. A label is a property
//! value materialized per edition: `entity_edition_cache.labels[1]` is extracted from the whole
//! properties object through the type's `labelProperty` path, with no actor in the derivation, so a
//! type whose label property is protected carries that value in its label column. A deployment that
//! protects a label property makes that true of its labels with no code change here. The locate
//! surfaces also name the base URL behind the label, which states that the entity has a value at
//! that path without delivering it.
//!
//! The tile trailer's per-point rules mirror the client's own display logic:
//!
//! - Label: `entity_edition_cache.labels[1]`, the entity's display label; `null` when the entity
//!   has none.
//! - Icon: the entity's own `icon` property when it is a string, else the graph's display-field
//!   rule (the SDK's `getDisplayFieldsForClosedEntityType`): every direct type's
//!   `closed_schema.allOf` carries per-ancestor display metadata, and the first non-null icon by
//!   inheritance depth wins - a type inherits its ancestors' icons, nearest first. `null` when no
//!   chain carries one - the client owns the fallback glyph.
//!
//! The locate and edges surfaces ship type *references* instead of rendered display: each entity's
//! direct types read from `entity_edition_cache.versioned_urls`, and the client resolves labels
//! and icons through its own type metadata - one owner per display concern.
//!
//! Properties ship as simple values only - strings, numbers, booleans, and explicit nulls; nested
//! objects and arrays never survive the store-side filter. An over-cap entity drops properties
//! reverse-lexicographically by base URL with its label property - the base URL whose value
//! provides the display label, resolved through the same canonical type order the label cache
//! uses - dropped very last, so the label survives every cap that admits at least one property.
//! Survivors emit ascending by name, the wire's map-key order. A number ships as an integer when
//! the store renders it integral and it fits `i64`, as a double otherwise. Each hydration also
//! counts the entity's *whole deliverable* set, so completeness - nothing filtered, nothing
//! capped - is attested per entity, never guessed.
//!
//! An id that resolves to no visible entity - deleted since publish, archived, drafted - reads
//! `null` in every column and `false` in every completeness flag, mirroring the zero-mask rule
//! for unresolvable type ids.
//!
//! The module splits by altitude: [`columns`] is the hydrated data model the documents and
//! encoders read, [`client`] is the store boundary - the queries and the one async seam - and
//! [`select`] is the pure property-selection policy.

mod client;
mod columns;
pub(crate) mod compile;
mod select;

#[cfg(test)]
pub(super) use self::select::{select_properties, simple_properties};
pub use self::{
    client::{DetailError, GraphDatabaseClient},
    columns::{
        DeliveredEntities, EdgeLinkDetails, LocateLinkDetails, LocateNodeDetails, NodeDetails,
        SimpleValue,
    },
};
