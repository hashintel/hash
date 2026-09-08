mod client;
mod columns;
mod edges;
mod locate;
pub(crate) mod scalar;
mod statements;
mod type_urls;
pub(crate) mod visibility;

// The hydration column constructors are test-only inputs for a fixture store's all-unresolved
// answer. No production caller constructs a hydration by hand.
#[cfg(test)]
pub(crate) use self::locate::{LocateLinkResponse, LocateNodeResponse};
pub(crate) use self::{
    client::{GraphDatabaseClient, HydrateError},
    columns::{
        EdgeLinkColumns, EdgeSlot, LocateLinkColumns, LocateNodeColumns, NodeRequestColumns,
        NodeSlot, NodeTrailerColumns, TypeSlot,
    },
    edges::OntologyResolver,
    locate::{LocateRequest, LocateResolver, LocateResponse},
    type_urls::{CachedTypeUrlResolver, TypeUrlResolver},
};
