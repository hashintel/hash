//! Quadtree tile scans and the version-4 binary delivery wire.

#![expect(
    clippy::little_endian_bytes,
    reason = "the tile wire requires explicit canonical little-endian scalars"
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
/// Media type for the fixed version-4 tile wire.
pub(crate) const TILE_WIRE_V4_CONTENT_TYPE: &str = "application/vnd.hash.atlas.tile-v4";

const TILE_WIRE_MAGIC: [u8; 8] = *b"ATLTILE4";
const TILE_WIRE_VERSION: u16 = 4;
const TILE_WIRE_HEADER_BYTES: usize = 160;
const TILE_WIRE_POINT_BYTES: usize = 8;
const TILE_WIRE_BUCKET_BYTES: usize = 4;
const TILE_WIRE_WEIGHT_BYTES: usize = 4;
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
    /// Borrows the complete wire-v4 response body.
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

/// Reads one quadrant from every delivery bucket and encodes wire-v3.
///
/// Buckets deliver in importance order and backfill the response until
/// `request.point_budget` is reached. Within the bucket where the budget
/// runs out, the tile's Morton range is midpoint-stride sampled across its
/// full extent instead of cut as a Morton prefix, so a truncated delivery
/// stays spatially fair rather than collapsing into the Z-curve prefix
/// staircase of the tile. Each bucket's selection is then emitted in
/// progressive order (ascending bit-reversed tile-local Morton suffix), so
/// every client-side prefix of the response is spatially stratified as well.
/// A per-bucket delivered-count table follows the header, assigning every
/// bucket-major record its importance rung so clients can weight rungs
/// consistently across tiles. After the records, a parallel per-record
/// represented-count table attributes every undelivered visible point to
/// the delivered record sharing its deepest Morton cell, so the counts sum
/// to the visible subtree count and clients can render truncated tiles as
/// an unbiased density field. The complete subtree count is measured
/// independently of the budget.
///
/// # Errors
///
/// Returns an error when required base sections are absent, have inconsistent
/// lengths or offsets, are not sorted by Morton key within a bucket, exceed
/// wire-v3 count limits, or response allocation fails.
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
    let mut bucket_counts = Vec::<u32>::new();
    bucket_counts
        .try_reserve_exact(offsets.len().saturating_sub(1))
        .map_err(|_error| TileError::Allocation)?;
    let mut bucket_ranges = Vec::<(usize, usize)>::new();
    bucket_ranges
        .try_reserve_exact(offsets.len().saturating_sub(1))
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
        bucket_ranges.push((start + local_start, start + local_end));
        visible = visible
            .checked_add(range_length)
            .ok_or(TileError::CountOverflow)?;
        let remaining = request.point_budget.get().saturating_sub(selected.len());
        if remaining == 0 || range_length == 0 {
            bucket_counts.push(0);
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
        bucket_counts.push(
            u32::try_from(selected.len() - bucket_selection_start)
                .map_err(|_error| TileError::CountOverflow)?,
        );
    }
    let visible_subtree_count =
        u32::try_from(visible).map_err(|_error| TileError::CountOverflow)?;
    let delivered_count =
        u32::try_from(selected.len()).map_err(|_error| TileError::CountOverflow)?;
    let weights = represented_counts(morton, &bucket_ranges, &bucket_counts, &selected)?;
    let bytes = encode(
        release,
        store_snapshot_identity,
        variant,
        request,
        visible_subtree_count,
        delivered_count,
        &bucket_counts,
        &selected,
        &weights,
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

/// Computes how many visible points each delivered record stands for.
///
/// Every record counts itself. Every undelivered visible point — the rest
/// of the truncated bucket plus every bucket the budget never reached — is
/// attributed to the delivered record that shares its deepest Morton cell,
/// i.e. the longest common key prefix. Over Morton-sorted delivered keys the
/// longest common prefix is always achieved by the predecessor or successor
/// of the point's key, so one binary search per point suffices; prefix-depth
/// ties resolve to the predecessor. The resulting counts sum to the visible
/// subtree count, which lets clients render truncated deliveries as an
/// unbiased density field with mass placed at the delivery's own resolution.
fn represented_counts(
    morton: &[u32],
    bucket_ranges: &[(usize, usize)],
    bucket_counts: &[u32],
    selected: &[(u32, u32)],
) -> Result<Vec<u32>, TileError> {
    let mut weights = Vec::<u32>::new();
    weights
        .try_reserve_exact(selected.len())
        .map_err(|_error| TileError::Allocation)?;
    weights.resize(selected.len(), 1);
    let mut delivered = Vec::<(u32, usize)>::new();
    delivered
        .try_reserve_exact(selected.len())
        .map_err(|_error| TileError::Allocation)?;
    for (index, &(_row, key)) in selected.iter().enumerate() {
        delivered.push((key, index));
    }
    delivered.sort_unstable();

    for (&(range_start, range_end), &count) in bucket_ranges.iter().zip(bucket_counts) {
        let range_length = range_end.saturating_sub(range_start);
        let picks = count as usize;
        if picks == range_length {
            continue;
        }
        let mut pick = 0;
        let mut next_pick_offset = if picks == 0 {
            None
        } else {
            Some(midpoint_stride(0, picks, range_length)?)
        };
        for (offset, index) in (range_start..range_end).enumerate() {
            if next_pick_offset == Some(offset) {
                pick += 1;
                next_pick_offset = if pick < picks {
                    Some(midpoint_stride(pick, picks, range_length)?)
                } else {
                    None
                };
                continue;
            }
            attribute_to_deepest_cell(morton[index], &delivered, &mut weights)?;
        }
    }
    Ok(weights)
}

/// Adds one undelivered point to its deepest-common-cell delivered record.
fn attribute_to_deepest_cell(
    key: u32,
    delivered: &[(u32, usize)],
    weights: &mut [u32],
) -> Result<(), TileError> {
    let position = delivered.partition_point(|&(delivered_key, _index)| delivered_key < key);
    let predecessor = position.checked_sub(1).map(|index| delivered[index]);
    let successor = delivered.get(position).copied();
    let target = match (predecessor, successor) {
        (Some((predecessor_key, predecessor_index)), Some((successor_key, successor_index))) => {
            if (successor_key ^ key).leading_zeros() > (predecessor_key ^ key).leading_zeros() {
                successor_index
            } else {
                predecessor_index
            }
        }
        (Some((_, predecessor_index)), None) => predecessor_index,
        (None, Some((_, successor_index))) => successor_index,
        (None, None) => {
            unreachable!("an undelivered point implies at least one delivered record")
        }
    };
    let weight = &mut weights[target];
    *weight = weight.checked_add(1).ok_or(TileError::CountOverflow)?;
    Ok(())
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

#[expect(
    clippy::too_many_arguments,
    reason = "the encoder writes exactly the wire fields in wire order"
)]
fn encode(
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
    request: TileRequest,
    visible_subtree_count: u32,
    delivered_count: u32,
    bucket_counts: &[u32],
    points: &[(u32, u32)],
    weights: &[u32],
) -> Result<Vec<u8>, TileError> {
    debug_assert_eq!(points.len(), weights.len());
    let table_bytes = bucket_counts
        .len()
        .checked_mul(TILE_WIRE_BUCKET_BYTES)
        .and_then(|counts| counts.checked_add(TILE_WIRE_BUCKET_BYTES))
        .ok_or(TileError::CountOverflow)?;
    let body_bytes = points
        .len()
        .checked_mul(TILE_WIRE_POINT_BYTES)
        .ok_or(TileError::CountOverflow)?;
    let weight_bytes = weights
        .len()
        .checked_mul(TILE_WIRE_WEIGHT_BYTES)
        .ok_or(TileError::CountOverflow)?;
    let total_bytes = TILE_WIRE_HEADER_BYTES
        .checked_add(table_bytes)
        .and_then(|bytes| bytes.checked_add(body_bytes))
        .and_then(|bytes| bytes.checked_add(weight_bytes))
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
    bytes.extend_from_slice(
        &u32::try_from(bucket_counts.len())
            .map_err(|_error| TileError::CountOverflow)?
            .to_le_bytes(),
    );
    for &bucket_count in bucket_counts {
        bytes.extend_from_slice(&bucket_count.to_le_bytes());
    }
    for &(row, morton) in points {
        let [x, y] = MortonKey::from_u32(morton).coordinates();
        bytes.extend_from_slice(&row.to_le_bytes());
        bytes.extend_from_slice(&x.to_le_bytes());
        bytes.extend_from_slice(&y.to_le_bytes());
    }
    for &weight in weights {
        bytes.extend_from_slice(&weight.to_le_bytes());
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
