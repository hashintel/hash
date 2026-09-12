use alloc::collections::BTreeMap;

use error_stack::Report;
use hashql_core::id::{Id as _, IdVec};
use type_system::ontology::{VersionedUrl, id::BaseUrl};

use super::{LocateDocumentError, subgraph::LocateSubgraph};
use crate::{
    bitset::DenseBitSlice,
    dataset::auxiliary::Label,
    postgres::id::ArchivedOntologyTypeUuid,
    serve::{
        hydrate::{
            EdgeSlot, LocateResponse, NodeSlot,
            scalar::{ScalarProperties, ScalarValue},
        },
        intern::{InternTable, TableIndex},
        membership::OntologySelection,
        scene::Scene,
    },
};

/// Scalar properties keyed by this trailer's property table.
pub(crate) struct PropertyMap(pub BTreeMap<TableIndex<BaseUrl>, ScalarValue>);

impl PropertyMap {
    fn new(properties: ScalarProperties, table: &mut InternTable<BaseUrl>) -> Self {
        Self(
            properties
                .into_iter()
                .map(|(name, value)| (table.intern(name), value))
                .collect(),
        )
    }
}

pub(crate) struct LocateTrailer<'details> {
    pub type_urls: InternTable<VersionedUrl>,
    pub property_urls: InternTable<BaseUrl>,
    pub labels: IdVec<NodeSlot, &'details Label>,
    pub representative_type_urls: IdVec<NodeSlot, Option<TableIndex<VersionedUrl>>>,
    pub properties: Option<PropertyMap>,
    pub type_ids_complete: bool,
    pub properties_complete: bool,
    pub link_labels: IdVec<EdgeSlot, &'details Label>,
    pub link_type_urls: IdVec<EdgeSlot, Vec<TableIndex<VersionedUrl>>>,
    pub link_type_urls_complete: Box<DenseBitSlice<EdgeSlot>>,
    pub link_properties: IdVec<EdgeSlot, Option<PropertyMap>>,
    pub link_properties_complete: Box<DenseBitSlice<EdgeSlot>>,
}

impl<'details> LocateTrailer<'details> {
    /// Aligns captured labels with the resolved details and builds their URL tables.
    ///
    /// # Errors
    ///
    /// Returns [`LocateDocumentError`] for a resolved entity without a captured display payload.
    pub(crate) fn new(
        Scene { world, epoch, .. }: Scene<'details>,
        subgraph: &LocateSubgraph,
        types: &OntologySelection,
        LocateResponse {
            nodes,
            links,
            source_properties,
        }: LocateResponse,
    ) -> Result<Self, Report<LocateDocumentError>> {
        let type_ids_complete = source_properties.is_some()
            && nodes[NodeSlot::MIN].details.as_ref().is_some_and(|source| {
                !source.type_urls.is_empty()
                    && source
                        .type_urls
                        .iter()
                        .all(|url| types.contains(ArchivedOntologyTypeUuid::from_url(url)))
            });

        let mut type_urls = InternTable::new();
        let mut labels = IdVec::with_capacity(nodes.len());
        let mut representative_type_urls = IdVec::with_capacity(nodes.len());
        for (slot, node) in nodes.into_iter_enumerated() {
            let Some(details) = node.details else {
                labels.push(Label::EMPTY);
                representative_type_urls.push(None);
                continue;
            };

            let row = subgraph.nodes[slot];
            labels.push(
                world
                    .layout
                    .index
                    .payload(epoch, row)
                    .ok_or_else(|| Report::new(LocateDocumentError::NodeDisplay { row }))?
                    .label(),
            );
            representative_type_urls.push(
                details
                    .type_urls
                    .into_iter()
                    .next()
                    .map(|url| type_urls.intern(url)),
            );
        }

        let mut property_urls = InternTable::new();
        let properties_complete = source_properties
            .as_ref()
            .is_some_and(|properties| properties.complete);
        let properties = source_properties
            .map(|properties| PropertyMap::new(properties.values, &mut property_urls));

        let mut link_labels = IdVec::with_capacity(links.len());
        let mut link_type_urls = IdVec::with_capacity(links.len());
        let mut link_type_urls_complete = DenseBitSlice::new_empty(links.len());
        let mut link_properties = IdVec::with_capacity(links.len());
        let mut link_properties_complete = DenseBitSlice::new_empty(links.len());
        for (slot, link) in links.into_iter_enumerated() {
            let Some(details) = link.details else {
                link_labels.push(Label::EMPTY);
                link_type_urls.push(Vec::new());
                link_properties.push(None);
                continue;
            };

            let row = subgraph.edges[slot.as_usize()].row.unwrap();
            link_labels.push(
                world
                    .topology
                    .payload(epoch, row)
                    .ok_or_else(|| Report::new(LocateDocumentError::LinkDisplay { row }))?
                    .label(),
            );
            link_type_urls.push(
                details
                    .type_urls
                    .into_iter()
                    .map(|url| type_urls.intern(url))
                    .collect(),
            );
            link_type_urls_complete.set(slot, details.type_urls_complete);
            link_properties.push(Some(PropertyMap::new(
                details.properties.values,
                &mut property_urls,
            )));
            link_properties_complete.set(slot, details.properties.complete);
        }

        Ok(Self {
            type_urls,
            property_urls,
            labels,
            representative_type_urls,
            properties,
            type_ids_complete,
            properties_complete,
            link_labels,
            link_type_urls,
            link_type_urls_complete,
            link_properties,
            link_properties_complete,
        })
    }
}
