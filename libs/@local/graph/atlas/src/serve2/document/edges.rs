use error_stack::Report;
use hashql_core::id::IdVec;
use type_system::ontology::VersionedUrl;

use crate::{
    bench::MortonCell,
    bitset::CompressedBitSet,
    dataset::auxiliary::Label,
    identity::NodeRowId,
    math::Log2,
    morton::MortonTile,
    postgres::id::ArchivedEntityId,
    serve::hydrate::EdgesStore,
    serve2::{
        codec::EncodedRowId,
        hydrate::TypeUrlResolver,
        intern::{InternTable, TableIndex},
        neighbourhood::{DeliveredEdge, Neighbourhood},
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

pub(crate) struct EdgesDocumentOptions<R> {
    pub detail: EdgesDocumentDetailLevel,
    pub limits: EdgesLimits,
    pub resolver: R,
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
    pub(crate) fn new<R>(
        scene @ Scene {
            world,
            epoch,
            mask,
            schedule,
            delivery,
        }: Scene,
        tiles: &[MortonTile],
        EdgesDocumentOptions {
            detail,
            limits,
            resolver,
        }: &EdgesDocumentOptions<R>,
    ) -> Result<Self, Report<EdgesDocumentError>>
    where
        R: TypeUrlResolver,
    {
        if tiles.len() > limits.tiles as usize {
            todo!("error out")
        }

        // TODO: error out if zoom too large

        let mut delivered = CompressedBitSet::new();
        for &tile in tiles {
            let cell = MortonCell::from_tile(tile).ok_or_else(|| todo!("error out"))?;

            for node in delivery.total(tile.z.zoom(Log2::ZERO), cell).rows {
                delivered.insert(node);
            }
        }

        let induced = Neighbourhood { provider: scene }.induced(&delivered, limits.edges as usize);

        let length = induced.edges.len();
        let mut this = EdgesDocument {
            ids: IdVec::with_capacity(length),
            sources: IdVec::with_capacity(length),
            targets: IdVec::with_capacity(length),
            trailer: None,
            complete: induced.complete,
        };

        this.trailer = match detail {
            EdgesDocumentDetailLevel::Minimal => None,
            EdgesDocumentDetailLevel::Auxiliary => {
                let trailer = EdgesTrailer {
                    labels: IdVec::with_capacity(length),
                    representative_type_urls: IdVec::with_capacity(length),
                    representative_type_urls_interner: InternTable::new(),
                };

                let mut dispatch = IdVec::new();
                for edge in &induced.edges {
                    let legend = world.topology.payload(epoch, edge.row.unwrap());
                    todo!()
                }

                Some(trailer)
            }
        };

        for DeliveredEdge {
            row: _,
            endpoints: [source, target],
            identity,
        } in induced.edges
        {
            this.ids.push(identity);
            this.sources.push(world.layout.index.encode(source));
            this.targets.push(world.layout.index.encode(target));
        }

        Ok(this)
    }
}
