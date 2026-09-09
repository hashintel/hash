//! Live properties and type URLs for locate documents.
//!
//! Responses preserve request slots even for entities the store no longer serves.

use alloc::sync::Arc;

use error_stack::Report;
use hashql_core::id::{IdSlice, IdVec, bit_vec::DenseBitSet};
use type_system::ontology::VersionedUrl;

use super::{
    EdgeSlot, NodeRequestColumns, NodeSlot, client::HydrateError, scalar::ScalarProperties,
};
use crate::{
    bitset::DenseBitSlice, postgres::id::ArchivedEntityId, serve2::visibility::VisibilityActor,
};

#[derive(Debug, Copy, Clone)]
pub(crate) struct LocateRequest<'doc> {
    /// The resolved actor the store masks properties for.
    pub actor: VisibilityActor,
    /// The delivered node identities, source first.
    pub nodes: NodeRequestColumns<'doc>,
    /// The delivered link-entity identities, ascending identity bytes.
    pub links: &'doc IdSlice<EdgeSlot, ArchivedEntityId>,
    /// Most properties the source's map delivers.
    pub properties: u32,
    /// Most direct-type URLs each link delivers.
    pub link_type_ids: u32,
    /// Most properties each link's map delivers.
    pub link_properties: u32,
}

/// The store's answer to one [`LocateRequest`], every column in delivered order.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateResponse {
    /// The node half of the answer.
    pub nodes: LocateNodeResponse,
    /// The link half of the answer.
    pub links: LocateLinkResponse,
}

/// The store-answered node columns of one locate hydration.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateNodeResponse {
    /// The delivered nodes the store resolved.
    ///
    /// An absent slot marks an entity the store no longer serves, whose every other column reads
    /// empty and whose label stays empty.
    pub resolved: DenseBitSet<NodeSlot>,
    /// The direct-type versioned URLs per delivered node, canonical order.
    ///
    /// Empty when the store no longer serves the entity or records no types for it.
    pub type_urls: IdVec<NodeSlot, Vec<VersionedUrl>>,
    /// The source's surviving properties, ascending by base URL.
    ///
    /// `None` marks a source the store no longer serves.
    pub source_properties: Option<ScalarProperties>,
    /// Whether the source's surviving properties are the entity's whole deliverable set.
    pub source_properties_complete: bool,
}

impl LocateNodeResponse {
    /// All-unresolved columns covering `count` nodes, the answer when no id can resolve.
    #[must_use]
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            resolved: DenseBitSet::new_empty(count),
            type_urls: IdVec::from_elem(Vec::new(), count),
            source_properties: None,
            source_properties_complete: false,
        }
    }
}

/// The store-answered link columns of one locate hydration.
///
/// Properties are `Some` exactly when the store resolves the link. An unresolved link has `None`
/// properties and empty types, and belongs to neither completeness set.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateLinkResponse {
    /// The link's direct-type versioned URLs per delivered edge, canonical order, capped.
    pub type_urls: IdVec<EdgeSlot, Vec<VersionedUrl>>,
    /// The delivered edges whose type list is the link's whole direct set.
    pub type_urls_complete: Box<DenseBitSlice<EdgeSlot>>,
    /// The link's surviving properties per delivered edge, ascending by base URL.
    pub properties: IdVec<EdgeSlot, Option<ScalarProperties>>,
    /// The delivered edges whose surviving properties are the link entity's whole deliverable set.
    pub properties_complete: Box<DenseBitSlice<EdgeSlot>>,
}

impl LocateLinkResponse {
    /// All-unresolved columns covering `count` edges, the answer when no id can resolve.
    #[must_use]
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            type_urls: IdVec::from_elem(Vec::new(), count),
            type_urls_complete: DenseBitSlice::new_empty(count),
            properties: IdVec::from_elem(None, count),
            properties_complete: DenseBitSlice::new_empty(count),
        }
    }
}

/// The capability to answer one locate request with every store-derived column.
pub(crate) trait LocateResolver {
    fn resolve(&self, request: LocateRequest<'_>) -> Result<LocateResponse, Report<HydrateError>>;
}

impl<T> LocateResolver for &T
where
    T: LocateResolver,
{
    fn resolve(&self, request: LocateRequest<'_>) -> Result<LocateResponse, Report<HydrateError>> {
        T::resolve(self, request)
    }
}

impl<T> LocateResolver for Arc<T>
where
    T: LocateResolver,
{
    fn resolve(&self, request: LocateRequest<'_>) -> Result<LocateResponse, Report<HydrateError>> {
        T::resolve(self, request)
    }
}
