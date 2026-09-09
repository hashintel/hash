//! Aligned tile columns over a captured scene.
//!
//! Construction gathers delivery rows and optional display payloads before serialization.

mod codec;
#[cfg(test)]
mod tests;

use alloc::alloc::Allocator;
use core::{error::Error, fmt};

use error_stack::Report;
use hashql_core::id::{Id as _, IdVec};

use super::{
    Document,
    codec::{Envelope, Mode},
    masks::TypeMasks,
};
use crate::{
    dataset::auxiliary::{Icon, Label},
    file::generation::GenerationId,
    identity::NodeRowId,
    math::{Bounds2, Log2, Vec2},
    morton::{Depth, MortonCell, MortonTile, Zoom},
    serve2::{codec::EncodedRowId, membership::OntologySelection, scene::Scene, walk::Walk},
};

hashql_core::id::newtype! {
    pub(crate) struct TileSlot(u32)
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TileLimits {
    /// Most requested types, including duplicates. The default is 32.
    pub colored_type_ids: u32 = 32,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum TileDocumentDetailLevel {
    Minimal,
    Auxiliary,
}

pub(crate) struct TileDocumentOptions<'selection> {
    pub mode: Mode,
    pub detail: TileDocumentDetailLevel,
    /// Mask bits in request order, including duplicate types.
    pub types: &'selection OntologySelection,
    pub limits: TileLimits,
}

#[derive(Debug)]
pub(crate) enum TileDocumentError {
    /// The request exceeds the configured type-count limit.
    Types { count: usize, maximum: u32 },
    /// The zoom exceeds the generation's deepest served tile.
    Zoom { zoom: Zoom, maximum: Zoom },
    /// The coordinate lies outside its zoom's grid.
    Coordinate { tile: MortonTile },
    /// A delivered row has no position in the captured scene.
    Position { row: NodeRowId },
    /// A delivered row has no display payload in the captured scene.
    Display { row: NodeRowId },
}

impl fmt::Display for TileDocumentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Types { count, maximum } => write!(
                fmt,
                "the request lists {count} colored type ids, exceeding the limit of {maximum}"
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
            Self::Position { row } => write!(fmt, "delivered node {row} has no position"),
            Self::Display { row } => write!(fmt, "delivered node {row} has no display payload"),
        }
    }
}

impl Error for TileDocumentError {}

pub(crate) struct TileTrailer<'details> {
    labels: IdVec<TileSlot, &'details Label>,
    icons: IdVec<TileSlot, &'details Icon>,
}

impl<'details> TileTrailer<'details> {
    fn new(capacity: usize) -> Self {
        Self {
            labels: IdVec::with_capacity(capacity),
            icons: IdVec::with_capacity(capacity),
        }
    }

    fn push(
        &mut self,
        Scene { world, epoch, .. }: Scene<'details>,
        row: NodeRowId,
    ) -> Result<(), Report<TileDocumentError>> {
        let legend = world
            .layout
            .index
            .payload(epoch, row)
            .ok_or_else(|| Report::new(TileDocumentError::Display { row }))?;
        self.labels.push(legend.label());
        self.icons.push(
            world
                .ontology
                .icon(epoch, legend.representative_ontology())
                .unwrap_or(Icon::empty()),
        );
        Ok(())
    }
}

/// Metadata of the entire post-intersection visible set.
struct GlobalHead {
    visible: u64,
    bounds: Option<Bounds2>,
    min_resolution: u64,
}

/// One tile's geometry and optional details in bucket-major delivery order.
pub(crate) struct TileDocument<'details> {
    generation: GenerationId,
    coordinate: MortonTile,
    mode: Mode,
    first_bucket: Depth,
    runs: Vec<usize>,
    positions: IdVec<TileSlot, Vec2>,
    ids: IdVec<TileSlot, EncodedRowId<NodeRowId>>,
    type_masks: Option<TypeMasks<TileSlot>>,
    global: Option<GlobalHead>,
    children: u8,
    trailer: Option<TileTrailer<'details>>,
}

impl<'details> TileDocument<'details> {
    /// Gathers one tile from the scene's delivery schedule.
    ///
    /// Type masks use the generation's captured ontology memberships. Unknown types and rows
    /// outside the fitted position domain have zero bits. An empty type selection omits the mask
    /// column. A nonempty selection over an empty tile keeps an empty column.
    ///
    /// Auxiliary detail borrows each row's label and resolves the representative type's icon
    /// through the captured ontology. Missing icons use an empty value.
    ///
    /// # Errors
    ///
    /// Returns [`TileDocumentError`] for invalid request bounds or a delivered row without a
    /// position or display payload.
    pub(crate) fn new(
        scene @ Scene {
            world,
            epoch,
            delivery,
            schedule,
            ..
        }: Scene<'details>,
        coordinate: MortonTile,
        TileDocumentOptions {
            mode,
            detail,
            types,
            limits,
        }: &TileDocumentOptions<'_>,
    ) -> Result<Self, Report<TileDocumentError>> {
        if types.len() > limits.colored_type_ids as usize {
            return Err(Report::new(TileDocumentError::Types {
                count: types.len(),
                maximum: limits.colored_type_ids,
            }));
        }
        let zoom = coordinate.z.zoom(Log2::ZERO);
        let maximum = world.schedule().max_tile_depth();
        if zoom > maximum {
            return Err(Report::new(TileDocumentError::Zoom { zoom, maximum }));
        }
        let cell = MortonCell::from_tile(coordinate)
            .ok_or_else(|| Report::new(TileDocumentError::Coordinate { tile: coordinate }))?;
        let walk = Walk {
            schedule: delivery,
            index: &world.layout.index,
        };
        let delivered = match mode {
            Mode::Delta => walk.delta(epoch, zoom, cell),
            Mode::Total => walk.total(epoch, zoom, cell),
        };
        let count = delivered.rows.len();
        let type_masks = (!types.is_empty())
            .then(|| TypeMasks::new(scene, delivered.rows.iter().copied(), types));
        let global = (coordinate.z == Depth::MIN).then(|| GlobalHead {
            visible: delivery.root_delivered() as u64,
            bounds: schedule.bounds(),
            min_resolution: u64::from(delivery.min_resolution().get()),
        });
        let trailer = match detail {
            TileDocumentDetailLevel::Minimal => None,
            TileDocumentDetailLevel::Auxiliary => Some(TileTrailer::new(count)),
        };
        let mut this = Self {
            generation: world.generation().id(),
            coordinate,
            mode: *mode,
            first_bucket: delivered.first_bucket,
            runs: delivered.runs,
            positions: IdVec::with_capacity(count),
            ids: IdVec::with_capacity(count),
            type_masks,
            global,
            children: delivery.children(zoom, cell),
            trailer,
        };
        for row in delivered.rows {
            let position = world
                .layout
                .position(epoch, row)
                .ok_or_else(|| Report::new(TileDocumentError::Position { row }))?;
            this.positions.push(position);
            this.ids.push(world.layout.index.encode(row));
            if let Some(trailer) = &mut this.trailer {
                trailer.push(scene, row)?;
            }
        }
        Ok(this)
    }
}

impl Document for TileDocument<'_> {
    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Envelope {
        self::codec::TileResponse {
            variant: 0,
            document: self,
        }
        .encode_into(buffer)
    }
}
