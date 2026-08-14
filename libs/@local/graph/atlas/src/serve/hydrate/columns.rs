//! The hydrated data model.
//!
//! One column set per hydration read, each aligned to its delivered order: hydration writes them
//! off the store rows, assembly documents and encoders read them. An entity the store no longer
//! serves reads `null` in every column and stays outside every completeness set.

use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::id::{BaseUrl, VersionedUrl};

use crate::{
    bitset::DenseBitSlice,
    dataset::{
        auxiliary::{Icon, Label},
        postgres::id::ArchivedEntityId,
    },
    identity::NodeRowId,
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

/// The node identities behind one delivered set, viewed in slot order.
///
/// The hydration request's node subject. The view joins the generation's identity column over
/// the delivered rows on demand, so building one allocates nothing. The transport that must own
/// the identities collects the iterator, which is the one copy the boundary pays.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DeliveredNodes<'doc> {
    /// The generation's identity column, row order.
    ids: &'doc IdSlice<NodeRowId, ArchivedEntityId>,
    /// The delivered rows, slot order.
    rows: &'doc IdSlice<NodeSlot, NodeRowId>,
}

impl<'doc> DeliveredNodes<'doc> {
    /// Views one delivered set's identities in slot order.
    ///
    /// The order is the hydration key: every detail column the store answers aligns to it.
    pub(crate) const fn new(
        ids: &'doc IdSlice<NodeRowId, ArchivedEntityId>,
        rows: &'doc IdSlice<NodeSlot, NodeRowId>,
    ) -> Self {
        Self { ids, rows }
    }

    /// Returns the delivered count the details must cover.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> usize {
        self.rows.len()
    }

    /// Views the delivered rows, in slot order.
    pub(crate) const fn rows(&self) -> &'doc IdSlice<NodeSlot, NodeRowId> {
        self.rows
    }

    /// Iterates the delivered identities, in slot order.
    ///
    /// # Panics
    ///
    /// Iteration panics on a delivered row outside the identity column, which open's
    /// cross-artifact validation rules out.
    pub(crate) fn iter(&self) -> impl Iterator<Item = ArchivedEntityId> + 'doc {
        let ids = self.ids;
        self.rows.iter().map(move |&row| ids[row])
    }
}

impl IntoIterator for &DeliveredNodes<'_> {
    type Item = ArchivedEntityId;

    type IntoIter = impl Iterator<Item = ArchivedEntityId>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Hydrated per-point tile details, aligned to the delivered order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NodeDetails<'details> {
    /// The display label per delivered point.
    labels: Vec<&'details Label>,
    /// The icon per delivered point.
    icons: Vec<&'details Icon>,
}

impl<'details> NodeDetails<'details> {
    /// Assembles the columns, aligned to one delivered order.
    pub(crate) const fn new(labels: Vec<&'details Label>, icons: Vec<&'details Icon>) -> Self {
        Self { labels, icons }
    }

    /// All-`null` details covering `count` points, the result when no id can resolve.
    #[must_use]
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            labels: vec![Label::empty(); count],
            icons: vec![Icon::empty(); count],
        }
    }

    /// Views the label column, delivered order.
    #[inline]
    pub(crate) const fn labels(&self) -> &[&'details Label] {
        &self.labels
    }

    /// Views the icon column, delivered order.
    #[inline]
    pub(crate) const fn icons(&self) -> &[&'details Icon] {
        &self.icons
    }
}

/// One scalar property value.
///
/// A hydrated property value takes no other shape. The store filters out nested objects and arrays,
/// so they never cross the connection.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ScalarValue {
    /// A text scalar.
    String(String),
    /// A number the store renders integral, within `i64`.
    Integer(i64),
    /// Any other number.
    ///
    /// Store scalars are doubles on the wire.
    Float(f64),
    /// A boolean scalar.
    Bool(bool),
    /// An explicit null the entity carries.
    Null,
}

/// Hydrated per-point locate node details, aligned to the delivered order.
///
/// Labels and direct types for every delivered node; properties and their completeness for the
/// source alone - neighbour detail is one locate away.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LocateNodeDetails<'details> {
    /// The display label per delivered point.
    labels: IdVec<NodeSlot, &'details Label>,
    /// The direct-type versioned URLs per delivered point, canonical order.
    ///
    /// Empty when the store no longer serves the entity or records no types for it.
    type_urls: IdVec<NodeSlot, Vec<VersionedUrl>>,
    /// The source's surviving properties, ascending by base URL.
    ///
    /// `None` marks a source the store no longer serves; a resolved source without scalar
    /// properties reads an empty list.
    source_properties: Option<Vec<(BaseUrl, ScalarValue)>>,
    /// Whether the source's surviving properties are the entity's whole deliverable set.
    ///
    /// `false` when the scalar-value filter or the cap dropped anything, and when the store no
    /// longer serves the source.
    source_properties_complete: bool,
}

impl<'details> LocateNodeDetails<'details> {
    /// Assembles the columns, aligned to one delivered order.
    pub(crate) const fn new(
        labels: IdVec<NodeSlot, &'details Label>,
        type_urls: IdVec<NodeSlot, Vec<VersionedUrl>>,
        source_properties: Option<Vec<(BaseUrl, ScalarValue)>>,
        source_properties_complete: bool,
    ) -> Self {
        Self {
            labels,
            type_urls,
            source_properties,
            source_properties_complete,
        }
    }

    /// All-`null` details covering `count` points, the result when no id can resolve.
    #[must_use]
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            labels: IdVec::from_elem(Label::empty(), count),
            type_urls: IdVec::from_elem(Vec::new(), count),
            source_properties: None,
            source_properties_complete: false,
        }
    }

    /// Views the label column, slot order.
    #[inline]
    pub(crate) const fn labels(&self) -> &IdSlice<NodeSlot, &'details Label> {
        &self.labels
    }

    /// Views the direct-type URL column, slot order.
    #[inline]
    pub(crate) const fn type_urls(&self) -> &IdSlice<NodeSlot, Vec<VersionedUrl>> {
        &self.type_urls
    }

    /// Views the source's surviving properties.
    ///
    /// `None` marks a store-absent source.
    #[inline]
    pub(crate) const fn source_properties(&self) -> Option<&[(BaseUrl, ScalarValue)]> {
        self.source_properties.as_deref()
    }

    /// Returns whether the source's surviving properties are the entity's whole deliverable set.
    #[inline]
    pub(crate) const fn source_properties_complete(&self) -> bool {
        self.source_properties_complete
    }
}

/// Hydrated per-link locate details, aligned to the delivered edge order.
///
/// Every edge carries a label, direct types under a cap, properties under a cap, and both
/// completeness flags.
#[derive(Debug, PartialEq)]
pub(crate) struct LocateLinkDetails<'details> {
    /// The link entity's display label per delivered edge.
    labels: IdVec<EdgeSlot, &'details Label>,
    /// The link's direct-type versioned URLs per delivered edge, canonical order, capped.
    ///
    /// Empty when the store no longer serves the link or records no types for it.
    type_urls: IdVec<EdgeSlot, Vec<VersionedUrl>>,
    /// The delivered edges whose type list is the link's whole direct set.
    ///
    /// An edge stays out when the cap truncated its list and when the store no longer serves the
    /// link.
    type_urls_complete: Box<DenseBitSlice<EdgeSlot>>,
    /// The link's surviving properties per delivered edge, ascending by base URL.
    ///
    /// `None` marks a link the store no longer serves.
    properties: IdVec<EdgeSlot, Option<Vec<(BaseUrl, ScalarValue)>>>,
    /// The delivered edges whose surviving properties are the link entity's whole deliverable set.
    properties_complete: Box<DenseBitSlice<EdgeSlot>>,
}

impl<'details> LocateLinkDetails<'details> {
    /// Assembles the columns, aligned to one delivered order.
    pub(crate) const fn new(
        labels: IdVec<EdgeSlot, &'details Label>,
        type_urls: IdVec<EdgeSlot, Vec<VersionedUrl>>,
        type_urls_complete: Box<DenseBitSlice<EdgeSlot>>,
        properties: IdVec<EdgeSlot, Option<Vec<(BaseUrl, ScalarValue)>>>,
        properties_complete: Box<DenseBitSlice<EdgeSlot>>,
    ) -> Self {
        Self {
            labels,
            type_urls,
            type_urls_complete,
            properties,
            properties_complete,
        }
    }

    /// All-`null` details covering `count` edges, the result when no id can resolve.
    #[must_use]
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            labels: IdVec::from_elem(Label::empty(), count),
            type_urls: IdVec::from_elem(Vec::new(), count),
            type_urls_complete: DenseBitSlice::new_empty(count),
            properties: IdVec::from_elem(None, count),
            properties_complete: DenseBitSlice::new_empty(count),
        }
    }

    /// Views the link label column, slot order.
    #[inline]
    pub(crate) const fn labels(&self) -> &IdSlice<EdgeSlot, &'details Label> {
        &self.labels
    }

    /// Views the capped direct-type URL column, slot order.
    #[inline]
    pub(crate) const fn type_urls(&self) -> &IdSlice<EdgeSlot, Vec<VersionedUrl>> {
        &self.type_urls
    }

    /// Views the per-edge type completeness set, over the delivered edge slots.
    #[inline]
    pub(crate) fn type_urls_complete(&self) -> &DenseBitSlice<EdgeSlot> {
        &self.type_urls_complete
    }

    /// Views the per-edge property column, slot order.
    #[inline]
    pub(crate) const fn properties(
        &self,
    ) -> &IdSlice<EdgeSlot, Option<Vec<(BaseUrl, ScalarValue)>>> {
        &self.properties
    }

    /// Views the per-edge property completeness set, over the delivered edge slots.
    #[inline]
    pub(crate) fn properties_complete(&self) -> &DenseBitSlice<EdgeSlot> {
        &self.properties_complete
    }
}

/// Hydrated per-link edges details, aligned to the delivered edge order.
///
/// One label and one first-type reference per edge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EdgeLinkDetails<'details> {
    /// The link entity's display label per delivered edge.
    labels: IdVec<EdgeSlot, &'details Label>,
    /// The link's first direct type's versioned URL per delivered edge.
    first_type_urls: IdVec<EdgeSlot, Option<VersionedUrl>>,
}

impl<'details> EdgeLinkDetails<'details> {
    /// Assembles the columns, aligned to one delivered order.
    pub(crate) const fn new(
        labels: IdVec<EdgeSlot, &'details Label>,
        first_type_urls: IdVec<EdgeSlot, Option<VersionedUrl>>,
    ) -> Self {
        Self {
            labels,
            first_type_urls,
        }
    }

    /// All-`null` details covering `count` edges, the result when no id can resolve.
    #[must_use]
    pub(crate) fn empty(count: usize) -> Self {
        Self {
            labels: IdVec::from_elem(Label::empty(), count),
            first_type_urls: IdVec::from_elem(None, count),
        }
    }

    /// Views the link label column, slot order.
    #[inline]
    pub(crate) const fn labels(&self) -> &IdSlice<EdgeSlot, &'details Label> {
        &self.labels
    }

    /// Views the first direct-type URL column, slot order.
    #[inline]
    pub(crate) const fn first_type_urls(&self) -> &IdSlice<EdgeSlot, Option<VersionedUrl>> {
        &self.first_type_urls
    }
}
