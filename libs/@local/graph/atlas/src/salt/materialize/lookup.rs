//! Reverse spatial lookup from canvas coordinates to generation identities.
//!
//! [`SpatialIndex`] is a derived, in-memory k-d tree over one canonical base
//! artifact. It answers "which entity sits at these coordinates" and "which
//! entities lie within this radius" in the same quantized 16-bit grid space
//! the tile wire delivers, so a canvas client can translate a pick or brush
//! directly from tile records without knowing the canonical extent.
//!
//! The index is reproducible from the immutable base artifact alone and is
//! therefore never persisted or hashed: activation rebuilds it beside the
//! mapped generation, and every hit carries the durable graph [`EntityId`]
//! resolved through the artifact's identity sections.

use core::{error::Error, fmt, num::NonZeroUsize};

use kiddo::{SquaredEuclidean, immutable::float::kdtree::ImmutableKdTree};
use type_system::{
    knowledge::entity::id::{DraftId, EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::{
    MortonKey,
    base::{
        BUCKETS, COORDINATES, DRAFT_IDS, DRAFT_PRESENT, ENTITY_UUIDS, MORTON_KEYS, ROWS, WEB_IDS,
    },
};
use crate::salt::storage::mmap::{ArtifactView, SectionId};

/// Maximum hits accepted for one lookup response.
pub(crate) const MAXIMUM_LOOKUP_HITS: usize = 4_096;

/// Exclusive upper bound of the quantized lookup grid on each axis.
const GRID_AXIS_CELLS: f32 = 65_536.0;

/// One validated point-or-radius lookup in quantized grid space.
///
/// Coordinates use the tile wire's 16-bit axes: `x` and `y` lie in
/// `[0, 65536)`, where one unit is one quantization cell. A request without a
/// radius asks for the `limit` nearest points; a request with a radius asks
/// for at most `limit` points inside it, nearest first.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LookupRequest {
    point: [f32; 2],
    radius: Option<f32>,
    limit: NonZeroUsize,
}

impl LookupRequest {
    /// Validates one grid-space query point, optional radius, and hit budget.
    ///
    /// # Errors
    ///
    /// Returns an error when a coordinate is non-finite or outside the
    /// quantized grid, the radius is non-finite or not positive, or the hit
    /// budget exceeds [`MAXIMUM_LOOKUP_HITS`].
    pub(crate) fn new(
        x: f32,
        y: f32,
        radius: Option<f32>,
        limit: NonZeroUsize,
    ) -> Result<Self, LookupError> {
        for (axis, value) in [x, y].into_iter().enumerate() {
            if !value.is_finite() || value < 0.0 || value >= GRID_AXIS_CELLS {
                return Err(LookupError::Coordinate { axis, value });
            }
        }
        if let Some(radius) = radius
            && (!radius.is_finite() || radius <= 0.0)
        {
            return Err(LookupError::Radius { radius });
        }
        if limit.get() > MAXIMUM_LOOKUP_HITS {
            return Err(LookupError::HitLimit {
                requested: limit.get(),
                maximum: MAXIMUM_LOOKUP_HITS,
            });
        }
        Ok(Self {
            point: [x, y],
            radius,
            limit,
        })
    }
}

/// One resolved point returned by a spatial lookup.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpatialHit {
    /// Durable graph identity of the point.
    pub entity_id: EntityId,
    /// Generation-stable row identity, matching tile-wire records.
    pub row: u32,
    /// Quantized grid coordinates, matching tile-wire record axes.
    pub grid: [f32; 2],
    /// Canonical coordinates persisted for the generation.
    pub canonical: [f32; 2],
    /// Euclidean distance from the query point in grid units.
    pub distance: f32,
    /// Importance rung of the point's delivery bucket.
    pub bucket: u16,
}

/// Derived nearest-neighbour index over one canonical base artifact.
///
/// Positions live in the quantized grid space recovered from the persisted
/// Morton keys, so query results agree bit-for-bit with the coordinates a
/// tile client already holds. Identity, bucket, and canonical-coordinate
/// columns are copied out of the artifact during construction; the index
/// owns everything it needs and outlives the borrowed view.
pub(crate) struct SpatialIndex {
    tree: ImmutableKdTree<f32, u32, 2, 32>,
    positions: Vec<[f32; 2]>,
    canonical: Vec<[f32; 2]>,
    rows: Vec<u32>,
    buckets: Vec<u16>,
    entities: Vec<EntityId>,
}

impl SpatialIndex {
    /// Builds the index from one verified canonical base artifact.
    ///
    /// Construction is `O(n log n)` and copies identity and coordinate
    /// columns; queries afterwards touch only owned memory.
    ///
    /// # Errors
    ///
    /// Returns an error when a required base section is missing, has the
    /// wrong scalar type, or the sections do not describe one consistent
    /// row permutation.
    pub(crate) fn build(artifact: ArtifactView<'_>) -> Result<Self, LookupError> {
        let rows = u32_section(artifact, ROWS, "rows")?;
        let morton = u32_section(artifact, MORTON_KEYS, "morton keys")?;
        let buckets = u32_section(artifact, BUCKETS, "buckets")?;
        let coordinates = f32_section(artifact, COORDINATES, "coordinates")?;
        let web_ids = u8_section(artifact, WEB_IDS, "web ids")?;
        let entity_uuids = u8_section(artifact, ENTITY_UUIDS, "entity uuids")?;
        let draft_present = u8_section(artifact, DRAFT_PRESENT, "draft flags")?;
        let draft_ids = u8_section(artifact, DRAFT_IDS, "draft ids")?;

        let count = rows.len();
        if count == 0 {
            return Err(LookupError::Empty);
        }
        if morton.len() != count
            || buckets.len() != count
            || coordinates.len() != count * 2
            || web_ids.len() != count * 16
            || entity_uuids.len() != count * 16
            || draft_present.len() != count
            || draft_ids.len() != count * 16
        {
            return Err(LookupError::SectionRows);
        }

        let mut positions = Vec::with_capacity(count);
        for &key in morton {
            let [x, y] = MortonKey::from_u32(key).coordinates();
            positions.push([f32::from(x), f32::from(y)]);
        }
        let canonical = coordinates.as_chunks::<2>().0.to_vec();
        let mut narrow_buckets = Vec::with_capacity(count);
        for &bucket in buckets {
            narrow_buckets
                .push(u16::try_from(bucket).map_err(|_error| LookupError::Bucket { bucket })?);
        }
        let entities = decode_identities(rows, web_ids, entity_uuids, draft_present, draft_ids)?;
        let tree = ImmutableKdTree::new_from_slice(&positions);
        Ok(Self {
            tree,
            positions,
            canonical,
            rows: rows.to_vec(),
            buckets: narrow_buckets,
            entities,
        })
    }

    /// Returns the number of indexed points.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> usize {
        self.positions.len()
    }

    /// Resolves one lookup to its nearest-first hit list.
    ///
    /// Without a radius the response contains exactly
    /// `min(limit, len)` nearest points; with a radius it contains the up to
    /// `limit` nearest points whose grid distance does not exceed it.
    #[must_use]
    pub(crate) fn query(&self, request: LookupRequest) -> Vec<SpatialHit> {
        let limit = NonZeroUsize::new(request.limit.get().min(self.len()))
            .expect("construction rejected empty indexes");
        let neighbours = request.radius.map_or_else(
            || {
                self.tree
                    .nearest_n::<SquaredEuclidean>(&request.point, limit)
            },
            |radius| {
                self.tree.nearest_n_within::<SquaredEuclidean>(
                    &request.point,
                    radius * radius,
                    limit,
                    true,
                )
            },
        );
        neighbours
            .into_iter()
            .map(|neighbour| {
                let ordinal = neighbour.item as usize;
                SpatialHit {
                    entity_id: self.entities[ordinal],
                    row: self.rows[ordinal],
                    grid: self.positions[ordinal],
                    canonical: self.canonical[ordinal],
                    distance: neighbour.distance.sqrt(),
                    bucket: self.buckets[ordinal],
                }
            })
            .collect()
    }
}

/// Resolves every delivery record's generation row to its graph identity.
///
/// Identity sections are stored in generation-row order while delivery
/// sections are permuted, so each record indexes the identity sections by its
/// row value.
fn decode_identities(
    rows: &[u32],
    web_ids: &[u8],
    entity_uuids: &[u8],
    draft_present: &[u8],
    draft_ids: &[u8],
) -> Result<Vec<EntityId>, LookupError> {
    let count = rows.len();
    let mut entities = Vec::with_capacity(count);
    for &row in rows {
        let index = row as usize;
        if index >= count {
            return Err(LookupError::UnknownRow { row });
        }
        let web_id = uuid_at(web_ids, index);
        let entity_uuid = uuid_at(entity_uuids, index);
        let draft_id = (draft_present[index] != 0).then(|| DraftId::new(uuid_at(draft_ids, index)));
        entities.push(EntityId {
            web_id: WebId::new(web_id),
            entity_uuid: EntityUuid::new(entity_uuid),
            draft_id,
        });
    }
    Ok(entities)
}

const fn uuid_at(bytes: &[u8], index: usize) -> Uuid {
    let mut raw = [0_u8; 16];
    let mut offset = 0;
    while offset < 16 {
        raw[offset] = bytes[index * 16 + offset];
        offset += 1;
    }
    Uuid::from_bytes(raw)
}

fn u32_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: SectionId,
    name: &'static str,
) -> Result<&'artifact [u32], LookupError> {
    artifact
        .section(id)
        .ok_or(LookupError::MissingSection { name })?
        .as_u32()
        .map_err(|_error| LookupError::SectionType { name })
}

fn f32_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: SectionId,
    name: &'static str,
) -> Result<&'artifact [f32], LookupError> {
    artifact
        .section(id)
        .ok_or(LookupError::MissingSection { name })?
        .as_f32()
        .map_err(|_error| LookupError::SectionType { name })
}

fn u8_section<'artifact>(
    artifact: ArtifactView<'artifact>,
    id: SectionId,
    name: &'static str,
) -> Result<&'artifact [u8], LookupError> {
    artifact
        .section(id)
        .ok_or(LookupError::MissingSection { name })?
        .as_u8()
        .map_err(|_error| LookupError::SectionType { name })
}

/// Invalid lookup request or inconsistent verified base artifact.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum LookupError {
    Coordinate { axis: usize, value: f32 },
    Radius { radius: f32 },
    HitLimit { requested: usize, maximum: usize },
    MissingSection { name: &'static str },
    SectionType { name: &'static str },
    SectionRows,
    UnknownRow { row: u32 },
    Bucket { bucket: u32 },
    Empty,
}

impl fmt::Display for LookupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Coordinate { axis, value } => write!(
                formatter,
                "lookup coordinate {value} on axis {axis} is outside the [0, 65536) grid"
            ),
            Self::Radius { radius } => {
                write!(formatter, "lookup radius {radius} is not a positive length")
            }
            Self::HitLimit { requested, maximum } => write!(
                formatter,
                "lookup hit limit {requested} exceeds the maximum {maximum}"
            ),
            Self::MissingSection { name } => {
                write!(formatter, "canonical base is missing its {name} section")
            }
            Self::SectionType { name } => write!(
                formatter,
                "canonical base {name} section has the wrong scalar type"
            ),
            Self::SectionRows => {
                formatter.write_str("canonical base sections disagree about the row count")
            }
            Self::UnknownRow { row } => write!(
                formatter,
                "canonical base delivery row {row} is outside the identity directory"
            ),
            Self::Bucket { bucket } => write!(
                formatter,
                "canonical base delivery bucket {bucket} exceeds the u16 rung encoding"
            ),
            Self::Empty => formatter.write_str("canonical base contains no rows"),
        }
    }
}

impl Error for LookupError {}
