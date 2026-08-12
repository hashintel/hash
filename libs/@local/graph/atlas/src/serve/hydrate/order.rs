//! The detail routes' store orders and the capabilities that answer them.
//!
//! A detail route assembles, hydrates, and encodes inside one synchronous call, and the store is
//! the one stage of that pipeline living on the other side of an executor. An assembled document
//! places one order naming the delivered identities and the caps, and one answer carries every
//! store-derived column back, so the boundary crosses as data rather than as control flow. Labels
//! stay out of every order on purpose. A label is a generation payload resolved in process, so an
//! answer carries at most the resolution flags a label lookup keys on rather than the labels
//! themselves.
//!
//! [`LocateStore`] and [`EdgesStore`] are the capability shapes. A single call consumes each
//! shape, so a response hydrates at most once, and a rejection that never reaches hydration drops
//! it unused.

use hashql_core::id::{IdSlice, IdVec, bit_vec::DenseBitSet};
use type_system::ontology::id::{BaseUrl, VersionedUrl};

use super::{DeliveredNodes, EdgeSlot, NodeSlot, ScalarValue, client::DetailError};
use crate::{bitset::DenseBitSlice, dataset::postgres::id::ArchivedEntityId};

/// One locate response's store order.
///
/// Both identity columns travel in delivered order, which is the alignment key for every column of
/// the answer. The caps are the serving limits the response encodes under, so the store applies
/// exactly the bounds the trailer reports against.
#[derive(Debug, Copy, Clone)]
pub(crate) struct LocateOrder<'doc> {
    /// The delivered node identities, source first.
    pub nodes: DeliveredNodes<'doc>,
    /// The delivered link-entity identities, ascending identity bytes.
    pub links: &'doc IdSlice<EdgeSlot, ArchivedEntityId>,
    /// Most properties the source's map delivers.
    pub properties: u32,
    /// Most direct-type URLs each link delivers.
    pub link_type_ids: u32,
    /// Most properties each link's map delivers.
    pub link_properties: u32,
}

/// The store's answer to one [`LocateOrder`], every column in delivered order.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateHydration {
    /// The node half of the answer.
    pub nodes: LocateNodeHydration,
    /// The link half of the answer.
    pub links: LocateLinkHydration,
}

/// The store-answered node columns of one locate hydration.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateNodeHydration {
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
    pub source_properties: Option<Vec<(BaseUrl, ScalarValue)>>,
    /// Whether the source's surviving properties are the entity's whole deliverable set.
    pub source_properties_complete: bool,
}

impl LocateNodeHydration {
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
/// The properties column doubles as the resolution flag. An entry is `Some` exactly when the store
/// resolved the link, so an unresolved link reads `None` there, empty types, and a slot outside
/// both completeness sets.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateLinkHydration {
    /// The link's direct-type versioned URLs per delivered edge, canonical order, capped.
    pub type_urls: IdVec<EdgeSlot, Vec<VersionedUrl>>,
    /// The delivered edges whose type list is the link's whole direct set.
    pub type_urls_complete: Box<DenseBitSlice<EdgeSlot>>,
    /// The link's surviving properties per delivered edge, ascending by base URL.
    pub properties: IdVec<EdgeSlot, Option<Vec<(BaseUrl, ScalarValue)>>>,
    /// The delivered edges whose surviving properties are the link entity's whole deliverable set.
    pub properties_complete: Box<DenseBitSlice<EdgeSlot>>,
}

impl LocateLinkHydration {
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

/// The store half of one locate response.
///
/// One call consumes the capability, so a response hydrates at most once and the type carries
/// that contract instead of a runtime check. An implementation answers the order from
/// wherever its store lives. The transport bridges to an async connection, and a test answers from
/// a fixture table with no store at all.
pub(crate) trait LocateStore {
    /// Answers one locate order with every store-derived column.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects a query or the answer can no longer reach
    /// the caller.
    fn hydrate(self, order: LocateOrder<'_>) -> Result<LocateHydration, DetailError>;
}

/// The store half of one edges response's detail trailer.
///
/// One call consumes the capability, so a response hydrates at most once and the type carries
/// that contract instead of a runtime check. An implementation answers from wherever its
/// store lives, and a test answers from a fixture table with no store at all.
pub(crate) trait EdgesStore {
    /// Answers each delivered link's first direct-type versioned URL, in delivered order.
    ///
    /// `None` marks a link the store no longer serves or records no types for.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query or the answer can no longer reach
    /// the caller.
    fn hydrate(
        self,
        links: &IdSlice<EdgeSlot, ArchivedEntityId>,
    ) -> Result<IdVec<EdgeSlot, Option<VersionedUrl>>, DetailError>;
}
