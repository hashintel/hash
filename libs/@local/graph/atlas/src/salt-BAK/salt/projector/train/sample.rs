use core::ops::Range;
use std::collections::{HashMap, HashSet};

use rand::Rng;

use super::ProjectorSamplingError;
use crate::salt::{
    graph::{KnnTable, SemanticEdgeWeights},
    identity::GenerationRowId,
    relation::{AttractionEdge, PairProtection, RelationPair},
};

/// One host-side endpoint pair ready for tensor batch assembly.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SampledEdge {
    pub left: GenerationRowId,
    pub right: GenerationRowId,
    pub weight: f64,
}

/// Samples unique directed semantic-positive edges without corpus-sized state.
///
/// # Errors
///
/// This returns an error when the graph is empty or the requested count
/// exceeds its directed edge count.
pub(crate) fn sample_semantic_edges(
    graph: &KnnTable,
    weights: &SemanticEdgeWeights,
    requested: usize,
    rng: &mut impl Rng,
) -> Result<Vec<SampledEdge>, ProjectorSamplingError> {
    let available = graph.rows().checked_mul(graph.neighbors()).ok_or(
        ProjectorSamplingError::TooManyPositiveEdges {
            requested,
            available: usize::MAX,
        },
    )?;
    if available == 0 {
        return Err(ProjectorSamplingError::EmptyGraph);
    }
    if requested > available {
        return Err(ProjectorSamplingError::TooManyPositiveEdges {
            requested,
            available,
        });
    }
    let mut replacements = HashMap::with_capacity(requested);
    let mut sampled = Vec::with_capacity(requested);
    for draw in 0..requested {
        let remaining = available - draw;
        let selected = random_below(rng, remaining);
        let flat = replacements.remove(&selected).unwrap_or(selected);
        let last = replacements
            .remove(&(remaining - 1))
            .unwrap_or(remaining - 1);
        if selected != remaining - 1 {
            replacements.insert(selected, last);
        }
        let row = flat / graph.neighbors();
        let offset = flat % graph.neighbors();
        sampled.push(SampledEdge {
            left: row_id(row),
            right: GenerationRowId::from_u32(graph.indices(row)[offset])
                .expect("validated graph rows should fit generation IDs"),
            weight: f64::from(weights.as_slice()[flat]),
        });
    }
    Ok(sampled)
}

/// Pre-indexed relation-type ranges for bounded per-step sampling.
pub(crate) struct RelationEdgeSampler<'edge> {
    edges: &'edge [AttractionEdge],
    groups: Vec<Range<usize>>,
}

impl<'edge> RelationEdgeSampler<'edge> {
    /// Indexes attraction edges already grouped by relation type.
    ///
    /// # Errors
    ///
    /// This returns an error when a relation type reappears after a later type.
    pub(crate) fn new(edges: &'edge [AttractionEdge]) -> Result<Self, ProjectorSamplingError> {
        if !edges.is_sorted_by(|left, right| left.relation <= right.relation) {
            return Err(ProjectorSamplingError::UnorderedRelationEdges);
        }
        let mut groups = Vec::new();
        let mut start = 0;
        while start < edges.len() {
            let relation = edges[start].relation;
            let length = edges[start..].partition_point(|edge| edge.relation == relation);
            groups.push(start..start + length);
            start += length;
        }
        Ok(Self { edges, groups })
    }

    /// Uniformly samples relation types and then edges within each type.
    ///
    /// Parallel links remain independent candidates. Per-step work and memory
    /// are bounded by the selected type count and edge cap.
    pub(crate) fn sample(
        &self,
        type_count: usize,
        per_type: usize,
        rng: &mut impl Rng,
    ) -> Vec<AttractionEdge> {
        if type_count == 0 || per_type == 0 {
            return Vec::new();
        }
        let selected_groups = sample_indices(self.groups.len(), type_count, rng);
        let mut sampled = Vec::with_capacity(selected_groups.len().saturating_mul(per_type));
        for group in selected_groups {
            let range = &self.groups[group];
            for offset in sample_indices(range.len(), per_type, rng) {
                sampled.push(self.edges[range.start + offset]);
            }
        }
        sampled
    }
}

/// Validated ordinary-negative admission index.
pub(crate) struct OrdinaryNegativeSampler<'index> {
    graph: &'index KnnTable,
    protection: &'index [PairProtection],
}

impl<'index> OrdinaryNegativeSampler<'index> {
    /// Binds a graph to its strictly ordered protection pairs.
    ///
    /// # Errors
    ///
    /// This returns an error when protection pairs are not strictly ordered.
    pub(crate) fn new(
        graph: &'index KnnTable,
        protection: &'index [PairProtection],
    ) -> Result<Self, ProjectorSamplingError> {
        if !protection.is_sorted_by(|left, right| left.pair < right.pair) {
            return Err(ProjectorSamplingError::UnorderedProtection);
        }
        Ok(Self { graph, protection })
    }

    /// Samples distinct ordinary negatives under semantic and relation vetoes.
    ///
    /// # Errors
    ///
    /// This returns an error when fewer than two graph rows exist, weight is
    /// invalid, or the admissible pair pool cannot fill the batch.
    pub(crate) fn sample(
        &self,
        requested: usize,
        weight: f64,
        rng: &mut impl Rng,
    ) -> Result<Vec<SampledEdge>, ProjectorSamplingError> {
        if self.graph.rows() < 2 {
            return Err(ProjectorSamplingError::EmptyGraph);
        }
        if !weight.is_finite() || weight.is_sign_negative() {
            return Err(ProjectorSamplingError::InvalidNegativeWeight);
        }
        let maximum_attempts = requested.saturating_mul(128).saturating_add(1_024);
        let mut seen = HashSet::with_capacity(requested);
        let mut sampled = Vec::with_capacity(requested);
        for _ in 0..maximum_attempts {
            if sampled.len() == requested {
                return Ok(sampled);
            }
            let left = random_below(rng, self.graph.rows());
            let right = random_below(rng, self.graph.rows());
            if left == right || is_semantic_pair(self.graph, left, right) {
                continue;
            }
            let pair = RelationPair::new(row_id(left), row_id(right));
            if !seen.insert(pair) || ordinary_protected(self.protection, pair) {
                continue;
            }
            sampled.push(SampledEdge {
                left: row_id(left),
                right: row_id(right),
                weight,
            });
        }
        for left in 0..self.graph.rows() {
            for right in (left + 1)..self.graph.rows() {
                if sampled.len() == requested {
                    return Ok(sampled);
                }
                if is_semantic_pair(self.graph, left, right) {
                    continue;
                }
                let pair = RelationPair::new(row_id(left), row_id(right));
                if !seen.insert(pair) || ordinary_protected(self.protection, pair) {
                    continue;
                }
                sampled.push(SampledEdge {
                    left: row_id(left),
                    right: row_id(right),
                    weight,
                });
                if sampled.len() == requested {
                    return Ok(sampled);
                }
            }
        }
        Err(ProjectorSamplingError::NegativePoolExhausted {
            requested,
            produced: sampled.len(),
        })
    }
}

#[inline]
fn is_semantic_pair(graph: &KnnTable, left: usize, right: usize) -> bool {
    let left_u32 = u32::try_from(left).expect("graph row should fit u32");
    let right_u32 = u32::try_from(right).expect("graph row should fit u32");
    graph.indices(left).contains(&right_u32) || graph.indices(right).contains(&left_u32)
}

#[inline]
fn ordinary_protected(protection: &[PairProtection], pair: RelationPair) -> bool {
    protection
        .binary_search_by_key(&pair, |entry| entry.pair)
        .is_ok_and(|index| protection[index].ordinary)
}

#[inline]
fn row_id(row: usize) -> GenerationRowId {
    GenerationRowId::try_from(row).expect("validated graph row count should fit generation IDs")
}

fn sample_indices(available: usize, requested: usize, rng: &mut impl Rng) -> Vec<usize> {
    let count = requested.min(available);
    let mut replacements = HashMap::with_capacity(count);
    let mut sampled = Vec::with_capacity(count);
    for draw in 0..count {
        let remaining = available - draw;
        let selected = random_below(rng, remaining);
        let index = replacements.remove(&selected).unwrap_or(selected);
        let last = replacements
            .remove(&(remaining - 1))
            .unwrap_or(remaining - 1);
        if selected != remaining - 1 {
            replacements.insert(selected, last);
        }
        sampled.push(index);
    }
    sampled
}

fn random_below(rng: &mut impl Rng, upper: usize) -> usize {
    let upper = u64::try_from(upper).expect("usize should fit u64");
    let zone = u64::MAX - u64::MAX % upper;
    loop {
        let value = rng.next_u64();
        if value < zone {
            return usize::try_from(value % upper).expect("sample should fit usize");
        }
    }
}
