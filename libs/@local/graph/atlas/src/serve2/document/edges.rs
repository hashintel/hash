use error_stack::Report;
use hashql_core::id::IdVec;
use type_system::ontology::VersionedUrl;

use crate::{
    dataset::auxiliary::Label,
    identity::NodeRowId,
    morton::MortonTile,
    postgres::id::ArchivedEntityId,
    serve2::{
        codec::EncodedRowId,
        intern::{InternTable, TableIndex},
        scene::Scene,
        walk::Walk,
    },
};

hashql_core::id::newtype! {
    pub(crate) struct EdgeSlot(u32)
}

pub(crate) struct EdgesDocumentError;

pub(crate) enum EdgesDocumentDetailLevel {
    Minimal,
    Auxiliary,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct EdgesLimits {
    pub tiles: u32 = 256,
    pub edges: u32 = 0x4000,
}

pub(crate) struct EdgesDocumentOptions {
    pub detail: EdgesDocumentDetailLevel,
    pub limits: EdgesLimits,
}

pub(crate) struct EdgesTrailer<'details> {
    labels: IdVec<EdgeSlot, &'details Label>,
    representative_type_urls: IdVec<EdgeSlot, Option<TableIndex<VersionedUrl>>>,

    representative_type_urls_interner: InternTable<VersionedUrl>,
}

pub(crate) struct EdgesDocument<'details> {
    ids: IdVec<EdgeSlot, ArchivedEntityId>,
    sources: IdVec<EdgeSlot, EncodedRowId<NodeRowId>>,
    targets: IdVec<EdgeSlot, EncodedRowId<NodeRowId>>,

    trailer: Option<EdgesTrailer<'details>>,

    complete: bool,
}

impl<'details> EdgesDocument<'details> {
    pub(crate) fn new(
        Scene {
            world,
            epoch,
            mask,
            schedule,
            delivery,
        }: Scene,
        tiles: &[MortonTile],
        EdgesDocumentOptions { detail, limits }: &EdgesDocumentOptions,
    ) -> Result<Self, Report<EdgesDocumentError>> {
        if tiles.len() > limits.tiles as usize {
            todo!("error out")
        }

        let walk = Walk {
            schedule: delivery,
            index: &world.layout.index,
        };

        // TODO: first we need: the view, and the store, and the limits
        todo!()
    }
}
