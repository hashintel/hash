//! Request-time store reads for the detail a response's trailer carries.
//!
//! Hydration is graph-store enrichment performed while the request runs: an entity's direct-type
//! URLs and its scalar property values, read from the live store. The edges and locate trailers
//! hydrate. A tile trailer does not, because its labels and icons come from the publication the
//! request captured, as positions do.
//!
//! Hydration is one of the two reasons a detailed response is not reusable as an immutable
//! generation tile, and the two differ in the data lifetime a value follows. A captured label
//! follows the epoch the caller's scope resolved against, and moves when that scope re-resolves -
//! which is why even a tile trailer, reading no store, is not stable across requests. A
//! request-time read follows the read instead, and can observe an edition later than the one the
//! captured scope holds.
//!
//! [`LocateResolver`] fills one locate document's node and link slots and returns the source's
//! capped properties, reading both against the live temporal axes. [`TypeUrlResolver`] resolves
//! ontology type uuids to versioned URLs for the edges trailer, a lookup with no temporal axes
//! and no entity edition in it. A uuid derives from the versioned URL it names, which holds the
//! pair steady once resolved. [`CachedTypeUrlResolver`] answers a repeat from its retained result.
//! [`GraphDatabaseClient`] answers both resolvers against the serving store pool. [`NodeSlot`]
//! and [`EdgeSlot`] are the slot domains a resolver fills in place, and [`scalar`] is the value
//! shape a property read can take.
//!
//! The module also holds [`visibility::visibility_proof`], which resolves the rows an actor may
//! receive before any document gathers from the captured scene.

mod client;
mod columns;
mod locate;
pub(crate) mod scalar;
mod statements;
mod type_urls;
pub(crate) mod visibility;

// Locate document fixtures construct typed resolver answers.
#[cfg(test)]
pub(crate) use self::locate::{LocateLink, LocateNode, LocateProperties};
pub(crate) use self::{
    client::{GraphDatabaseClient, HydrateError},
    columns::{EdgeSlot, NodeSlot},
    locate::{LocateEntity, LocateRequest, LocateResolver, LocateResponse},
    type_urls::{CachedTypeUrlResolver, TypeUrlResolver},
};
