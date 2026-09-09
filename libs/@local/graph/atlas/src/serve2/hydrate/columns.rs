//! The hydrated data model.
//!
//! One column set per hydration read, each aligned to its delivered order: hydration writes them
//! off the store rows, assembly documents and encoders read them. An entity the store no longer
//! serves reads `null` in every column and stays outside every completeness set.

use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::id::VersionedUrl;

use super::scalar::ScalarProperties;
use crate::{
    bitset::DenseBitSlice,
    dataset::auxiliary::{Icon, Label},
    identity::{BasePosition, NodeRowId},
    postgres::id::ArchivedEntityId,
    serve::schedule::{ArrivalIndex, ArrivalRow, ViewRow}, // TODO: replace
};

hashql_core::id::newtype! {
    /// A reference to a delivered node by its slot in one response's delivered order.
    ///
    /// Slots are dense and zero-based over one response's delivered nodes. Every node detail
    /// column aligns to this domain. A slot is valid only against the response that delivered it,
    /// because two responses share no slot vocabulary.
    pub(crate) struct NodeSlot(u32)
}

hashql_core::id::newtype! {
    /// A reference to a delivered edge by its slot in one response's edge order.
    ///
    /// Slots are dense and zero-based over one response's delivered edges. Every link detail
    /// column aligns to this domain. A slot is valid only against the response that delivered it,
    /// because two responses share no slot vocabulary.
    pub(crate) struct EdgeSlot(u32)
}

hashql_core::id::newtype! {
    /// A reference to a required ontology type by its slot in one response's requirement order.
    ///
    /// Slots are dense and zero-based over the distinct type uuids one response's trailer
    /// requires, in first-occurrence order over the delivered edges. The hydrated URL column
    /// aligns to this domain. A slot is valid only against the response that required it,
    /// because two responses share no slot vocabulary.
    pub(crate) struct TypeSlot(u32)
}

/// The node identities behind one delivered set, viewed in slot order.
///
/// The hydration request's node subject. The view joins the delivered rows to their identities
/// on demand - a fitted row through the generation's identity column, a placed arrival through
/// the view's arrival table - and building one therefore allocates nothing. The transport that
/// must own the identities collects the iterator, which is the one copy the boundary pays.
#[derive(Debug, Copy, Clone)]
pub(crate) struct NodeRequestColumns<'request> {
    /// The generation's identity column, row order.
    pub ids: &'request IdSlice<NodeRowId, ArchivedEntityId>,
    /// The generation's row column, base order.
    pub rows: &'request IdSlice<BasePosition, NodeRowId>,
    /// The delivered rows, slot order, each in the domain that publishes it.
    pub delivered: &'request IdSlice<NodeSlot, ViewRow>,
    /// The view's arrival table, which the delivered arrival vessels address.
    pub arrivals: &'request IdSlice<ArrivalIndex, ArrivalRow>,
}

impl<'doc> NodeRequestColumns<'doc> {
    /// Returns the delivered count the details must cover.
    #[inline]
    #[must_use]
    #[cfg(test)] // The serve tests size expected trailers from delivered columns.
    pub(crate) const fn count(&self) -> usize {
        self.delivered.len()
    }

    /// Iterates the delivered identities, in slot order.
    ///
    /// # Panics
    ///
    /// Iteration panics on a delivered row outside the identity column, which open's
    /// cross-artifact validation rules out.
    pub(crate) fn iter(&self) -> impl Iterator<Item = ArchivedEntityId> + 'doc {
        let Self {
            ids,
            rows,
            delivered,
            arrivals,
        } = *self;

        delivered.iter().map(move |&vessel| match vessel {
            ViewRow::Base(position) => ids[rows[position]],
            ViewRow::Arrival(index) => arrivals[index].identity,
        })
    }
}

impl IntoIterator for &NodeRequestColumns<'_> {
    type Item = ArchivedEntityId;

    type IntoIter = impl Iterator<Item = ArchivedEntityId>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Hydrated per-point tile details, aligned to the delivered order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NodeTrailerColumns<'details> {
    /// The display label per delivered point.
    pub labels: Vec<&'details Label>,
    /// The icon per delivered point.
    pub icons: Vec<&'details Icon>,
}

impl NodeTrailerColumns<'_> {
    /// All-`null` details covering `count` points, the result when no id can resolve.
    #[must_use]
    #[cfg(test)] // The serve tests build unresolved-detail fixtures.
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            labels: vec![Label::EMPTY; count],
            icons: vec![Icon::empty(); count],
        }
    }
}

/// Hydrated per-point locate node details, aligned to the delivered order.
///
/// Labels and direct types for every delivered node, plus properties and their completeness for
/// the source alone - neighbour detail is one locate away.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LocateNodeColumns<'details> {
    /// The display label per delivered point.
    pub labels: IdVec<NodeSlot, &'details Label>,
    /// The direct-type versioned URLs per delivered point, canonical order.
    ///
    /// Empty when the store no longer serves the entity or records no types for it.
    pub type_urls: IdVec<NodeSlot, Vec<VersionedUrl>>,
    /// The source's surviving properties, ascending by base URL.
    ///
    /// `None` marks a source the store no longer serves. A resolved source without scalar
    /// properties reads an empty list.
    pub source_properties: Option<ScalarProperties>,
    /// Whether the source's surviving properties are the entity's whole deliverable set.
    ///
    /// `false` when the scalar-value filter or the cap dropped anything, and when the store no
    /// longer serves the source.
    pub source_properties_complete: bool,
}

/// Hydrated per-link locate details, aligned to the delivered edge order.
///
/// Every edge carries a label, direct types under a cap, properties under a cap, and both
/// completeness flags.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateLinkColumns<'details> {
    /// The link entity's display label per delivered edge.
    pub labels: IdVec<EdgeSlot, &'details Label>,
    /// The link's direct-type versioned URLs per delivered edge, canonical order, capped.
    ///
    /// Empty when the store no longer serves the link or records no types for it.
    pub type_urls: IdVec<EdgeSlot, Vec<VersionedUrl>>,
    /// The delivered edges whose type list is the link's whole direct set.
    ///
    /// An edge stays out when the cap truncated its list and when the store no longer serves the
    /// link.
    pub type_urls_complete: Box<DenseBitSlice<EdgeSlot>>,
    /// The link's surviving properties per delivered edge, ascending by base URL.
    ///
    /// `None` marks a link the store no longer serves.
    pub properties: IdVec<EdgeSlot, Option<ScalarProperties>>,
    /// The delivered edges whose surviving properties are the link entity's whole deliverable set.
    pub properties_complete: Box<DenseBitSlice<EdgeSlot>>,
}

/// Hydrated per-link edges details, aligned to the delivered edge order.
///
/// One label and one representative-type reference per edge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EdgeLinkColumns<'details> {
    /// The link entity's display label per delivered edge.
    pub labels: IdVec<EdgeSlot, &'details Label>,
    /// The link's representative type's versioned URL per delivered edge.
    pub representative_type_urls: IdVec<EdgeSlot, Option<VersionedUrl>>,
}
