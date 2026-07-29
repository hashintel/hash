//! Detail hydration: live store reads for delivered points and edges.
//!
//! Detail hydrates at request time from Postgres, inline in the trailer - no published label
//! columns. Reads are live (`now()`, not the snapshot's decision time): text edited after publish
//! shows on snapshot geometry. Hydration queries only post-intersection ids, so it opens no new
//! auth surface.
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
//! uses - protected to the very end, so the label survives every cap that admits at least one
//! property. Survivors emit ascending by name, the wire's map-key order. A number ships as an
//! integer when the store renders it integral and it fits `i64`, as a double otherwise. Each
//! hydration also counts the entity's *whole* property set, so completeness - nothing filtered,
//! nothing capped - is attested per entity, never guessed.
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
