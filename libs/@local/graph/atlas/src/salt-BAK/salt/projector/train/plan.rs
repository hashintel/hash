#![expect(
    clippy::little_endian_bytes,
    reason = "projector plan identities use canonical little-endian scalar encodings"
)]

use core::{num::NonZeroUsize, ops::Range};
use std::{collections::HashSet, time::Instant};

use burn::{module::AutodiffModule as _, tensor::backend::AutodiffBackend};
use rand::Rng;
use rand_xoshiro::{Xoshiro256PlusPlus, rand_core::SeedableRng as _};

use super::{
    CoordinateSupportRow, HardNegativeConfig, HardNegativeMiner, OrdinaryNegativeSampler,
    ProjectorBatchSource, ProjectorFitError, ProjectorTrainingBatch, RelationEdgeSampler,
    TypeContextDropout, USearchSpatialIndex, assemble::valid_type_context_dropout_probability,
    prepare_projector_batch, sample_semantic_edges,
};
use crate::salt::{
    graph::{KnnTable, ProjectorEmbeddings, SemanticEdgeWeights},
    hash::{ContentHash, ContentHasher},
    identity::GenerationRowId,
    projector::{
        ConditionedProjector, EntityRole, LocalScales, ProjectorTypeContext, local_scales,
        project_generation,
    },
    relation::{AttractionEdge, PairProtection, RelationPair},
};

const MAX_CONDITIONS: usize = 32;
const MAX_BATCH_SAMPLE_COUNT: usize = 0x0001_0000;
const MAX_BATCH_EDGE_COUNT: usize = 0x0004_0000;
const MAX_INFERENCE_BATCH_SIZE: usize = 0x0001_0000;

/// Sampling and detached-refresh schedule for adaptive projector fitting.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectorBatchPlanConfig {
    pub conditions: Box<[f64]>,
    pub semantic_positive_count: NonZeroUsize,
    pub ordinary_negative_count: usize,
    pub ordinary_negative_weight: f64,
    pub relation_type_count: NonZeroUsize,
    pub relation_per_type_cap: NonZeroUsize,
    pub anchor_count: usize,
    pub landmark_count: usize,
    pub hard_query_count: usize,
    pub hard_negative: HardNegativeConfig,
    pub refresh_interval: NonZeroUsize,
    pub refresh_condition: f32,
    pub inference_batch_size: NonZeroUsize,
    pub type_context_dropout_probability: f64,
    pub seed: u64,
}

impl ProjectorBatchPlanConfig {
    fn validate(mut self) -> Result<Self, ProjectorFitError> {
        if !(2..=MAX_CONDITIONS).contains(&self.conditions.len()) {
            return Err(ProjectorFitError::ConditionCount {
                count: self.conditions.len(),
            });
        }
        if self.conditions[0].to_bits() != 0.0_f64.to_bits() {
            return Err(ProjectorFitError::InvalidPlanValue {
                field: "semantic-baseline-condition",
                value: self.conditions[0],
            });
        }
        let mut previous = None;
        for (index, condition) in self.conditions.iter_mut().enumerate() {
            let value = *condition;
            if !value.is_finite() || value.is_sign_negative() {
                return Err(ProjectorFitError::InvalidCondition { index, value });
            }
            let Some(narrowed) = narrow_condition(value) else {
                return Err(ProjectorFitError::InvalidCondition { index, value });
            };
            *condition = f64::from(narrowed);
            if let Some(previous) = previous
                && *condition <= previous
            {
                return Err(ProjectorFitError::UnorderedCondition {
                    index,
                    previous,
                    value: *condition,
                });
            }
            previous = Some(*condition);
        }
        if !self.ordinary_negative_weight.is_finite()
            || (self.ordinary_negative_count != 0 && self.ordinary_negative_weight <= 0.0)
            || self.ordinary_negative_weight.is_sign_negative()
        {
            return Err(ProjectorFitError::InvalidPlanValue {
                field: "ordinary-negative-weight",
                value: self.ordinary_negative_weight,
            });
        }
        if !self.refresh_condition.is_finite()
            || self.refresh_condition.is_sign_negative()
            || self
                .conditions
                .binary_search_by(|condition| {
                    condition.total_cmp(&f64::from(self.refresh_condition))
                })
                .is_err()
        {
            return Err(ProjectorFitError::InvalidPlanValue {
                field: "refresh-condition",
                value: f64::from(self.refresh_condition),
            });
        }
        if !valid_type_context_dropout_probability(self.type_context_dropout_probability) {
            return Err(ProjectorFitError::InvalidPlanValue {
                field: "type-context-dropout-probability",
                value: self.type_context_dropout_probability,
            });
        }
        self.hard_negative.validate()?;
        validate_resource_envelope(&self)?;
        Ok(self)
    }

    #[must_use]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-batch-plan.v1");
        for condition in &self.conditions {
            hasher.update(&condition.to_bits().to_le_bytes());
        }
        for value in [
            self.semantic_positive_count.get(),
            self.ordinary_negative_count,
            self.relation_type_count.get(),
            self.relation_per_type_cap.get(),
            self.anchor_count,
            self.landmark_count,
            self.hard_query_count,
            self.refresh_interval.get(),
            self.inference_batch_size.get(),
        ] {
            hasher.update(
                &u64::try_from(value)
                    .expect("projector batch-plan count should fit u64")
                    .to_le_bytes(),
            );
        }
        hasher.update(&self.ordinary_negative_weight.to_bits().to_le_bytes());
        hasher.update(&self.refresh_condition.to_bits().to_le_bytes());
        hasher.update(
            &self
                .type_context_dropout_probability
                .to_bits()
                .to_le_bytes(),
        );
        hasher.update(&self.seed.to_le_bytes());
        hasher.update(self.hard_negative.content_hash().as_bytes());
        hasher.finish()
    }
}

fn validate_resource_envelope(config: &ProjectorBatchPlanConfig) -> Result<(), ProjectorFitError> {
    for (field, value, maximum) in [
        (
            "semantic-positive-count",
            config.semantic_positive_count.get(),
            MAX_BATCH_SAMPLE_COUNT,
        ),
        (
            "ordinary-negative-count",
            config.ordinary_negative_count,
            MAX_BATCH_SAMPLE_COUNT,
        ),
        (
            "relation-type-count",
            config.relation_type_count.get(),
            MAX_BATCH_SAMPLE_COUNT,
        ),
        (
            "relation-per-type-cap",
            config.relation_per_type_cap.get(),
            MAX_BATCH_SAMPLE_COUNT,
        ),
        ("anchor-count", config.anchor_count, MAX_BATCH_SAMPLE_COUNT),
        (
            "landmark-count",
            config.landmark_count,
            MAX_BATCH_SAMPLE_COUNT,
        ),
        (
            "hard-query-count",
            config.hard_query_count,
            MAX_BATCH_SAMPLE_COUNT,
        ),
        (
            "inference-batch-size",
            config.inference_batch_size.get(),
            MAX_INFERENCE_BATCH_SIZE,
        ),
    ] {
        bounded_count(field, value, maximum)?;
    }
    bounded_count(
        "relation-edge-count",
        config
            .relation_type_count
            .get()
            .saturating_mul(config.relation_per_type_cap.get()),
        MAX_BATCH_EDGE_COUNT,
    )?;
    bounded_count(
        "hard-negative-edge-count",
        config
            .hard_query_count
            .saturating_mul(config.hard_negative.neighbors.get()),
        MAX_BATCH_EDGE_COUNT,
    )?;
    bounded_count(
        "aggregate-edge-count",
        aggregate_edge_count(config),
        MAX_BATCH_EDGE_COUNT,
    )
}

#[inline]
const fn bounded_count(
    field: &'static str,
    value: usize,
    maximum: usize,
) -> Result<(), ProjectorFitError> {
    if value > maximum {
        Err(ProjectorFitError::PlanCapacity {
            field,
            value,
            maximum,
        })
    } else {
        Ok(())
    }
}

/// Immutable host evidence sampled throughout one projector fit.
#[derive(Debug, Copy, Clone)]
pub(crate) struct AdaptiveProjectorSource<'source> {
    pub representations: ProjectorEmbeddings<'source>,
    pub roles: &'source [EntityRole],
    pub type_context: Option<ProjectorTypeContext<'source>>,
    pub semantic: &'source KnnTable,
    pub semantic_weights: &'source SemanticEdgeWeights,
    pub relations: &'source [AttractionEdge],
    pub protection: &'source [PairProtection],
    pub anchors: &'source [CoordinateSupportRow],
    pub landmarks: &'source [CoordinateSupportRow],
    pub evidence_hash: ContentHash,
}

/// Supplies one adaptively sampled device batch per optimizer step.
pub(crate) trait ProjectorBatchFactory<B: AutodiffBackend> {
    /// Returns the minimum step count needed to cover the batch schedule.
    #[inline]
    fn minimum_steps(&self) -> usize {
        1
    }

    /// Samples and assembles the next batch against the current model.
    ///
    /// # Errors
    ///
    /// This returns an error when refresh inference, sampling, mining, or
    /// tensor assembly fails.
    fn batch(
        &mut self,
        step: usize,
        model: &ConditionedProjector<B>,
        device: &B::Device,
    ) -> Result<ProjectorTrainingBatch<B>, ProjectorFitError>;

    fn content_hash(&self) -> ContentHash;
}

/// Deterministic sampler with periodic full-field scale and hard-index refresh.
pub(crate) struct AdaptiveProjectorBatchFactory<'source> {
    source: AdaptiveProjectorSource<'source>,
    config: ProjectorBatchPlanConfig,
    rng: Xoshiro256PlusPlus,
    ordinary: OrdinaryNegativeSampler<'source>,
    relation: RelationEdgeSampler<'source>,
    local_scales: Vec<LocalScales>,
    spatial: Option<USearchSpatialIndex>,
}

impl<'source> AdaptiveProjectorBatchFactory<'source> {
    /// Validates and binds a complete adaptive batch plan.
    ///
    /// # Errors
    ///
    /// This returns an error for an invalid condition ladder, weight, refresh
    /// condition, scale epsilon, hard-negative configuration, or protection
    /// ordering.
    pub(crate) fn new(
        source: AdaptiveProjectorSource<'source>,
        config: ProjectorBatchPlanConfig,
    ) -> Result<Self, ProjectorFitError> {
        let config = config.validate()?;
        let ordinary = OrdinaryNegativeSampler::new(source.semantic, source.protection)?;
        let relation = RelationEdgeSampler::new(source.relations)?;
        Ok(Self {
            source,
            rng: Xoshiro256PlusPlus::seed_from_u64(config.seed),
            ordinary,
            relation,
            local_scales: Vec::new(),
            spatial: None,
            config,
        })
    }

    fn refresh<B: AutodiffBackend>(
        &mut self,
        model: &ConditionedProjector<B>,
        device: &B::Device,
    ) -> Result<(), ProjectorFitError> {
        let started = Instant::now();
        let inference_model = model.valid();
        let mut spatial = None;
        let mut scales = Vec::with_capacity(self.config.conditions.len());
        for &condition in &self.config.conditions {
            let condition =
                narrow_condition(condition).expect("validated condition should fit f32");
            let coordinates = project_generation(
                &inference_model,
                self.source.representations,
                self.source.roles,
                self.source.type_context,
                condition,
                self.config.inference_batch_size,
                device,
            )?;
            if self.config.hard_query_count != 0
                && condition.to_bits() == self.config.refresh_condition.to_bits()
            {
                spatial = Some(USearchSpatialIndex::build(
                    &coordinates,
                    self.config.hard_negative,
                )?);
            }
            scales.push(local_scales(&coordinates, self.source.semantic)?);
        }
        if self.config.hard_query_count != 0 && spatial.is_none() {
            let coordinates = project_generation(
                &inference_model,
                self.source.representations,
                self.source.roles,
                self.source.type_context,
                self.config.refresh_condition,
                self.config.inference_batch_size,
                device,
            )?;
            spatial = Some(USearchSpatialIndex::build(
                &coordinates,
                self.config.hard_negative,
            )?);
        }
        self.local_scales = scales;
        self.spatial = spatial;
        tracing::debug!(
            target: "hash_graph_atlas::salt",
            rows = self.source.representations.len(),
            conditions = self.local_scales.len(),
            duration_ms = started.elapsed().as_millis(),
            "detached projector fields refreshed"
        );
        Ok(())
    }

    fn hard_negatives(&mut self) -> Result<Vec<super::SampledEdge>, ProjectorFitError> {
        if self.config.hard_query_count == 0 {
            return Ok(Vec::new());
        }
        let queries = sample_rows(
            self.source.semantic.rows(),
            self.config.hard_query_count,
            &mut self.rng,
        );
        let spatial = self
            .spatial
            .as_ref()
            .expect("step-zero refresh should build the hard-negative index");
        let miner = HardNegativeMiner::from_ordered_protection(
            spatial,
            self.source.semantic,
            self.source.protection,
            self.config.hard_negative,
        )?;
        let mut seen = HashSet::with_capacity(
            queries
                .len()
                .saturating_mul(self.config.hard_negative.neighbors.get()),
        );
        let mut edges = Vec::with_capacity(seen.capacity());
        for query in queries {
            for edge in miner.mine(query)? {
                if seen.insert(RelationPair::new(edge.left, edge.right)) {
                    edges.push(edge);
                }
            }
        }
        Ok(edges)
    }
}

const fn aggregate_edge_count(config: &ProjectorBatchPlanConfig) -> usize {
    config
        .semantic_positive_count
        .get()
        .saturating_add(config.ordinary_negative_count)
        .saturating_add(
            config
                .hard_query_count
                .saturating_mul(config.hard_negative.neighbors.get()),
        )
        .saturating_add(
            config
                .relation_type_count
                .get()
                .saturating_mul(config.relation_per_type_cap.get()),
        )
}

impl<B> ProjectorBatchFactory<B> for AdaptiveProjectorBatchFactory<'_>
where
    B: AutodiffBackend,
{
    #[inline]
    fn minimum_steps(&self) -> usize {
        self.config.conditions.len()
    }

    fn batch(
        &mut self,
        step: usize,
        model: &ConditionedProjector<B>,
        device: &B::Device,
    ) -> Result<ProjectorTrainingBatch<B>, ProjectorFitError> {
        if self.local_scales.len() != self.config.conditions.len()
            || step.is_multiple_of(self.config.refresh_interval.get())
        {
            self.refresh(model, device)?;
        }
        let condition_index = step % self.config.conditions.len();
        let semantic_positive = sample_semantic_edges(
            self.source.semantic,
            self.source.semantic_weights,
            self.config.semantic_positive_count.get(),
            &mut self.rng,
        )?;
        let ordinary_negative = self.ordinary.sample(
            self.config.ordinary_negative_count,
            self.config.ordinary_negative_weight,
            &mut self.rng,
        )?;
        let hard_negative = self.hard_negatives()?;
        let relation = self.relation.sample(
            self.config.relation_type_count.get(),
            self.config.relation_per_type_cap.get(),
            &mut self.rng,
        );
        let anchors = sample_support(self.source.anchors, self.config.anchor_count, &mut self.rng);
        let landmarks = sample_support(
            self.source.landmarks,
            self.config.landmark_count,
            &mut self.rng,
        );
        let prepared = prepare_projector_batch(
            ProjectorBatchSource {
                representations: self.source.representations,
                roles: self.source.roles,
                type_context: self.source.type_context,
                type_context_dropout: self.source.type_context.map(|_| TypeContextDropout {
                    probability: self.config.type_context_dropout_probability,
                    seed: self.config.seed,
                    step: u64::try_from(step).expect("optimizer step should fit u64"),
                }),
                semantic_positive: &semantic_positive,
                ordinary_negative: &ordinary_negative,
                hard_negative: &hard_negative,
                relation: &relation,
                local_scales: &self.local_scales[condition_index],
                anchors: &anchors,
                landmarks: &landmarks,
            },
            device,
        )?;
        prepared
            .at_condition(self.config.conditions[condition_index], device)
            .map_err(Into::into)
    }

    fn content_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.adaptive-batch-factory.v1");
        hasher.update(self.config.content_hash().as_bytes());
        hasher.update(self.source.evidence_hash.as_bytes());
        hasher.finish()
    }
}

fn sample_rows(rows: usize, requested: usize, rng: &mut impl Rng) -> Vec<GenerationRowId> {
    sample_indices(rows, requested, rng)
        .into_iter()
        .map(|row| {
            GenerationRowId::try_from(row).expect("semantic graph rows should fit generation IDs")
        })
        .collect()
}

fn sample_support(
    support: &[CoordinateSupportRow],
    requested: usize,
    rng: &mut impl Rng,
) -> Vec<CoordinateSupportRow> {
    sample_indices(support.len(), requested, rng)
        .into_iter()
        .map(|index| support[index])
        .collect()
}

fn sample_indices(rows: usize, requested: usize, rng: &mut impl Rng) -> Vec<usize> {
    let requested = requested.min(rows);
    let mut replacements = std::collections::HashMap::with_capacity(requested);
    let mut sampled = Vec::with_capacity(requested);
    for draw in 0..requested {
        let remaining = rows - draw;
        let selected = random_below(rng, 0..remaining);
        let row = replacements.remove(&selected).unwrap_or(selected);
        let last = replacements
            .remove(&(remaining - 1))
            .unwrap_or(remaining - 1);
        if selected != remaining - 1 {
            replacements.insert(selected, last);
        }
        sampled.push(row);
    }
    sampled
}

fn random_below(rng: &mut impl Rng, range: Range<usize>) -> usize {
    let width = u64::try_from(range.end - range.start).expect("range width should fit u64");
    let zone = u64::MAX - u64::MAX % width;
    loop {
        let value = rng.next_u64();
        if value < zone {
            return range.start + usize::try_from(value % width).expect("sample should fit usize");
        }
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "condition representability is checked immediately after conversion"
)]
#[inline]
fn narrow_condition(value: f64) -> Option<f32> {
    let narrowed = value as f32;
    narrowed.is_finite().then_some(narrowed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_rejects_an_aggregate_batch_beyond_the_resource_envelope() {
        let config = ProjectorBatchPlanConfig {
            conditions: vec![0.0, 1.0].into_boxed_slice(),
            semantic_positive_count: NonZeroUsize::new(MAX_BATCH_SAMPLE_COUNT)
                .expect("sample limit should be non-zero"),
            ordinary_negative_count: MAX_BATCH_SAMPLE_COUNT,
            ordinary_negative_weight: 1.0,
            relation_type_count: NonZeroUsize::new(1).expect("one should be non-zero"),
            relation_per_type_cap: NonZeroUsize::new(1).expect("one should be non-zero"),
            anchor_count: 0,
            landmark_count: 0,
            hard_query_count: 256,
            hard_negative: HardNegativeConfig {
                neighbors: NonZeroUsize::new(1_024).expect("limit should be non-zero"),
                candidate_multiplier: NonZeroUsize::new(1).expect("one should be non-zero"),
                connectivity: NonZeroUsize::new(4).expect("four should be non-zero"),
                expansion_add: NonZeroUsize::new(8).expect("eight should be non-zero"),
                expansion_search: NonZeroUsize::new(8).expect("eight should be non-zero"),
                maximum_weight: 1.0,
                rank_exponent: 1.0,
            },
            refresh_interval: NonZeroUsize::new(1).expect("one should be non-zero"),
            refresh_condition: 1.0,
            inference_batch_size: NonZeroUsize::new(1).expect("one should be non-zero"),
            type_context_dropout_probability: 0.0,
            seed: 29,
        };

        assert_matches!(
            config.clone().validate(),
            Err(ProjectorFitError::PlanCapacity {
                field: "aggregate-edge-count",
                ..
            })
        ));
    }
}
