//! The hydrated data model.
//!
//! One column set per read surface, each aligned to its delivered order: hydration writes them
//! off the store rows, assembly documents and encoders read them. An entity the store no longer
//! serves reads `null` in every column and `false` in every completeness flag.

use crate::dataset::ArchivedEntityId;

/// The entity identities behind one delivered set, in delivered order.
///
/// The hydration request's subject.
#[derive(Debug)]
pub struct DeliveredEntities {
    /// One entry per delivered point.
    ids: Vec<ArchivedEntityId>,
}

impl DeliveredEntities {
    /// Takes one delivered set's identities in delivered order.
    ///
    /// The order is the hydration key: every detail column the store answers aligns to it.
    pub(in crate::serve) const fn new(ids: Vec<ArchivedEntityId>) -> Self {
        Self { ids }
    }

    /// Returns the delivered count the details must cover.
    #[inline]
    #[must_use]
    pub const fn count(&self) -> usize {
        self.ids.len()
    }

    /// Views the delivered identities, in delivered order.
    pub(super) const fn ids(&self) -> &[ArchivedEntityId] {
        self.ids.as_slice()
    }
}

/// Hydrated per-point tile details, aligned to the delivered order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeDetails {
    /// The display label per delivered point.
    labels: Vec<Option<String>>,
    /// The icon per delivered point.
    icons: Vec<Option<String>>,
}

impl NodeDetails {
    /// Assembles the columns, aligned to one delivered order.
    pub(super) const fn new(labels: Vec<Option<String>>, icons: Vec<Option<String>>) -> Self {
        Self { labels, icons }
    }

    /// All-`null` details covering `count` points, the result when no id can resolve.
    #[must_use]
    pub(in crate::serve) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            icons: vec![None; count],
        }
    }

    /// Views the label column, delivered order.
    #[inline]
    pub(in crate::serve) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the icon column, delivered order.
    #[inline]
    pub(in crate::serve) const fn icons(&self) -> &[Option<String>] {
        &self.icons
    }
}

/// One simple property value.
///
/// A hydrated property value takes no other shape. The store filters out nested objects and arrays,
/// so they never cross the connection.
#[derive(Debug, Clone, PartialEq)]
pub enum SimpleValue {
    /// A text scalar.
    Text(String),
    /// A number the store renders integral, within `i64`.
    Integer(i64),
    /// Any other number.
    ///
    /// Store scalars are doubles on the wire.
    Float(f64),
    /// A boolean scalar.
    Boolean(bool),
    /// An explicit null the entity carries.
    Null,
}

/// Hydrated per-point locate node details, aligned to the delivered order.
///
/// Labels and direct types for every delivered node; properties and their completeness for the
/// source alone - neighbour detail is one locate away.
#[derive(Debug, Clone, PartialEq)]
pub struct LocateNodeDetails {
    /// The display label per delivered point.
    labels: Vec<Option<String>>,
    /// The direct-type versioned URLs per delivered point, canonical order.
    ///
    /// Empty when the store no longer serves the entity or records no types for it.
    type_urls: Vec<Vec<String>>,
    /// The source's surviving properties, ascending by base URL.
    ///
    /// `None` marks a source the store no longer serves; a resolved source without simple
    /// properties reads an empty list.
    source_properties: Option<Vec<(String, SimpleValue)>>,
    /// Whether the source's surviving properties are the entity's whole deliverable set.
    ///
    /// `false` when the simple-value filter or the cap dropped anything, and when the store no
    /// longer serves the source.
    source_properties_complete: bool,
}

impl LocateNodeDetails {
    /// Assembles the columns, aligned to one delivered order.
    pub(super) const fn new(
        labels: Vec<Option<String>>,
        type_urls: Vec<Vec<String>>,
        source_properties: Option<Vec<(String, SimpleValue)>>,
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
    pub(in crate::serve) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            type_urls: vec![Vec::new(); count],
            source_properties: None,
            source_properties_complete: false,
        }
    }

    /// Views the label column, delivered order.
    #[inline]
    pub(in crate::serve) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the direct-type URL column, delivered order.
    #[inline]
    pub(in crate::serve) const fn type_urls(&self) -> &[Vec<String>] {
        &self.type_urls
    }

    /// Views the source's surviving properties.
    ///
    /// `None` marks a store-absent source.
    #[inline]
    pub(in crate::serve) const fn source_properties(&self) -> Option<&Vec<(String, SimpleValue)>> {
        self.source_properties.as_ref()
    }

    /// Returns whether the source's surviving properties are the entity's whole deliverable set.
    #[inline]
    pub(in crate::serve) const fn source_properties_complete(&self) -> bool {
        self.source_properties_complete
    }
}

/// Hydrated per-link locate details, aligned to the delivered edge order.
///
/// Every edge carries a label, direct types under a cap, properties under a cap, and both
/// completeness flags.
#[derive(Debug, Clone, PartialEq)]
pub struct LocateLinkDetails {
    /// The link entity's display label per delivered edge.
    labels: Vec<Option<String>>,
    /// The link's direct-type versioned URLs per delivered edge, canonical order, capped.
    ///
    /// Empty when the store no longer serves the link or records no types for it.
    type_urls: Vec<Vec<String>>,
    /// Whether each edge's type list is the link's whole direct set.
    ///
    /// `false` when the cap truncated it and when the store no longer serves the link.
    type_urls_complete: Vec<bool>,
    /// The link's surviving properties per delivered edge, ascending by base URL.
    ///
    /// `None` marks a link the store no longer serves.
    properties: Vec<Option<Vec<(String, SimpleValue)>>>,
    /// Whether each edge's surviving properties are the link entity's whole deliverable set.
    properties_complete: Vec<bool>,
}

impl LocateLinkDetails {
    /// Assembles the columns, aligned to one delivered order.
    pub(super) const fn new(
        labels: Vec<Option<String>>,
        type_urls: Vec<Vec<String>>,
        type_urls_complete: Vec<bool>,
        properties: Vec<Option<Vec<(String, SimpleValue)>>>,
        properties_complete: Vec<bool>,
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
    pub(in crate::serve) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            type_urls: vec![Vec::new(); count],
            type_urls_complete: vec![false; count],
            properties: vec![None; count],
            properties_complete: vec![false; count],
        }
    }

    /// Views the link label column, delivered order.
    #[inline]
    pub(in crate::serve) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the capped direct-type URL column, delivered order.
    #[inline]
    pub(in crate::serve) const fn type_urls(&self) -> &[Vec<String>] {
        &self.type_urls
    }

    /// Views the per-edge type completeness flags, delivered order.
    #[inline]
    pub(in crate::serve) const fn type_urls_complete(&self) -> &[bool] {
        &self.type_urls_complete
    }

    /// Views the per-edge property column, delivered order.
    #[inline]
    pub(in crate::serve) const fn properties(&self) -> &[Option<Vec<(String, SimpleValue)>>] {
        &self.properties
    }

    /// Views the per-edge property completeness flags, delivered order.
    #[inline]
    pub(in crate::serve) const fn properties_complete(&self) -> &[bool] {
        &self.properties_complete
    }
}

/// Hydrated per-link edges details, aligned to the delivered edge order.
///
/// One label and one first-type reference per edge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeLinkDetails {
    /// The link entity's display label per delivered edge.
    labels: Vec<Option<String>>,
    /// The link's first direct type's versioned URL per delivered edge.
    first_type_urls: Vec<Option<String>>,
}

impl EdgeLinkDetails {
    /// Assembles the columns, aligned to one delivered order.
    pub(super) const fn new(
        labels: Vec<Option<String>>,
        first_type_urls: Vec<Option<String>>,
    ) -> Self {
        Self {
            labels,
            first_type_urls,
        }
    }

    /// All-`null` details covering `count` edges, the result when no id can resolve.
    #[must_use]
    pub(in crate::serve) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            first_type_urls: vec![None; count],
        }
    }

    /// Views the link label column, delivered order.
    #[inline]
    pub(in crate::serve) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the first direct-type URL column, delivered order.
    #[inline]
    pub(in crate::serve) const fn first_type_urls(&self) -> &[Option<String>] {
        &self.first_type_urls
    }
}
