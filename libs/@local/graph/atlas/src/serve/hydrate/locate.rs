//! Live properties and type URLs for locate documents.
//!
//! Each requested identity retains its slot when the store no longer serves it.

use alloc::sync::Arc;

use error_stack::Report;
use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::VersionedUrl;

use super::{EdgeSlot, NodeSlot, client::HydrateError, scalar::ScalarProperties};
use crate::{postgres::id::ArchivedEntityId, serve::visibility::VisibilityActor};

/// One requested entity and the details the store still serves for it.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateEntity<T> {
    pub identity: ArchivedEntityId,
    pub details: Option<T>,
}

impl<T> LocateEntity<T> {
    /// Builds an entity requested by `identity`, with no details resolved yet.
    pub(crate) const fn new(identity: ArchivedEntityId) -> Self {
        Self {
            identity,
            details: None,
        }
    }
}

/// The live detail for one delivered node: its direct-type versioned URLs.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateNode {
    /// Direct-type versioned URLs in canonical order.
    pub type_urls: Vec<VersionedUrl>,
}

/// One entity's resolved scalar properties and whether they are its whole deliverable set.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateProperties {
    pub values: ScalarProperties,
    /// Whether the map contains the entity's whole deliverable property set.
    pub complete: bool,
}

/// The live detail for one delivered link: its capped direct types and scalar properties.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateLink {
    /// Capped direct-type versioned URLs in canonical order.
    pub type_urls: Vec<VersionedUrl>,
    /// Whether the list contains the link's whole direct-type set.
    pub type_urls_complete: bool,
    pub properties: LocateProperties,
}

/// One locate request's live-detail slots.
///
/// The slots arrive with the caps and the actor a [`LocateResolver`] resolves them under.
#[derive(Debug)]
pub(crate) struct LocateRequest<'doc> {
    /// The resolved actor the store masks properties for.
    pub actor: VisibilityActor,
    /// Delivered nodes, source first.
    pub nodes: &'doc mut IdSlice<NodeSlot, LocateEntity<LocateNode>>,
    /// Delivered link entities, ascending identity bytes.
    pub links: &'doc mut IdSlice<EdgeSlot, LocateEntity<LocateLink>>,
    /// Most properties the source's map delivers.
    pub properties: u32,
    /// Most direct-type URLs each link delivers.
    pub link_type_ids: u32,
    /// Most properties each link's map delivers.
    pub link_properties: u32,
}

/// The resolved live detail for one locate document.
///
/// It holds every requested node and link, plus the source's own properties.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateResponse {
    pub nodes: IdVec<NodeSlot, LocateEntity<LocateNode>>,
    pub links: IdVec<EdgeSlot, LocateEntity<LocateLink>>,
    pub source_properties: Option<LocateProperties>,
}

/// Live detail resolution within the supplied entity slots.
pub(crate) trait LocateResolver {
    /// Fills the requested slots and returns the source's capped properties.
    ///
    /// Unavailable entities remain unresolved.
    ///
    /// # Errors
    ///
    /// Returns [`HydrateError`] when a store read fails. Errors may leave partially populated
    /// slots. Discard those results. Reset all slot details to [`None`] before retrying.
    fn resolve(
        &self,
        request: LocateRequest<'_>,
    ) -> Result<Option<LocateProperties>, Report<HydrateError>>;
}

impl<T> LocateResolver for &T
where
    T: LocateResolver,
{
    fn resolve(
        &self,
        request: LocateRequest<'_>,
    ) -> Result<Option<LocateProperties>, Report<HydrateError>> {
        T::resolve(self, request)
    }
}

impl<T> LocateResolver for Arc<T>
where
    T: LocateResolver,
{
    fn resolve(
        &self,
        request: LocateRequest<'_>,
    ) -> Result<Option<LocateProperties>, Report<HydrateError>> {
        T::resolve(self, request)
    }
}
