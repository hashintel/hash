//! Live store reads that hydrate detail for delivered points and edges.
//!
//! Detail hydrates at request time from Postgres, inline in the trailer, with no published label
//! columns. Every read runs at `now()` instead of at the snapshot's decision time, so text edited
//! after publish shows on snapshot geometry.
//!
//! # What a trailer carries
//!
//! The guarantees compose at two altitudes. Hydration reads only post-intersection ids, so every
//! hydrated entity is one the request's proof admits. That is the guarantee about *rows*. Inside an
//! admitted row, the deployment's property protection decides which *fields* may leave the store,
//! and an entity's **deliverable set** is every property no protection withholds. Property values
//! reach a trailer from the deliverable set, and the caps, counts, and completeness flags below all
//! describe that set.
//!
//! The store's protection is a per-actor condition, and this surface evaluates none of them. The
//! queries remove the protected keys for every caller, which withholds at least what the store
//! withholds from any actor, including the owner of a protected value. A trailer's property map is
//! therefore one function of the entity, identical for every caller the row admits.
//!
//! Labels stand outside that rule, here and on the graph's own read path. A label is a property
//! value materialized per edition. The store derives `entity_edition_cache.labels[1]` from the
//! whole properties object through the type's `labelProperty` path, with no actor in the
//! derivation, so a type whose label property the deployment protects keeps that value in its label
//! column. A deployment that protects a label property makes that true of its labels with no code
//! change here. The locate surfaces also name the base URL behind the label, which states that the
//! entity has a value at that path without delivering it.
//!
//! The tile trailer's per-point rules are the graph's own display resolution rather than a second
//! implementation of a client's. The label is the value the store's label column resolved from the
//! type's `labelProperty`, and the icon follows the SDK's display-field rule. Where the graph's
//! resolution and a client's differ, the value delivered here is the graph's. Convergence is the
//! graph's to make. This surface re-derives neither rule.
//!
//! - Label: `entity_edition_cache.labels[1]`, the entity's display label; `null` when the entity
//!   has none.
//! - Icon: `icon` on the entity when its value is a string, else the graph's display-field rule
//!   (the SDK's `getDisplayFieldsForClosedEntityType`). Every direct type's `closed_schema.allOf`
//!   carries per-ancestor display metadata, and the first non-null icon by inheritance depth wins,
//!   so a type inherits its ancestors' icons nearest first. `null` when no chain carries one, and
//!   the client owns the fallback glyph.
//!
//! The locate and edges surfaces deliver type *references* instead of rendered display. Each
//! entity's direct types read from `entity_edition_cache.versioned_urls`, and the client resolves
//! labels and icons through its own type metadata, so one owner holds each display concern.
//!
//! Properties reach the wire as [`SimpleValue`] entries only, covering strings, numbers, booleans,
//! and explicit nulls. Nested objects and arrays never survive the store-side filter. An over-cap
//! entity drops properties reverse-lexicographically by base URL, and its label property drops
//! last, so the label survives every cap that admits at least one property. That label property is
//! the base URL whose value provides the display label, resolved through the same canonical type
//! order the label cache uses. Survivors emit ascending by name, the wire's map-key order. A number
//! reaches the wire as an integer when the store renders it integral and it fits `i64`, and as a
//! double otherwise. Each hydration also counts the entity's *whole deliverable* set, so the
//! trailer reports completeness (nothing filtered, nothing capped) per entity from that count.
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
