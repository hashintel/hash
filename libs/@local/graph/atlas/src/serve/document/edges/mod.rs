use alloc::alloc::Allocator;
use core::{error::Error, fmt};

use error_stack::Report;
use hashql_core::id::IdVec;
use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

use super::{Document, codec::Envelope};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::Label,
    file::generation::GenerationId,
    identity::NodeRowId,
    math::Log2,
    morton::{MortonCell, MortonTile, Zoom},
    postgres::id::ArchivedEntityId,
    serve::{
        codec::EncodedRowId,
        hydrate::{HydrateError, TypeUrlResolver},
        intern::{InternTable, TableIndex},
        neighbourhood::{DeliveredEdge, Neighbourhood},
        scene::Scene,
    },
};

mod codec;
#[cfg(test)]
mod tests;

hashql_core::id::newtype! {
    /// A reference to one delivered edge by its slot in this document's edge order.
    pub(crate) struct EdgeSlot(u32)
}

/// A failure to assemble an edges document.
#[derive(Debug)]
pub(crate) enum EdgesDocumentError {
    /// The request lists more tiles than the configured limit.
    Tiles { count: usize, maximum: u32 },
    /// A tile's zoom exceeds the generation's maximum served zoom.
    Zoom { zoom: Zoom, maximum: Zoom },
    /// A tile lies outside its zoom's grid.
    Coordinate { tile: MortonTile },
    /// An admitted edge has no captured display payload for its auxiliary detail.
    Display,
    /// Type-URL resolution failed at the recorded [`HydrateError`] stage.
    Hydrate(HydrateError),
}

impl fmt::Display for EdgesDocumentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tiles { count, maximum } => write!(
                fmt,
                "the request lists {count} tiles, exceeding the limit of {maximum}"
            ),
            Self::Zoom { zoom, maximum } => write!(
                fmt,
                "tile zoom {zoom} exceeds the maximum served zoom {maximum}"
            ),
            Self::Coordinate {
                tile: MortonTile { z, x, y },
            } => {
                write!(fmt, "tile {}/{x}/{y} lies outside its zoom's grid", z.get())
            }
            Self::Display => fmt.write_str("an admitted edge has no display payload"),
            Self::Hydrate(error) => write!(fmt, "edge type URL resolution failed: {error}"),
        }
    }
}

impl Error for EdgesDocumentError {}

/// Whether an edges document carries only its columns or also the auxiliary trailer.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EdgesDocumentDetailLevel {
    /// Columns alone: source, target and identity per edge.
    Minimal,
    /// Columns plus the trailer: label and representative type URL per edge.
    Auxiliary,
}

/// Caps on one edges request: the tiles it may name and the edges it may induce.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EdgesLimits {
    /// The most tiles one request may list, 256 by default.
    pub tiles: u32 = 256,
    /// The most edges one response may induce, 0x4000 by default.
    pub edges: u32 = 0x4000,
}

/// Delivery detail, limits and a representative-type URL resolver for one edges request.
pub(crate) struct EdgesDocumentOptions<R> {
    pub detail: EdgesDocumentDetailLevel,
    pub limits: EdgesLimits,
    pub resolver: R,
}

/// The auxiliary detail for one edges document.
///
/// It holds each edge's label and representative type URL, interned once across the whole
/// response.
#[derive(Debug)]
pub(crate) struct EdgesTrailer<'details> {
    labels: IdVec<EdgeSlot, &'details Label>,
    representative_type_urls: IdVec<EdgeSlot, Option<TableIndex<VersionedUrl>>>,
    representative_type_urls_interner: InternTable<VersionedUrl>,
}

impl<'details> EdgesTrailer<'details> {
    /// Builds the trailer for `edges`.
    ///
    /// `resolver` resolves each edge's representative ontology type.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesDocumentError::Display`] when an edge has no captured display payload, and
    /// [`EdgesDocumentError::Hydrate`] when `resolver` fails to resolve a representative type URL.
    fn new(
        Scene { world, epoch, .. }: Scene<'details>,
        edges: impl IntoIterator<Item = DeliveredEdge, IntoIter: ExactSizeIterator>,
        resolver: &impl TypeUrlResolver,
    ) -> Result<Self, Report<EdgesDocumentError>> {
        let edges = edges.into_iter();
        let mut labels = IdVec::with_capacity(edges.len());

        let mut ontology_type_uuid_interner = InternTable::<OntologyTypeUuid>::new();
        let mut representative_type_urls_interner = InternTable::new();

        let mut dispatch: IdVec<EdgeSlot, Option<TableIndex<OntologyTypeUuid>>> =
            IdVec::with_capacity(edges.len());

        for edge in edges {
            let legend = world
                .topology
                .payload(epoch, edge.row.unwrap())
                .ok_or_else(|| Report::new(EdgesDocumentError::Display))?;
            labels.push(legend.label());
            dispatch.push(
                world
                    .ontology
                    .key_of(epoch, legend.representative_ontology())
                    .map(|uuid| ontology_type_uuid_interner.intern(*uuid)),
            );
        }

        let mut mapping: IdVec<TableIndex<OntologyTypeUuid>, Option<TableIndex<VersionedUrl>>> =
            IdVec::with_capacity(ontology_type_uuid_interner.len());
        if !ontology_type_uuid_interner.is_empty() {
            let pairs = resolver
                .resolve(ontology_type_uuid_interner.entries().iter().copied())
                .map_err(|report| {
                    let error = EdgesDocumentError::Hydrate(*report.current_context());
                    report.change_context(error)
                })?;

            for (uuid, url) in pairs {
                if let Some(slot) = ontology_type_uuid_interner.index_of(&uuid) {
                    mapping.insert(slot, representative_type_urls_interner.intern(url));
                }
            }
        }

        let representative_type_urls = dispatch
            .into_iter()
            .map(|slot| mapping.lookup(slot?).copied())
            .collect();

        Ok(Self {
            labels,
            representative_type_urls,
            representative_type_urls_interner,
        })
    }
}

/// The identity and endpoint columns of delivered edges, with an optional auxiliary trailer.
#[derive(Debug)]
pub(crate) struct EdgesDocument<'details> {
    generation: GenerationId,

    ids: IdVec<EdgeSlot, ArchivedEntityId>,
    sources: IdVec<EdgeSlot, EncodedRowId<NodeRowId>>,
    targets: IdVec<EdgeSlot, EncodedRowId<NodeRowId>>,

    trailer: Option<EdgesTrailer<'details>>,

    complete: bool,
}

impl<'details> EdgesDocument<'details> {
    /// Assembles the edges induced by the nodes delivered in `tiles`.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesDocumentError`] for an invalid tile count or address, unavailable captured
    /// display data, or failed type-URL hydration.
    pub(crate) fn new<R>(
        scene @ Scene {
            world, delivery, ..
        }: Scene<'details>,
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
            return Err(Report::new(EdgesDocumentError::Tiles {
                count: tiles.len(),
                maximum: limits.tiles,
            }));
        }

        let maximum = world.schedule().max_tile_depth();

        let mut delivered = CompressedBitSet::new();
        for &tile in tiles {
            let zoom = tile.z.zoom(Log2::ZERO);
            if zoom > maximum {
                return Err(Report::new(EdgesDocumentError::Zoom { zoom, maximum }));
            }

            let cell = MortonCell::from_tile(tile)
                .ok_or_else(|| Report::new(EdgesDocumentError::Coordinate { tile }))?;
            for node in delivery.total(zoom, cell).rows {
                delivered.insert(node);
            }
        }

        let induced = Neighbourhood { provider: scene }.induced(&delivered, limits.edges as usize);

        let length = induced.edges.len();
        let trailer = match detail {
            EdgesDocumentDetailLevel::Minimal => None,
            EdgesDocumentDetailLevel::Auxiliary => Some(EdgesTrailer::new(
                scene,
                induced.edges.iter().copied(),
                resolver,
            )?),
        };

        let mut this = Self {
            generation: world.generation().id(),
            ids: IdVec::with_capacity(length),
            sources: IdVec::with_capacity(length),
            targets: IdVec::with_capacity(length),
            trailer,
            complete: induced.complete,
        };

        for DeliveredEdge {
            endpoints: [source, target],
            identity,
            ..
        } in induced.edges
        {
            this.ids.push(identity);
            this.sources.push(world.layout.index.encode(source));
            this.targets.push(world.layout.index.encode(target));
        }

        Ok(this)
    }
}

impl Document for EdgesDocument<'_> {
    type Error = !;

    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error> {
        Ok(self::codec::EdgesResponse {
            generation: self.generation,
            variant: 0,
            document: self,
        }
        .encode_into(buffer))
    }
}
