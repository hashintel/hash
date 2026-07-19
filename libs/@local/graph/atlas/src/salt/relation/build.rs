//! Construction of bothI am think relation indexes from one admitted instance set.

use core::ops::Range;

use rayon::prelude::*;

use super::{
    BuildEvidence, Policies, RelationIndexes, RelationInstance, RelationPolicy,
    attraction::{
        AttractionEdge, AttractionGroup, AttractionIndex, AttractionOptions, AttractionWeights,
    },
    error::RelationIndexError,
    protection::{NodePair, PairEvidence, ProtectionIndex, ProtectionMatrix},
};

/// Instances per parallel emission chunk within one relation group.
///
/// Relation volume is heavily skewed - a handful of types own most
/// links - so the group pass cannot lean on group-level parallelism
/// alone: one dominant relation would serialize it. Within a group,
/// instances therefore emit over chunks of this size. Boundaries are
/// fixed positions of the sorted slice and the chunk partials combine
/// in chunk order, so the double-precision evidence sums associate
/// identically on every run: the build stays a function of the
/// instance set, whatever the thread count or scheduling. The size is
/// a granularity, not a tuned number - large enough that per-chunk
/// task and buffer overhead vanishes behind tens of thousands of
/// column searches, small enough that a million-instance relation
/// splits into dozens of stealable pieces; any nearby power of two
/// serves equally.
pub(super) const EMISSION_CHUNK: usize = 1 << 14;

/// Builds the attraction and protection indexes together.
///
/// See [`RelationIndexes::build`] for the contract; this is its
/// implementation.
pub(super) fn build(
    rows: usize,
    policies: Policies<'_>,
    instances: &mut [RelationInstance],
    attraction: AttractionOptions,
) -> Result<RelationIndexes, RelationIndexError> {
    // The check precedes every allocation sized by `rows`.
    if u32::try_from(rows).is_err() {
        return Err(RelationIndexError::TooManyRows { rows });
    }
    // Self-references sort behind every proper instance, so one split
    // drops them without moving memory. The remainder of the key is
    // total under the edge stream's uniqueness contract, making the
    // unstable parallel sort deterministic.
    instances.par_sort_unstable_by_key(|instance| {
        (
            instance.source == instance.target,
            instance.relation.get(),
            instance.source.get(),
            instance.target.get(),
            instance.edge.get(),
        )
    });

    let proper = instances.partition_point(|instance| instance.source != instance.target);
    let self_references = instances.len() - proper;
    let proper = &mut instances[..proper];

    // Every group's range and policy resolve before any parallel work:
    // the emission pass is infallible, and the first uncovered relation
    // in ascending order is the deterministic error.
    let mut group_ranges: Vec<(Range<usize>, &RelationPolicy)> = Vec::new();
    let mut start = 0;
    while start < proper.len() {
        let relation = proper[start].relation;
        let length = proper[start..].partition_point(|instance| instance.relation == relation);
        let Some(policy) = policies.get(relation) else {
            return Err(RelationIndexError::MissingPolicy { relation });
        };
        group_ranges.push((start..start + length, policy));
        start += length;
    }

    let grouped = &*proper;
    let built: Vec<(AttractionGroup, GroupEvidence)> = group_ranges
        .into_par_iter()
        .map(|(range, policy)| build_group(&grouped[range], policy, attraction))
        .collect();

    let mut evidence = BuildEvidence {
        pruning_threshold: attraction.pruning_threshold(),
        retained_edges: 0,
        pruned_edges: 0,
        retained_mass: 0.0,
        pruned_mass: 0.0,
        self_references,
    };

    let mut groups = Vec::with_capacity(built.len());
    for (group, partial) in built {
        evidence.retained_edges += group.edges().len();
        evidence.pruned_edges += partial.pruned;
        evidence.retained_mass += partial.retained_mass;
        evidence.pruned_mass += partial.pruned_mass;

        if !group.edges().is_empty() {
            groups.push(group);
        }
    }

    // The same instances reorder in place by endpoint pair for the
    // protection aggregation. Instances of one pair may arrive in any
    // order behind the pair key; the per-component maximum is
    // order-independent, so the result is still a function of the set.
    proper
        .par_sort_unstable_by_key(|instance| NodePair::new(instance.source, instance.target).key());
    let protection = assemble_protection(rows, proper, policies);

    Ok(RelationIndexes {
        attraction: AttractionIndex::new(groups),
        protection,
        evidence,
    })
}

/// Returns whether two instances connect the same endpoint pair.
fn same_pair(one: &RelationInstance, other: &RelationInstance) -> bool {
    NodePair::new(one.source, one.target) == NodePair::new(other.source, other.target)
}

/// Assembles the symmetric evidence matrix from pair-sorted instances.
///
/// Two passes over the pair runs: counting fills the row pointers, the
/// scatter writes each pair's aggregated evidence into both of its
/// rows. Canonical pair order makes the scatter emit every row's
/// partners ascending without a sort: a row's smaller partners arrive
/// while the row is some pair's second endpoint (ascending by the
/// pairs' first components), its larger partners afterwards while it
/// is the first (ascending by second components). Assembly is
/// sequential; the whole-slice sorts dominate the pass.
///
/// # Panics
///
/// Panics when an instance endpoint lies outside the `rows` domain,
/// which the dataset row contract excludes.
fn assemble_protection(
    rows: usize,
    proper: &[RelationInstance],
    policies: Policies<'_>,
) -> ProtectionIndex {
    let mut indptr = vec![0_u64; rows + 1];
    for run in proper.chunk_by(same_pair) {
        let pair = NodePair::new(run[0].source, run[0].target);
        indptr[pair.first().usize() + 1] += 1;
        indptr[pair.second().usize() + 1] += 1;
    }
    for row in 0..rows {
        indptr[row + 1] += indptr[row];
    }

    let entries = usize::try_from(indptr[rows]).expect("resident entries fit the address space");
    let mut cursor: Vec<u64> = indptr[..rows].to_vec();
    let mut columns = vec![0_u32; entries];
    let mut evidence = vec![PairEvidence::default(); entries];
    for run in proper.chunk_by(same_pair) {
        let pair = NodePair::new(run[0].source, run[0].target);
        let value = pair_evidence(run, policies);
        for (row, partner) in [(pair.first(), pair.second()), (pair.second(), pair.first())] {
            let slot = usize::try_from(cursor[row.usize()])
                .expect("resident entries fit the address space");
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the row domain was validated against the u32 column encoding"
            )]
            {
                columns[slot] = partner.get() as u32;
            }
            evidence[slot] = value;
            cursor[row.usize()] += 1;
        }
    }

    let matrix = ProtectionMatrix::try_new((rows, rows), indptr, columns, evidence)
        .map_err(|(_, _, _, error)| error)
        .expect("the scatter emits sorted, in-bounds partners for every row");
    ProtectionIndex::new(matrix).expect("the assembled matrix satisfies every index invariant")
}

/// Aggregates one endpoint pair's contiguous instances into evidence.
fn pair_evidence(run: &[RelationInstance], policies: Policies<'_>) -> PairEvidence {
    let mut discounted = 0.0_f32;
    let mut undiscounted = 0.0_f32;
    for instance in run {
        let policy = policies
            .get(instance.relation)
            .expect("every relation resolved a policy at the group-boundary walk");

        let confidence = instance.confidence.effective().value();
        let positive = policy.selected.coincident + policy.selected.proximal;
        let value = confidence * positive;
        // value * a <= value exactly: multiplying a non-negative f32 by
        // a factor in [0, 1] cannot round above it, so the index's
        // ordering invariant holds per instance and survives the max.
        discounted = discounted.max(value * policy.applicability);
        undiscounted = undiscounted.max(value);
    }

    PairEvidence {
        discounted,
        undiscounted,
    }
}

/// Per-group pruning tallies beside the group they describe.
#[derive(Default)]
struct GroupEvidence {
    pruned: usize,
    retained_mass: f64,
    pruned_mass: f64,
}

/// Builds one relation's attraction group from its contiguous instances.
///
/// The slice is one relation's run of the `(source, target, edge)` sort.
/// Degrees count over two compact endpoint columns in one scratch
/// allocation: the source column inherits the run's order, the target
/// column sorts here, and a row's degree is the sum of its two
/// binary-searchable run lengths. Emission then parallelizes over
/// [`EMISSION_CHUNK`]-sized chunks reading those shared columns.
fn build_group(
    instances: &[RelationInstance],
    policy: &RelationPolicy,
    attraction: AttractionOptions,
) -> (AttractionGroup, GroupEvidence) {
    let relation = instances[0].relation;
    let weights = AttractionWeights {
        coincident: attraction.coincident_coefficient() * policy.attraction.coincident,
        proximal: policy.attraction.proximal,
        strength: policy.strength,
    };
    let scale = weights.scale();

    let mut columns = Vec::with_capacity(instances.len() * 2);
    columns.extend(instances.iter().map(|instance| instance.source.get()));
    columns.extend(instances.iter().map(|instance| instance.target.get()));
    let (sources, targets) = columns.split_at_mut(instances.len());
    debug_assert!(sources.is_sorted(), "the group sort orders sources");
    targets.par_sort_unstable();
    let (sources, targets) = (&*sources, &*targets);

    let mut yielded: Vec<(Vec<AttractionEdge>, GroupEvidence)> = instances
        .par_chunks(EMISSION_CHUNK)
        .map(|chunk| emit_chunk(chunk, sources, targets, scale, attraction))
        .collect();

    // Combined in chunk order; see EMISSION_CHUNK for why that keeps
    // the sums deterministic.
    let (edges, evidence) = if yielded.len() == 1 {
        yielded.pop().expect("one chunk was just checked")
    } else {
        let retained = yielded.iter().map(|(edges, _)| edges.len()).sum();
        let mut edges = Vec::with_capacity(retained);
        let mut evidence = GroupEvidence::default();
        for (chunk_edges, partial) in yielded {
            edges.extend(chunk_edges);
            evidence.pruned += partial.pruned;
            evidence.retained_mass += partial.retained_mass;
            evidence.pruned_mass += partial.pruned_mass;
        }
        (edges, evidence)
    };

    (AttractionGroup::new(relation, weights, edges), evidence)
}

/// Emits one fixed chunk of a group's instances against its columns.
fn emit_chunk(
    chunk: &[RelationInstance],
    sources: &[u64],
    targets: &[u64],
    scale: f32,
    attraction: AttractionOptions,
) -> (Vec<AttractionEdge>, GroupEvidence) {
    let count = |column: &[u64], row: u64| {
        column.partition_point(|&entry| entry <= row) - column.partition_point(|&entry| entry < row)
    };
    let degree = |row: u64| count(sources, row) + count(targets, row);

    let mut edges = Vec::with_capacity(chunk.len());
    let mut evidence = GroupEvidence::default();
    for instance in chunk {
        let confidence = instance.confidence.effective();
        let mass = confidence.value() * scale;
        if mass < attraction.pruning_threshold() {
            evidence.pruned += 1;
            evidence.pruned_mass += f64::from(mass);
            continue;
        }

        #[expect(
            clippy::cast_precision_loss,
            clippy::cast_possible_truncation,
            reason = "degrees are bounded by the instance count, far below f64 integer precision; \
                      the final narrowing to working precision is the operation"
        )]
        let degree_normalization = {
            let source = degree(instance.source.get());
            let target = degree(instance.target.get());
            (((1 + source) as f64 * (1 + target) as f64).sqrt().recip()) as f32
        };

        edges.push(AttractionEdge {
            edge: instance.edge,
            source: instance.source,
            target: instance.target,
            confidence,
            degree_normalization,
        });
        evidence.retained_mass += f64::from(mass);
    }

    (edges, evidence)
}
