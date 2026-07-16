//! Quadtree tile scans and the version-2 binary delivery wire.

#![expect(
    clippy::little_endian_bytes,
    reason = "tile wire v2 requires explicit canonical little-endian scalars"
)]

use core::{error::Error, fmt, num::NonZeroUsize};

use super::{
    MortonKey,
    base::{BUCKET_OFFSETS, MORTON_KEYS, ROWS},
};
use crate::salt::{
    activation::ActiveRelease, hash::ContentHash, revision::VariantId, storage::mmap::ArtifactView,
};

/// Maximum point budget accepted for one tile response.
pub(crate) const MAXIMUM_TILE_POINTS: usize = 0x0001_0000;
/// Media type for the fixed version-2 tile wire.
pub(crate) const TILE_WIRE_V2_CONTENT_TYPE: &str = "application/vnd.hash.atlas.tile-v2";

const TILE_WIRE_MAGIC: [u8; 8] = *b"ATLTILE2";
const TILE_WIRE_VERSION: u16 = 2;
const TILE_WIRE_HEADER_BYTES: usize = 160;
const TILE_WIRE_POINT_BYTES: usize = 8;
const COMPLETE_FLAG: u8 = 1;
const MAXIMUM_TILE_ZOOM: u8 = 16;

/// One validated quadtree tile request.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TileRequest {
    zoom: u8,
    x: u32,
    y: u32,
    point_budget: NonZeroUsize,
}

impl TileRequest {
    /// Validates one tile coordinate and bounded delivery budget.
    ///
    /// # Errors
    ///
    /// Returns an error when `zoom` exceeds the persisted Morton depth, the
    /// quadrant lies outside that zoom, or the point budget exceeds the wire
    /// ceiling.
    pub(crate) fn new(
        zoom: u8,
        x: u32,
        y: u32,
        point_budget: NonZeroUsize,
    ) -> Result<Self, TileError> {
        if zoom > MAXIMUM_TILE_ZOOM {
            return Err(TileError::Zoom { zoom });
        }
        let axis_cells = 1_u32 << u32::from(zoom);
        if x >= axis_cells || y >= axis_cells {
            return Err(TileError::Quadrant {
                zoom,
                x,
                y,
                axis_cells,
            });
        }
        if point_budget.get() > MAXIMUM_TILE_POINTS {
            return Err(TileError::PointBudget {
                requested: point_budget.get(),
                maximum: MAXIMUM_TILE_POINTS,
            });
        }
        Ok(Self {
            zoom,
            x,
            y,
            point_budget,
        })
    }
}

/// Encoded immutable tile and its response identity.
#[derive(Debug)]
pub(crate) struct EncodedTile {
    bytes: Vec<u8>,
    content_hash: ContentHash,
    visible_subtree_count: u32,
    delivered_count: u32,
}

impl EncodedTile {
    /// Borrows the complete wire-v2 response body.
    #[must_use]
    pub(crate) fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the tile and returns its complete response body.
    #[must_use]
    pub(crate) fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    /// Returns the exact response-body identity.
    #[must_use]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }

    /// Returns all points in the requested spatial subtree.
    #[must_use]
    pub(crate) const fn visible_subtree_count(&self) -> u32 {
        self.visible_subtree_count
    }

    /// Returns the number of encoded point records.
    #[must_use]
    pub(crate) const fn delivered_count(&self) -> u32 {
        self.delivered_count
    }
}

/// Reads one quadrant from every delivery bucket and encodes wire-v2.
///
/// Buckets deliver in importance order and backfill the response until
/// `request.point_budget` is reached. Within the bucket where the budget
/// runs out, the tile's Morton range is midpoint-stride sampled across its
/// full extent instead of cut as a Morton prefix, so a truncated delivery
/// stays spatially fair rather than collapsing into the Z-curve prefix
/// staircase of the tile. Each bucket's selection is then emitted in
/// progressive order (ascending bit-reversed tile-local Morton suffix), so
/// every client-side prefix of the response is spatially stratified as well.
/// The complete subtree count is measured independently of the budget.
///
/// # Errors
///
/// Returns an error when required base sections are absent, have inconsistent
/// lengths or offsets, are not sorted by Morton key within a bucket, exceed
/// wire-v2 count limits, or response allocation fails.
pub(crate) fn encode_tile(
    artifact: ArtifactView<'_>,
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
    request: TileRequest,
) -> Result<EncodedTile, TileError> {
    let rows = u32_section(artifact, ROWS, "rows")?;
    let morton = u32_section(artifact, MORTON_KEYS, "morton keys")?;
    let offsets = u64_section(artifact, BUCKET_OFFSETS, "bucket offsets")?;
    validate_sections(rows, morton, offsets)?;
    let (minimum, maximum) = morton_range(request);
    let suffix_bits = 2 * u32::from(MAXIMUM_TILE_ZOOM - request.zoom);
    let mut selected = Vec::<(u32, u32)>::new();
    selected
        .try_reserve_exact(request.point_budget.get())
        .map_err(|_error| TileError::Allocation)?;
    let mut visible = 0_usize;
    for bucket in offsets.windows(2) {
        let &[start_offset, end_offset] = bucket else {
            unreachable!("two-wide windows always contain two offsets");
        };
        let start = usize::try_from(start_offset).map_err(|_error| TileError::Offsets)?;
        let end = usize::try_from(end_offset).map_err(|_error| TileError::Offsets)?;
        let keys = &morton[start..end];
        let local_start = keys.partition_point(|&key| u64::from(key) < minimum);
        let local_end = keys.partition_point(|&key| u64::from(key) < maximum);
        let range_length = local_end.saturating_sub(local_start);
        visible = visible
            .checked_add(range_length)
            .ok_or(TileError::CountOverflow)?;
        let remaining = request.point_budget.get().saturating_sub(selected.len());
        if remaining == 0 || range_length == 0 {
            continue;
        }
        let bucket_selection_start = selected.len();
        if range_length <= remaining {
            for index in start + local_start..start + local_end {
                selected.push((rows[index], morton[index]));
            }
        } else {
            // The budget lands inside this bucket. A Morton-prefix cut would
            // deliver only the Z-curve staircase at the start of the tile, so
            // midpoint-stride sample the bucket's full range instead: pick
            // `remaining` stratum midpoints, which stay strictly increasing
            // because the stratum width is at least one.
            for pick in 0..remaining {
                let offset = midpoint_stride(pick, remaining, range_length)?;
                let index = start + local_start + offset;
                selected.push((rows[index], morton[index]));
            }
        }
        // Progressive delivery order: sorting by the bit-reversed tile-local
        // Morton suffix interleaves quadrants recursively, so any prefix of
        // the response is a spatially stratified subset. The sort is stable
        // and ranks collide only for duplicate keys, which keeps the byte
        // stream deterministic.
        selected[bucket_selection_start..]
            .sort_by_key(|&(_row, key)| progressive_rank(key, minimum, suffix_bits));
    }
    let visible_subtree_count =
        u32::try_from(visible).map_err(|_error| TileError::CountOverflow)?;
    let delivered_count =
        u32::try_from(selected.len()).map_err(|_error| TileError::CountOverflow)?;
    let bytes = encode(
        release,
        store_snapshot_identity,
        variant,
        request,
        visible_subtree_count,
        delivered_count,
        &selected,
    )?;
    let content_hash = ContentHash::digest(&bytes);
    Ok(EncodedTile {
        bytes,
        content_hash,
        visible_subtree_count,
        delivered_count,
    })
}

fn validate_sections(rows: &[u32], morton: &[u32], offsets: &[u64]) -> Result<(), TileError> {
    if rows.len() != morton.len() || offsets.len() < 2 || offsets[0] != 0 {
        return Err(TileError::Offsets);
    }
    let row_count = u64::try_from(rows.len()).map_err(|_error| TileError::CountOverflow)?;
    if offsets.last().copied() != Some(row_count) {
        return Err(TileError::Offsets);
    }
    for bucket in offsets.windows(2) {
        let &[start_offset, end_offset] = bucket else {
            unreachable!("two-wide windows always contain two offsets");
        };
        if start_offset > end_offset || end_offset > row_count {
            return Err(TileError::Offsets);
        }
        let start = usize::try_from(start_offset).map_err(|_error| TileError::Offsets)?;
        let end = usize::try_from(end_offset).map_err(|_error| TileError::Offsets)?;
        if !morton[start..end].is_sorted() {
            return Err(TileError::MortonOrder);
        }
    }
    Ok(())
}

/// Returns the midpoint of stratum `pick` of `total` equal strata over
/// `range_length` records.
fn midpoint_stride(pick: usize, total: usize, range_length: usize) -> Result<usize, TileError> {
    let pick = u64::try_from(pick).map_err(|_error| TileError::CountOverflow)?;
    let total = u64::try_from(total).map_err(|_error| TileError::CountOverflow)?;
    let range_length = u64::try_from(range_length).map_err(|_error| TileError::CountOverflow)?;
    let numerator = pick
        .checked_mul(2)
        .and_then(|doubled| doubled.checked_add(1))
        .and_then(|odd| odd.checked_mul(range_length))
        .ok_or(TileError::CountOverflow)?;
    let offset = numerator / (2 * total);
    usize::try_from(offset).map_err(|_error| TileError::CountOverflow)
}

/// Ranks a Morton key by its bit-reversed tile-local suffix.
///
/// Keys inside one tile share the leading `32 - suffix_bits` prefix, so the
/// suffix alone distinguishes them. Reversing it makes coarse quadrant bits
/// the least significant rank bits, producing the progressive (van der
/// Corput) traversal in which every prefix covers the tile evenly.
const fn progressive_rank(key: u32, range_minimum: u64, suffix_bits: u32) -> u32 {
    if suffix_bits == 0 {
        return 0;
    }
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the tile-local suffix occupies at most 32 bits by construction"
    )]
    let suffix = (key as u64 - range_minimum) as u32;
    suffix.reverse_bits() >> (32 - suffix_bits)
}

fn morton_range(request: TileRequest) -> (u64, u64) {
    let axis_shift = u32::from(MAXIMUM_TILE_ZOOM - request.zoom);
    let x = u16::try_from(request.x << axis_shift)
        .expect("validated tile x shifted to the 16-bit Morton axis");
    let y = u16::try_from(request.y << axis_shift)
        .expect("validated tile y shifted to the 16-bit Morton axis");
    let prefix = MortonKey::new(x, y).prefix(request.zoom);
    let bit_shift = u32::from(2 * (MAXIMUM_TILE_ZOOM - request.zoom));
    let minimum = u64::from(prefix) << bit_shift;
    let maximum = (u64::from(prefix) + 1) << bit_shift;
    (minimum, maximum)
}

fn encode(
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
    request: TileRequest,
    visible_subtree_count: u32,
    delivered_count: u32,
    points: &[(u32, u32)],
) -> Result<Vec<u8>, TileError> {
    let body_bytes = points
        .len()
        .checked_mul(TILE_WIRE_POINT_BYTES)
        .ok_or(TileError::CountOverflow)?;
    let total_bytes = TILE_WIRE_HEADER_BYTES
        .checked_add(body_bytes)
        .ok_or(TileError::CountOverflow)?;
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(total_bytes)
        .map_err(|_error| TileError::Allocation)?;
    bytes.extend_from_slice(&TILE_WIRE_MAGIC);
    bytes.extend_from_slice(&TILE_WIRE_VERSION.to_le_bytes());
    bytes.extend_from_slice(
        &u16::try_from(TILE_WIRE_HEADER_BYTES)
            .expect("tile header length fits u16")
            .to_le_bytes(),
    );
    bytes.extend_from_slice(&variant.get().to_le_bytes());
    bytes.push(request.zoom);
    bytes.push(u8::from(visible_subtree_count == delivered_count) * COMPLETE_FLAG);
    bytes.extend_from_slice(&request.x.to_le_bytes());
    bytes.extend_from_slice(&request.y.to_le_bytes());
    bytes.extend_from_slice(&visible_subtree_count.to_le_bytes());
    bytes.extend_from_slice(&delivered_count.to_le_bytes());
    let active = release.head();
    bytes.extend_from_slice(active.generation.content_hash().as_bytes());
    bytes.extend_from_slice(store_snapshot_identity.as_bytes());
    bytes.extend_from_slice(active.manifest.as_bytes());
    bytes.extend_from_slice(release.report().as_bytes());
    debug_assert_eq!(bytes.len(), TILE_WIRE_HEADER_BYTES);
    for &(row, morton) in points {
        let [x, y] = MortonKey::from_u32(morton).coordinates();
        bytes.extend_from_slice(&row.to_le_bytes());
        bytes.extend_from_slice(&x.to_le_bytes());
        bytes.extend_from_slice(&y.to_le_bytes());
    }
    debug_assert_eq!(bytes.len(), total_bytes);
    Ok(bytes)
}

fn u32_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: crate::salt::storage::mmap::SectionId,
    name: &'static str,
) -> Result<&'artifact [u32], TileError> {
    artifact
        .section(id)
        .ok_or(TileError::MissingSection { name })?
        .as_u32()
        .map_err(|_error| TileError::SectionType { name })
}

fn u64_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: crate::salt::storage::mmap::SectionId,
    name: &'static str,
) -> Result<&'artifact [u64], TileError> {
    artifact
        .section(id)
        .ok_or(TileError::MissingSection { name })?
        .as_u64()
        .map_err(|_error| TileError::SectionType { name })
}

/// Invalid tile request or verified base artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TileError {
    Zoom {
        zoom: u8,
    },
    Quadrant {
        zoom: u8,
        x: u32,
        y: u32,
        axis_cells: u32,
    },
    PointBudget {
        requested: usize,
        maximum: usize,
    },
    MissingSection {
        name: &'static str,
    },
    SectionType {
        name: &'static str,
    },
    Offsets,
    MortonOrder,
    CountOverflow,
    Allocation,
}

impl fmt::Display for TileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Zoom { zoom } => write!(formatter, "tile zoom {zoom} exceeds 16"),
            Self::Quadrant {
                zoom,
                x,
                y,
                axis_cells,
            } => write!(
                formatter,
                "tile ({x}, {y}) is outside the {axis_cells} by {axis_cells} grid at zoom {zoom}"
            ),
            Self::PointBudget { requested, maximum } => write!(
                formatter,
                "tile point budget {requested} exceeds the maximum {maximum}"
            ),
            Self::MissingSection { name } => {
                write!(formatter, "canonical base is missing its {name} section")
            }
            Self::SectionType { name } => {
                write!(
                    formatter,
                    "canonical base {name} section has the wrong scalar type"
                )
            }
            Self::Offsets => formatter.write_str("canonical base bucket offsets are invalid"),
            Self::MortonOrder => {
                formatter.write_str("canonical base Morton keys are not ordered within a bucket")
            }
            Self::CountOverflow => formatter.write_str("tile counts exceed wire-v2 limits"),
            Self::Allocation => formatter.write_str("tile response allocation failed"),
        }
    }
}

impl Error for TileError {}
