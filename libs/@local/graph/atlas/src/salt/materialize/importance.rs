use std::collections::HashSet;

use type_system::knowledge::entity::id::EntityId;
use uuid::Uuid;

use super::{MortonKey, error::ImportanceError};
use crate::salt::{hash::ContentHasher, identity::GenerationRowId};

/// Finite coordinate bounds used for grid and Morton quantization.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CoordinateBounds {
    minimum: [f64; 2],
    maximum: [f64; 2],
}

impl CoordinateBounds {
    /// Validates an axis-aligned coordinate extent.
    ///
    /// # Errors
    ///
    /// This returns an error when an endpoint is non-finite or an axis has
    /// zero or negative extent.
    pub(crate) fn new(minimum: [f64; 2], maximum: [f64; 2]) -> Result<Self, ImportanceError> {
        for axis in 0..2 {
            if !minimum[axis].is_finite() || !maximum[axis].is_finite() {
                return Err(ImportanceError::NonFiniteBounds { axis });
            }
            if minimum[axis] >= maximum[axis] {
                return Err(ImportanceError::DegenerateBounds { axis });
            }
            if !(maximum[axis] - minimum[axis]).is_finite() {
                return Err(ImportanceError::NonFiniteBounds { axis });
            }
        }
        Ok(Self { minimum, maximum })
    }

    #[must_use]
    #[inline]
    pub(crate) const fn minimum(self) -> [f64; 2] {
        self.minimum
    }

    #[must_use]
    #[inline]
    pub(crate) const fn maximum(self) -> [f64; 2] {
        self.maximum
    }

    #[inline]
    fn quantize(self, coordinate: [f64; 2], row: usize) -> Result<[u16; 2], ImportanceError> {
        let mut quantized = [0; 2];
        for axis in 0..2 {
            let value = coordinate[axis];
            if !value.is_finite() {
                return Err(ImportanceError::NonFiniteCoordinate { row, axis, value });
            }
            if value < self.minimum[axis] || value > self.maximum[axis] {
                return Err(ImportanceError::CoordinateOutOfBounds { row, axis, value });
            }
            let normalized =
                (value - self.minimum[axis]) / (self.maximum[axis] - self.minimum[axis]);
            quantized[axis] = quantize_axis(normalized);
        }
        Ok(quantized)
    }
}

/// Versioned inputs to deterministic first-occupant ranking.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ImportanceConfig<'config> {
    /// Strictly increasing grid depths in bits per axis.
    pub grid_depths: &'config [u8],
    /// Seed for the entity-identity tie breaker.
    pub hash_seed: u64,
    /// Coordinate quantization extent.
    pub bounds: CoordinateBounds,
}

/// One point and its stable ranking signals.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ImportanceInput<'entity> {
    pub row: GenerationRowId,
    pub entity_id: &'entity EntityId,
    pub coordinate: [f64; 2],
    pub importance: f64,
    pub semantic_priority: f64,
}

/// Delivery index fields for one generation row.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RankedPoint {
    pub row: GenerationRowId,
    pub bucket: u16,
    pub morton: MortonKey,
    pub priority_rank: u32,
}

#[derive(Debug, Copy, Clone)]
struct Candidate {
    row: GenerationRowId,
    importance: f64,
    semantic_priority: f64,
    tie_breaker: u64,
    morton: MortonKey,
}

/// Assigns deterministic first-occupant buckets and Morton keys.
///
/// Points are ordered lexicographically by descending importance, descending
/// semantic priority, a versioned entity-identity hash, and generation row.
/// For each configured grid depth, the highest-priority unassigned point in
/// every previously unrepresented occupied cell enters that bucket. Points
/// sharing a maximum-depth cell enter one final overflow bucket in priority
/// order, so every input appears exactly once.
///
/// # Errors
///
/// This returns an error when inputs are empty, rows repeat, priorities or
/// coordinates are non-finite, coordinates leave `config.bounds`, or grid
/// depths are not strictly increasing values in `0..=16`.
pub(crate) fn rank_importance(
    inputs: &[ImportanceInput<'_>],
    config: ImportanceConfig<'_>,
) -> Result<Vec<RankedPoint>, ImportanceError> {
    validate_schedule(config.grid_depths)?;
    if inputs.is_empty() {
        return Err(ImportanceError::Empty);
    }
    let overflow_bucket =
        u16::try_from(config.grid_depths.len()).map_err(|_| ImportanceError::BucketOverflow {
            buckets: config.grid_depths.len() + 1,
        })?;

    let mut seen_rows = HashSet::with_capacity(inputs.len());
    let mut candidates = Vec::with_capacity(inputs.len());
    for (index, input) in inputs.iter().enumerate() {
        if !seen_rows.insert(input.row) {
            return Err(ImportanceError::DuplicateRow {
                row: input.row.as_u32(),
            });
        }
        if !input.importance.is_finite() || !input.semantic_priority.is_finite() {
            return Err(ImportanceError::NonFinitePriority {
                row: index,
                importance: input.importance,
                semantic: input.semantic_priority,
            });
        }
        let [x, y] = config.bounds.quantize(input.coordinate, index)?;
        candidates.push(Candidate {
            row: input.row,
            importance: input.importance,
            semantic_priority: input.semantic_priority,
            tie_breaker: identity_tie_breaker(input.entity_id, config.hash_seed),
            morton: MortonKey::new(x, y),
        });
    }
    candidates.sort_unstable_by(|left, right| {
        right
            .importance
            .total_cmp(&left.importance)
            .then_with(|| right.semantic_priority.total_cmp(&left.semantic_priority))
            .then_with(|| left.tie_breaker.cmp(&right.tie_breaker))
            .then_with(|| left.row.cmp(&right.row))
    });

    let mut assigned = vec![false; candidates.len()];
    let mut ranked = Vec::with_capacity(candidates.len());
    for (bucket, &depth) in config.grid_depths.iter().enumerate() {
        let mut occupied = HashSet::with_capacity(ranked.len());
        for (index, candidate) in candidates.iter().enumerate() {
            if assigned[index] {
                occupied.insert(candidate.morton.prefix(depth));
            }
        }
        for (priority_rank, candidate) in candidates.iter().enumerate() {
            if !assigned[priority_rank] && occupied.insert(candidate.morton.prefix(depth)) {
                assigned[priority_rank] = true;
                ranked.push(RankedPoint {
                    row: candidate.row,
                    bucket: bucket as u16,
                    morton: candidate.morton,
                    priority_rank: priority_rank_u32(priority_rank),
                });
            }
        }
    }
    for (priority_rank, (candidate, assigned)) in candidates.iter().zip(assigned).enumerate() {
        if !assigned {
            ranked.push(RankedPoint {
                row: candidate.row,
                bucket: overflow_bucket,
                morton: candidate.morton,
                priority_rank: priority_rank_u32(priority_rank),
            });
        }
    }
    Ok(ranked)
}

fn validate_schedule(depths: &[u8]) -> Result<(), ImportanceError> {
    if depths.is_empty() {
        return Err(ImportanceError::EmptyGridSchedule);
    }
    let mut previous = None;
    for (index, &depth) in depths.iter().enumerate() {
        if depth > 16 {
            return Err(ImportanceError::InvalidGridDepth { index, depth });
        }
        if let Some(previous) = previous
            && depth <= previous
        {
            return Err(ImportanceError::UnorderedGridDepth {
                index,
                previous,
                depth,
            });
        }
        previous = Some(depth);
    }
    Ok(())
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the normalized axis is validated within the closed unit interval"
)]
#[inline]
fn quantize_axis(normalized: f64) -> u16 {
    (normalized * 65_536.0).floor().min(f64::from(u16::MAX)) as u16
}

#[inline]
fn priority_rank_u32(rank: usize) -> u32 {
    u32::try_from(rank).expect("generation rows already require the corpus to fit u32")
}

fn identity_tie_breaker(entity_id: &EntityId, seed: u64) -> u64 {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.importance-tie.v1");
    hasher.update(&seed.to_le_bytes());
    let web_id: Uuid = entity_id.web_id.into();
    let entity_uuid: Uuid = entity_id.entity_uuid.into();
    hasher.update(web_id.as_bytes());
    hasher.update(entity_uuid.as_bytes());
    match entity_id.draft_id {
        Some(draft_id) => {
            hasher.update(&[1]);
            let draft_id: Uuid = draft_id.into();
            hasher.update(draft_id.as_bytes());
        }
        None => hasher.update(&[0]),
    }
    let hash = hasher.finish();
    u64::from_be_bytes(
        hash.as_bytes()[..8]
            .try_into()
            .expect("SHA-256 always contains eight prefix bytes"),
    )
}
