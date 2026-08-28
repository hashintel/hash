//! Live store reads that hydrate detail for delivered points and edges.
//!
//! Detail hydrates properties and type references at request time from Postgres, inline in the
//! trailer. Labels never ride these reads. Edges resolves them in process - the server's captured
//! displays first, the generation's payloads otherwise - while tile and locate serve generation
//! payloads plus each placed arrival's placement capture.
//!
//! # What a trailer carries
//!
//! The guarantees compose at two altitudes. Hydration reads only post-intersection ids, so every
//! hydrated entity is one the request's proof admits. That is the guarantee about *rows*. Inside an
//! admitted row, the deployment's property protection decides which *fields* may leave the store,
//! and an entity's **deliverable set** is every property no protection withholds from the
//! requesting actor. Property values reach a trailer from the deliverable set, and the caps,
//! counts, and completeness flags below all describe that set.
//!
//! The store's protection is a per-actor condition, and the hydration queries evaluate it for the
//! requesting actor. Each order carries the actor its scope's policy resolution produced
//! ([`MaskingActor`]), and the property statements compile through the store's own query compiler
//! under the read path's masking conditions, so a trailer withholds exactly what the graph's entity
//! reads withhold from that actor. An owner reads a protected value of their own where a stranger
//! does not, and an instance admin reads unmasked.
//!
//! Labels stand outside that rule, here and on the graph's own read path. A label is a property
//! value materialized per edition. The store derives `entity_edition_cache.labels[1]` from the
//! whole properties object through the type's `labelProperty` path, with no actor in the
//! derivation, so a type whose label property the deployment protects keeps that value in its label
//! column. Fitting copies that value into the generation's identity tables, and the server's
//! captured displays carry the same statement-shared spelling for later editions. Locate reads the
//! generation payloads plus each placed arrival's placement capture, and edges reads
//! captured-display-first, while hydration determines whether an entity still resolves and which
//! live type references and properties may leave the store. The
//! locate responses also name the base URL behind the label, which states that the entity has a
//! value at that path without delivering it.
//!
//! The locate and edges responses deliver type *references* instead of rendered type display. Each
//! entity's direct types read from `entity_edition_cache.versioned_urls`, and the client resolves
//! their labels and icons through its own type metadata, so one owner holds each type display
//! concern.
//!
//! Properties reach the wire as [`ScalarValue`] entries only, covering strings, numbers, booleans,
//! and explicit nulls. Nested objects and arrays never survive the store-side filter. An over-cap
//! entity drops properties reverse-lexicographically by base URL, and its label property drops
//! last, so the label survives every cap that admits at least one property. That label property is
//! the base URL whose value provides the display label, resolved through the same canonical type
//! order the label cache uses. Survivors emit ascending by name, the wire's map-key order. A number
//! reaches the wire as an integer when the store renders it integral and it fits `i64`, and as a
//! double otherwise. Each hydration also counts the entity's *whole deliverable* set, so the
//! trailer reports completeness (nothing filtered, nothing capped) per entity from that count.
//!
//! An id that resolves to no visible entity - deleted since publish, archived, drafted, or with its
//! derived edition cache not yet landed - reads `null` in every column and `false` in every
//! completeness flag, mirroring the zero-mask rule for unresolvable type ids.
//!
//! The module splits by altitude: [`columns`] is the hydrated data model the documents and encoders
//! read, [`client`] is the store boundary - the queries and the one async connection - [`order`] is
//! the sync-facing capability one locate response hydrates through, and [`select`] is the pure
//! property-selection policy.

mod client;
mod columns;
pub(crate) mod compile;
mod order;
pub(crate) mod select;
mod statements;
mod type_urls;

// The hydration column constructors are test-only inputs for a fixture store's all-unresolved
// answer. No production caller constructs a hydration by hand.
#[cfg(test)]
pub(crate) use self::order::{LocateLinkHydration, LocateNodeHydration};
pub(crate) use self::{
    client::{DetailError, GraphDatabaseClient, MaskingActor},
    columns::{
        DeliveredNodes, EdgeLinkDetails, EdgeSlot, LocateLinkDetails, LocateNodeDetails,
        NodeDetails, NodeSlot, ScalarValue, TypeSlot,
    },
    order::{EdgesStore, LocateHydration, LocateOrder, LocateStore},
    type_urls::{CachedTypeUrlResolver, TypeUrlResolver},
};
