//! Serve-time analytic overlays: contour polygons and region flows.
//!
//! Both overlays are derived views over immutable artifacts that already
//! exist for every activated generation: the analytic density raster, its
//! persistence merge tree and watershed regions, and the semantic k-neighbor
//! graph. Nothing here changes rankings, artifacts, or identities; the
//! encoders read mapped sections and emit small immutable wire bodies.
//!
//! # Coordinate frame
//!
//! Overlay geometry originates in canonical coordinates while tile records
//! use the 16-bit quantized world. The quantization extent is generation
//! configuration and is not persisted, but both frames contain the same
//! point set: the analytic `BOUNDS` section stores its tight canonical
//! extent and the base artifact's Morton keys yield its tight world extent.
//! Mapping one tight extent onto the other reproduces the original affine
//! quantization up to less than one raster pixel, which is far below the
//! contour tolerance.

#![expect(
    clippy::little_endian_bytes,
    reason = "the overlay wires require explicit canonical little-endian scalars"
)]

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};
use std::collections::HashMap;

use super::{MortonKey, base::MORTON_KEYS};
use crate::salt::{
    activation::ActiveRelease,
    analytic::{
        ANALYTIC_BOUNDS, ANALYTIC_DENSITY, LEAF_BIRTHS, LEAF_DEATHS, LEAF_PARENTS,
        LEAF_REPRESENTATIVE_PIXELS, PEAK_PIXELS, POINT_REGIONS, REGION_PARENTS, REGION_PERSISTENCE,
    },
    graph::{SEMANTIC_INDICES, SEMANTIC_WEIGHTS},
    hash::ContentHash,
    revision::VariantId,
    storage::mmap::ArtifactView,
};

/// Media type for the fixed version-1 contour wire.
pub(crate) const CONTOUR_WIRE_V1_CONTENT_TYPE: &str = "application/vnd.hash.atlas.contours-v1";
/// Media type for the fixed version-1 region-flow wire.
pub(crate) const FLOW_WIRE_V1_CONTENT_TYPE: &str = "application/vnd.hash.atlas.flows-v1";

const CONTOUR_WIRE_MAGIC: [u8; 8] = *b"ATLCONT1";
const FLOW_WIRE_MAGIC: [u8; 8] = *b"ATLFLOW1";
const OVERLAY_WIRE_VERSION: u16 = 1;
const OVERLAY_WIRE_HEADER_BYTES: usize = 160;
const CONTOUR_RECORD_BYTES: usize = 20;
const CONTOUR_VERTEX_BYTES: usize = 4;
const FLOW_REGION_BYTES: usize = 12;
const FLOW_RECORD_BYTES: usize = 16;
/// Douglas-Peucker tolerance in raster pixels. One raster pixel already
/// spans many world units, so contours are decorative-precision by design.
const SIMPLIFY_TOLERANCE_PIXELS: f64 = 1.25;
const UNASSIGNED_REGION: u32 = u32::MAX;
const NO_PARENT: u32 = u32::MAX;

/// Encoded immutable overlay body and its response identity.
#[derive(Debug)]
pub(crate) struct EncodedOverlay {
    bytes: Vec<u8>,
    content_hash: ContentHash,
}

impl EncodedOverlay {
    /// Borrows the complete wire response body.
    #[must_use]
    pub(crate) const fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the overlay and returns its complete response body.
    #[must_use]
    pub(crate) fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    /// Returns the exact response-body identity.
    #[must_use]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// Affine map from canonical analytic coordinates to the 16-bit world.
#[derive(Debug, Copy, Clone)]
struct WorldFrame {
    canonical_minimum: [f64; 2],
    canonical_span: [f64; 2],
    world_minimum: [f64; 2],
    world_span: [f64; 2],
}

impl WorldFrame {
    /// Recovers the quantization frame from the two tight extents.
    fn from_artifacts(
        analytic: ArtifactView<'_>,
        base: ArtifactView<'_>,
    ) -> Result<Self, OverlayError> {
        let bounds = f64_section(analytic, ANALYTIC_BOUNDS, "analytic bounds")?;
        let &[minimum_x, minimum_y, maximum_x, maximum_y] = bounds else {
            return Err(OverlayError::SectionShape {
                name: "analytic bounds",
            });
        };
        let morton = u32_section(base, MORTON_KEYS, "morton keys")?;
        let mut world_minimum = [f64::from(u16::MAX); 2];
        let mut world_maximum = [0.0_f64; 2];
        for &key in morton {
            let [x, y] = MortonKey::from_u32(key).coordinates();
            world_minimum[0] = world_minimum[0].min(f64::from(x));
            world_minimum[1] = world_minimum[1].min(f64::from(y));
            world_maximum[0] = world_maximum[0].max(f64::from(x));
            world_maximum[1] = world_maximum[1].max(f64::from(y));
        }
        if morton.is_empty() {
            world_minimum = [0.0; 2];
        }
        Ok(Self {
            canonical_minimum: [minimum_x, minimum_y],
            canonical_span: [maximum_x - minimum_x, maximum_y - minimum_y],
            world_minimum,
            world_span: [
                (world_maximum[0] - world_minimum[0]).max(0.0),
                (world_maximum[1] - world_minimum[1]).max(0.0),
            ],
        })
    }

    /// Maps one canonical coordinate into quantized world axes.
    fn to_world(self, canonical: [f64; 2]) -> [u16; 2] {
        let mut world = [0_u16; 2];
        for axis in 0..2 {
            let normalized = if self.canonical_span[axis] > 0.0 {
                (canonical[axis] - self.canonical_minimum[axis]) / self.canonical_span[axis]
            } else {
                0.0
            };
            world[axis] =
                world_axis(normalized.mul_add(self.world_span[axis], self.world_minimum[axis]));
        }
        world
    }
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the value is clamped to the 16-bit axis range before conversion"
)]
const fn world_axis(value: f64) -> u16 {
    value.round().clamp(0.0, f64::from(u16::MAX)) as u16
}

/// Reads one leaf contour polygon table and encodes the contour wire.
///
/// For every persistence leaf the encoder floods the eight-connected
/// superlevel component `density > death` from the leaf's representative
/// pixel, traces the component's outer rectilinear boundary, simplifies it
/// in raster space, and quantizes the vertices into tile world coordinates.
/// Thresholding strictly above the death level needs no epsilon: the saddle
/// that kills the component sits exactly at its death density, so sibling
/// components stay separated. Contours nest exactly as the merge tree does,
/// which makes the wire a direct hierarchy scaffold for edge bundling.
///
/// # Errors
///
/// Returns an error when required sections are absent or malformed, a leaf
/// references a pixel outside the raster or below its own death level, or
/// wire counts overflow.
pub(crate) fn encode_contours(
    analytic: ArtifactView<'_>,
    base: ArtifactView<'_>,
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
) -> Result<EncodedOverlay, OverlayError> {
    let (density, grid_size) = density_section(analytic)?;
    let births = f64_section(analytic, LEAF_BIRTHS, "leaf births")?;
    let deaths = f64_section(analytic, LEAF_DEATHS, "leaf deaths")?;
    let parents = u64_section(analytic, LEAF_PARENTS, "leaf parents")?;
    let representatives = u64_section(
        analytic,
        LEAF_REPRESENTATIVE_PIXELS,
        "leaf representative pixels",
    )?;
    if births.len() != deaths.len()
        || births.len() != parents.len()
        || births.len() != representatives.len()
    {
        return Err(OverlayError::SectionShape {
            name: "merge-tree leaves",
        });
    }
    let frame = WorldFrame::from_artifacts(analytic, base)?;

    let mut records = Vec::<ContourRecord>::new();
    records
        .try_reserve_exact(births.len())
        .map_err(|_error| OverlayError::Allocation)?;
    let mut vertices = Vec::<[u16; 2]>::new();
    let mut mask = vec![false; density.len()];
    for (leaf, &death) in deaths.iter().enumerate() {
        let seed = usize::try_from(representatives[leaf])
            .map_err(|_error| OverlayError::LeafPixel { leaf })?;
        if seed >= density.len() || density[seed] <= death {
            return Err(OverlayError::LeafPixel { leaf });
        }
        fill_component(density, grid_size, death, seed, &mut mask);
        let outline = outer_boundary(&mask, grid_size);
        let simplified = simplify_closed(&outline, SIMPLIFY_TOLERANCE_PIXELS);
        mask.fill(false);
        if simplified.len() < 3 {
            continue;
        }
        let vertex_count =
            u32::try_from(simplified.len()).map_err(|_error| OverlayError::CountOverflow)?;
        records.push(ContourRecord {
            leaf: u32::try_from(leaf).map_err(|_error| OverlayError::CountOverflow)?,
            parent: leaf_parent(parents[leaf]),
            vertex_count,
            birth: density_level(births[leaf]),
            death: density_level(death),
        });
        vertices
            .try_reserve_exact(simplified.len())
            .map_err(|_error| OverlayError::Allocation)?;
        for corner in &simplified {
            let canonical = [
                corner_to_canonical(
                    corner[0],
                    grid_size,
                    frame.canonical_minimum[0],
                    frame.canonical_span[0],
                ),
                corner_to_canonical(
                    corner[1],
                    grid_size,
                    frame.canonical_minimum[1],
                    frame.canonical_span[1],
                ),
            ];
            vertices.push(frame.to_world(canonical));
        }
    }
    encode_contour_wire(
        release,
        store_snapshot_identity,
        variant,
        grid_size,
        &records,
        &vertices,
    )
}

/// Aggregates directed semantic k-neighbor edges into undirected
/// region-pair flows and encodes the flow wire.
///
/// Every directed edge whose endpoints resolve to two distinct assigned
/// watershed regions contributes its fuzzy weight to that unordered pair.
/// The wire also carries each region's density-peak world position, parent
/// region, and persistence, so a client can route bundles through the
/// watershed hierarchy without any per-row data.
///
/// # Errors
///
/// Returns an error when required sections are absent or malformed, a
/// neighbor index or region assignment is out of range, or wire counts
/// overflow.
pub(crate) fn encode_flows(
    analytic: ArtifactView<'_>,
    semantic: ArtifactView<'_>,
    base: ArtifactView<'_>,
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
) -> Result<EncodedOverlay, OverlayError> {
    let (_, grid_size) = density_section(analytic)?;
    let point_regions = u32_section(analytic, POINT_REGIONS, "point regions")?;
    let peak_pixels = u64_section(analytic, PEAK_PIXELS, "peak pixels")?;
    let region_parents = u32_section(analytic, REGION_PARENTS, "region parents")?;
    let region_persistence = f64_section(analytic, REGION_PERSISTENCE, "region persistence")?;
    if peak_pixels.len() != region_parents.len() || peak_pixels.len() != region_persistence.len() {
        return Err(OverlayError::SectionShape {
            name: "watershed regions",
        });
    }
    let region_count =
        u32::try_from(peak_pixels.len()).map_err(|_error| OverlayError::CountOverflow)?;
    let indices = u32_section(semantic, SEMANTIC_INDICES, "semantic indices")?;
    let weights = f32_section(semantic, SEMANTIC_WEIGHTS, "semantic weights")?;
    let rows = point_regions.len();
    if indices.len() != weights.len() || (rows > 0 && !indices.len().is_multiple_of(rows)) {
        return Err(OverlayError::SectionShape {
            name: "semantic graph",
        });
    }
    let frame = WorldFrame::from_artifacts(analytic, base)?;

    let mut flows = BTreeMap::<(u32, u32), (f64, u32)>::new();
    let neighbors = indices.len().checked_div(rows).unwrap_or(0);
    for (row, &source_region) in point_regions.iter().enumerate() {
        if source_region == UNASSIGNED_REGION {
            continue;
        }
        if source_region >= region_count {
            return Err(OverlayError::RegionRange { row });
        }
        for slot in 0..neighbors {
            let edge = row * neighbors + slot;
            let neighbor = usize::try_from(indices[edge])
                .map_err(|_error| OverlayError::NeighborRange { row })?;
            let &target_region = point_regions
                .get(neighbor)
                .ok_or(OverlayError::NeighborRange { row })?;
            if target_region == UNASSIGNED_REGION || target_region == source_region {
                continue;
            }
            if target_region >= region_count {
                return Err(OverlayError::RegionRange { row: neighbor });
            }
            let pair = (
                source_region.min(target_region),
                source_region.max(target_region),
            );
            let flow = flows.entry(pair).or_insert((0.0, 0));
            flow.0 += f64::from(weights[edge]);
            flow.1 = flow.1.checked_add(1).ok_or(OverlayError::CountOverflow)?;
        }
    }

    encode_flow_wire(
        release,
        store_snapshot_identity,
        variant,
        frame,
        grid_size,
        peak_pixels,
        region_parents,
        region_persistence,
        &flows,
    )
}

#[derive(Debug, Copy, Clone)]
struct ContourRecord {
    leaf: u32,
    parent: u32,
    vertex_count: u32,
    birth: f32,
    death: f32,
}

const fn leaf_parent(parent: u64) -> u32 {
    if parent > u32::MAX as u64 {
        NO_PARENT
    } else {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the branch above proves the value fits the 32-bit field"
        )]
        {
            parent as u32
        }
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "density levels are styling hints; f32 precision is sufficient"
)]
const fn density_level(value: f64) -> f32 {
    value as f32
}

/// Maps a boundary-corner ordinate onto the canonical axis.
fn corner_to_canonical(corner: f64, grid_size: usize, minimum: f64, span: f64) -> f64 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "the raster grid size is at most 2048 and exactly representable"
    )]
    let normalized = corner / grid_size as f64;
    normalized.mul_add(span, minimum)
}

/// Flood fills the eight-connected component of `density > threshold`.
fn fill_component(density: &[f64], size: usize, threshold: f64, seed: usize, mask: &mut [bool]) {
    let mut stack = vec![seed];
    mask[seed] = true;
    while let Some(pixel) = stack.pop() {
        let row = pixel / size;
        let column = pixel % size;
        for row_offset in -1_isize..=1 {
            for column_offset in -1_isize..=1 {
                if row_offset == 0 && column_offset == 0 {
                    continue;
                }
                let Some(neighbor_row) = row.checked_add_signed(row_offset) else {
                    continue;
                };
                let Some(neighbor_column) = column.checked_add_signed(column_offset) else {
                    continue;
                };
                if neighbor_row >= size || neighbor_column >= size {
                    continue;
                }
                let neighbor = neighbor_row * size + neighbor_column;
                if !mask[neighbor] && density[neighbor] > threshold {
                    mask[neighbor] = true;
                    stack.push(neighbor);
                }
            }
        }
    }
}

/// Traces the outer boundary of a pixel mask as corner coordinates.
///
/// Every mask pixel contributes the sides it shares with unmasked space as
/// directed lattice edges oriented to keep the component on the left, so
/// stitched loops are counterclockwise around the component and clockwise
/// around holes. At checkerboard corners the walk prefers the sharpest left
/// turn, which keeps it hugging the component deterministically. The loop
/// with the largest positive signed area is the outer boundary.
pub(super) fn outer_boundary(mask: &[bool], size: usize) -> Vec<[f64; 2]> {
    let corner_stride = size + 1;
    let mut edges = Vec::<(usize, usize)>::new();
    for (pixel, &inside) in mask.iter().enumerate() {
        if !inside {
            continue;
        }
        let x = pixel / size;
        let y = pixel % size;
        let corner = |cx: usize, cy: usize| cx * corner_stride + cy;
        // Side neighbors outside the mask emit one directed boundary edge
        // each; the orientation convention is derived in the doc comment.
        if y + 1 >= size || !mask[x * size + y + 1] {
            edges.push((corner(x + 1, y + 1), corner(x, y + 1)));
        }
        if y == 0 || !mask[x * size + y - 1] {
            edges.push((corner(x, y), corner(x + 1, y)));
        }
        if x + 1 >= size || !mask[(x + 1) * size + y] {
            edges.push((corner(x + 1, y), corner(x + 1, y + 1)));
        }
        if x == 0 || !mask[(x - 1) * size + y] {
            edges.push((corner(x, y + 1), corner(x, y)));
        }
    }

    let mut outgoing = HashMap::<usize, Vec<usize>>::new();
    for (edge, &(from, _to)) in edges.iter().enumerate() {
        outgoing.entry(from).or_default().push(edge);
    }
    let mut visited = vec![false; edges.len()];
    let mut best_loop = Vec::new();
    let mut best_area = 0_i64;
    for start in 0..edges.len() {
        if visited[start] {
            continue;
        }
        let mut loop_corners = Vec::new();
        let mut edge = start;
        loop {
            visited[edge] = true;
            let (from, to) = edges[edge];
            loop_corners.push(from);
            if to == edges[start].0 {
                break;
            }
            let incoming = direction(from, to, corner_stride);
            let candidates = outgoing
                .get(&to)
                .expect("every stitched corner has an outgoing boundary edge");
            let mut next = None;
            let mut best_turn = i64::MIN;
            for &candidate in candidates {
                if visited[candidate] {
                    continue;
                }
                let outgoing_direction =
                    direction(edges[candidate].0, edges[candidate].1, corner_stride);
                let turn = i64::from(incoming[0]) * i64::from(outgoing_direction[1])
                    - i64::from(incoming[1]) * i64::from(outgoing_direction[0]);
                if turn > best_turn {
                    best_turn = turn;
                    next = Some(candidate);
                }
            }
            let Some(next) = next else {
                break;
            };
            edge = next;
        }
        let area = signed_area(&loop_corners, corner_stride);
        if area > best_area {
            best_area = area;
            best_loop = loop_corners;
        }
    }

    best_loop
        .iter()
        .map(|&corner| corner_point(corner, corner_stride))
        .collect()
}

#[expect(
    clippy::cast_precision_loss,
    reason = "corner ordinates are bounded by the 2048-pixel raster grid"
)]
const fn corner_point(corner: usize, corner_stride: usize) -> [f64; 2] {
    [
        (corner / corner_stride) as f64,
        (corner % corner_stride) as f64,
    ]
}

fn direction(from: usize, to: usize, corner_stride: usize) -> [i8; 2] {
    let from_x = from / corner_stride;
    let from_y = from % corner_stride;
    let to_x = to / corner_stride;
    let to_y = to % corner_stride;
    [
        i8::try_from(to_x.cast_signed() - from_x.cast_signed())
            .expect("boundary edges span exactly one lattice step"),
        i8::try_from(to_y.cast_signed() - from_y.cast_signed())
            .expect("boundary edges span exactly one lattice step"),
    ]
}

fn signed_area(corners: &[usize], corner_stride: usize) -> i64 {
    let mut doubled = 0_i64;
    for (index, &corner) in corners.iter().enumerate() {
        let next = corners[(index + 1) % corners.len()];
        let x0 = i64::try_from(corner / corner_stride).expect("corner ordinate fits i64");
        let y0 = i64::try_from(corner % corner_stride).expect("corner ordinate fits i64");
        let x1 = i64::try_from(next / corner_stride).expect("corner ordinate fits i64");
        let y1 = i64::try_from(next % corner_stride).expect("corner ordinate fits i64");
        doubled += x0 * y1 - x1 * y0;
    }
    doubled
}

/// Simplifies a closed polygon with Douglas-Peucker in raster space.
///
/// The ring splits at its first vertex and the vertex farthest from it, so
/// both anchor points survive and each open chain simplifies independently.
pub(super) fn simplify_closed(ring: &[[f64; 2]], tolerance: f64) -> Vec<[f64; 2]> {
    if ring.len() < 4 {
        return ring.to_vec();
    }
    let anchor = ring
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            distance_squared(ring[0], **left).total_cmp(&distance_squared(ring[0], **right))
        })
        .map_or(ring.len() / 2, |(index, _)| index)
        .max(1);
    let mut simplified = simplify_chain(&ring[..=anchor], tolerance);
    let mut second = Vec::with_capacity(ring.len() + 1 - anchor);
    second.extend_from_slice(&ring[anchor..]);
    second.push(ring[0]);
    let closing = simplify_chain(&second, tolerance);
    simplified.extend_from_slice(&closing[1..closing.len() - 1]);
    simplified
}

fn distance_squared(left: [f64; 2], right: [f64; 2]) -> f64 {
    let dx = left[0] - right[0];
    let dy = left[1] - right[1];
    dx.mul_add(dx, dy * dy)
}

/// Iterative Douglas-Peucker over one open polyline chain.
fn simplify_chain(chain: &[[f64; 2]], tolerance: f64) -> Vec<[f64; 2]> {
    let mut keep = vec![false; chain.len()];
    keep[0] = true;
    keep[chain.len() - 1] = true;
    let mut stack = vec![(0, chain.len() - 1)];
    while let Some((first, last)) = stack.pop() {
        if last <= first + 1 {
            continue;
        }
        let mut farthest = first + 1;
        let mut greatest = -1.0_f64;
        for index in first + 1..last {
            let deviation = point_segment_distance(chain[index], chain[first], chain[last]);
            if deviation > greatest {
                greatest = deviation;
                farthest = index;
            }
        }
        if greatest > tolerance {
            keep[farthest] = true;
            stack.push((first, farthest));
            stack.push((farthest, last));
        }
    }
    chain
        .iter()
        .zip(&keep)
        .filter_map(|(point, &kept)| kept.then_some(*point))
        .collect()
}

fn point_segment_distance(point: [f64; 2], start: [f64; 2], end: [f64; 2]) -> f64 {
    let length_squared = distance_squared(start, end);
    if length_squared <= f64::EPSILON {
        return distance_squared(point, start).sqrt();
    }
    let along = ((point[1] - start[1]).mul_add(
        end[1] - start[1],
        (point[0] - start[0]) * (end[0] - start[0]),
    ) / length_squared)
        .clamp(0.0, 1.0);
    let projection = [
        along.mul_add(end[0] - start[0], start[0]),
        along.mul_add(end[1] - start[1], start[1]),
    ];
    distance_squared(point, projection).sqrt()
}

fn encode_contour_wire(
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
    grid_size: usize,
    records: &[ContourRecord],
    vertices: &[[u16; 2]],
) -> Result<EncodedOverlay, OverlayError> {
    let record_bytes = records
        .len()
        .checked_mul(CONTOUR_RECORD_BYTES)
        .ok_or(OverlayError::CountOverflow)?;
    let vertex_bytes = vertices
        .len()
        .checked_mul(CONTOUR_VERTEX_BYTES)
        .ok_or(OverlayError::CountOverflow)?;
    let body_bytes = record_bytes
        .checked_add(vertex_bytes)
        .ok_or(OverlayError::CountOverflow)?;
    let mut bytes = overlay_header(
        CONTOUR_WIRE_MAGIC,
        release,
        store_snapshot_identity,
        variant,
        [
            u32::try_from(records.len()).map_err(|_error| OverlayError::CountOverflow)?,
            u32::try_from(vertices.len()).map_err(|_error| OverlayError::CountOverflow)?,
            u32::try_from(grid_size).map_err(|_error| OverlayError::CountOverflow)?,
        ],
        body_bytes,
    )?;
    for record in records {
        bytes.extend_from_slice(&record.leaf.to_le_bytes());
        bytes.extend_from_slice(&record.parent.to_le_bytes());
        bytes.extend_from_slice(&record.vertex_count.to_le_bytes());
        bytes.extend_from_slice(&record.birth.to_le_bytes());
        bytes.extend_from_slice(&record.death.to_le_bytes());
    }
    for &[x, y] in vertices {
        bytes.extend_from_slice(&x.to_le_bytes());
        bytes.extend_from_slice(&y.to_le_bytes());
    }
    let content_hash = ContentHash::digest(&bytes);
    Ok(EncodedOverlay {
        bytes,
        content_hash,
    })
}

#[expect(
    clippy::too_many_arguments,
    reason = "the encoder writes exactly the wire fields in wire order"
)]
fn encode_flow_wire(
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
    frame: WorldFrame,
    grid_size: usize,
    peak_pixels: &[u64],
    region_parents: &[u32],
    region_persistence: &[f64],
    flows: &BTreeMap<(u32, u32), (f64, u32)>,
) -> Result<EncodedOverlay, OverlayError> {
    let region_bytes = peak_pixels
        .len()
        .checked_mul(FLOW_REGION_BYTES)
        .ok_or(OverlayError::CountOverflow)?;
    let flow_bytes = flows
        .len()
        .checked_mul(FLOW_RECORD_BYTES)
        .ok_or(OverlayError::CountOverflow)?;
    let body_bytes = region_bytes
        .checked_add(flow_bytes)
        .ok_or(OverlayError::CountOverflow)?;
    let mut bytes = overlay_header(
        FLOW_WIRE_MAGIC,
        release,
        store_snapshot_identity,
        variant,
        [
            u32::try_from(peak_pixels.len()).map_err(|_error| OverlayError::CountOverflow)?,
            u32::try_from(flows.len()).map_err(|_error| OverlayError::CountOverflow)?,
            u32::try_from(grid_size).map_err(|_error| OverlayError::CountOverflow)?,
        ],
        body_bytes,
    )?;
    for (region, &pixel) in peak_pixels.iter().enumerate() {
        let pixel = usize::try_from(pixel)
            .ok()
            .filter(|&pixel| pixel < grid_size * grid_size)
            .ok_or(OverlayError::RegionPixel { region })?;
        #[expect(
            clippy::cast_precision_loss,
            reason = "pixel ordinates are bounded by the 2048-pixel raster grid"
        )]
        let canonical = [
            corner_to_canonical(
                (pixel / grid_size) as f64 + 0.5,
                grid_size,
                frame.canonical_minimum[0],
                frame.canonical_span[0],
            ),
            corner_to_canonical(
                (pixel % grid_size) as f64 + 0.5,
                grid_size,
                frame.canonical_minimum[1],
                frame.canonical_span[1],
            ),
        ];
        let [x, y] = frame.to_world(canonical);
        bytes.extend_from_slice(&x.to_le_bytes());
        bytes.extend_from_slice(&y.to_le_bytes());
        bytes.extend_from_slice(&region_parents[region].to_le_bytes());
        bytes.extend_from_slice(&density_level(region_persistence[region]).to_le_bytes());
    }
    for (&(source, target), &(weight, edge_count)) in flows {
        bytes.extend_from_slice(&source.to_le_bytes());
        bytes.extend_from_slice(&target.to_le_bytes());
        bytes.extend_from_slice(&density_level(weight).to_le_bytes());
        bytes.extend_from_slice(&edge_count.to_le_bytes());
    }
    let content_hash = ContentHash::digest(&bytes);
    Ok(EncodedOverlay {
        bytes,
        content_hash,
    })
}

/// Writes the shared 160-byte overlay header.
///
/// Identity hashes sit at the same offsets as the tile wire so one client
/// helper validates provenance for tiles and overlays alike.
fn overlay_header(
    magic: [u8; 8],
    release: ActiveRelease,
    store_snapshot_identity: ContentHash,
    variant: VariantId,
    counts: [u32; 3],
    body_bytes: usize,
) -> Result<Vec<u8>, OverlayError> {
    let total_bytes = OVERLAY_WIRE_HEADER_BYTES
        .checked_add(body_bytes)
        .ok_or(OverlayError::CountOverflow)?;
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(total_bytes)
        .map_err(|_error| OverlayError::Allocation)?;
    bytes.extend_from_slice(&magic);
    bytes.extend_from_slice(&OVERLAY_WIRE_VERSION.to_le_bytes());
    bytes.extend_from_slice(
        &u16::try_from(OVERLAY_WIRE_HEADER_BYTES)
            .expect("overlay header length fits u16")
            .to_le_bytes(),
    );
    bytes.extend_from_slice(&variant.get().to_le_bytes());
    bytes.extend_from_slice(&0_u16.to_le_bytes());
    for count in counts {
        bytes.extend_from_slice(&count.to_le_bytes());
    }
    bytes.extend_from_slice(&0_u32.to_le_bytes());
    let active = release.head();
    bytes.extend_from_slice(active.generation.content_hash().as_bytes());
    bytes.extend_from_slice(store_snapshot_identity.as_bytes());
    bytes.extend_from_slice(active.manifest.as_bytes());
    bytes.extend_from_slice(release.report().as_bytes());
    debug_assert_eq!(bytes.len(), OVERLAY_WIRE_HEADER_BYTES);
    Ok(bytes)
}

fn density_section(analytic: ArtifactView<'_>) -> Result<(&[f64], usize), OverlayError> {
    let section = analytic
        .section(ANALYTIC_DENSITY)
        .ok_or(OverlayError::MissingSection {
            name: "analytic density",
        })?;
    let shape = section.descriptor.shape;
    let values = section
        .as_f64()
        .map_err(|_error| OverlayError::SectionType {
            name: "analytic density",
        })?;
    let grid_size = usize::try_from(shape[0]).map_err(|_error| OverlayError::SectionShape {
        name: "analytic density",
    })?;
    if shape[0] != shape[1]
        || grid_size
            .checked_mul(grid_size)
            .is_none_or(|area| area != values.len())
    {
        return Err(OverlayError::SectionShape {
            name: "analytic density",
        });
    }
    Ok((values, grid_size))
}

fn u32_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: crate::salt::storage::mmap::SectionId,
    name: &'static str,
) -> Result<&'artifact [u32], OverlayError> {
    artifact
        .section(id)
        .ok_or(OverlayError::MissingSection { name })?
        .as_u32()
        .map_err(|_error| OverlayError::SectionType { name })
}

fn u64_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: crate::salt::storage::mmap::SectionId,
    name: &'static str,
) -> Result<&'artifact [u64], OverlayError> {
    artifact
        .section(id)
        .ok_or(OverlayError::MissingSection { name })?
        .as_u64()
        .map_err(|_error| OverlayError::SectionType { name })
}

fn f32_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: crate::salt::storage::mmap::SectionId,
    name: &'static str,
) -> Result<&'artifact [f32], OverlayError> {
    artifact
        .section(id)
        .ok_or(OverlayError::MissingSection { name })?
        .as_f32()
        .map_err(|_error| OverlayError::SectionType { name })
}

fn f64_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: crate::salt::storage::mmap::SectionId,
    name: &'static str,
) -> Result<&'artifact [f64], OverlayError> {
    artifact
        .section(id)
        .ok_or(OverlayError::MissingSection { name })?
        .as_f64()
        .map_err(|_error| OverlayError::SectionType { name })
}

/// Overlay materialization failures.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum OverlayError {
    /// A required artifact section is absent.
    MissingSection { name: &'static str },
    /// A required artifact section has the wrong scalar type.
    SectionType { name: &'static str },
    /// A required artifact section has inconsistent dimensions.
    SectionShape { name: &'static str },
    /// A merge-tree leaf references an impossible representative pixel.
    LeafPixel { leaf: usize },
    /// A watershed region references a pixel outside the raster.
    RegionPixel { region: usize },
    /// A point-region assignment names a region outside the watershed.
    RegionRange { row: usize },
    /// A semantic edge references a row outside the generation.
    NeighborRange { row: usize },
    /// A wire count exceeds its fixed-width field.
    CountOverflow,
    /// Response allocation failed.
    Allocation,
}

impl fmt::Display for OverlayError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingSection { name } => {
                write!(formatter, "overlay source is missing the {name} section")
            }
            Self::SectionType { name } => {
                write!(
                    formatter,
                    "overlay {name} section has the wrong scalar type"
                )
            }
            Self::SectionShape { name } => {
                write!(formatter, "overlay {name} section shape is inconsistent")
            }
            Self::LeafPixel { leaf } => write!(
                formatter,
                "merge-tree leaf {leaf} references an impossible representative pixel"
            ),
            Self::RegionPixel { region } => write!(
                formatter,
                "watershed region {region} references a pixel outside the raster"
            ),
            Self::RegionRange { row } => write!(
                formatter,
                "point {row} is assigned to a region outside the watershed"
            ),
            Self::NeighborRange { row } => write!(
                formatter,
                "a semantic edge of row {row} references a row outside the generation"
            ),
            Self::CountOverflow => formatter.write_str("overlay counts exceed wire limits"),
            Self::Allocation => formatter.write_str("overlay response allocation failed"),
        }
    }
}

impl Error for OverlayError {}
