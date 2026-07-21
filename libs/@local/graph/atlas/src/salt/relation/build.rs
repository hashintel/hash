//! Construction of both relation indexes from one admitted instance set.

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
/// Relation volume is heavily skewed - a handful of types own most links - so the group pass cannot
/// lean on group-level parallelism alone: one dominant relation would serialize it. Within a group,
/// instances therefore emit over chunks of this size. Boundaries are fixed positions of the sorted
/// slice and the chunk partials combine in chunk order, so the double-precision evidence sums
/// associate identically on every run: the build stays a function of the instance set, whatever the
/// thread count or scheduling. The size is a granularity, not a tuned number - large enough that
/// per-chunk task and buffer overhead vanishes behind tens of thousands of column searches, small
/// enough that a million-instance relation splits into dozens of stealable pieces; any nearby power
/// of two serves equally.
pub(super) const EMISSION_CHUNK: usize = 1 << 14;

/// Builds the attraction and protection indexes together.
///
/// See [`RelationIndexes::build`] for the contract; this is its implementation, composed from the
/// named stages below so each stage stays measurable on its own.
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

    let proper = sort_by_group(instances);
    let self_references = instances.len() - proper;
    let proper = &mut instances[..proper];

    let group_ranges = resolve_groups(proper, policies)?;
    let built = build_groups(proper, group_ranges, attraction, EMISSION_CHUNK);

    let mut evidence = BuildEvidence {
        pruning_threshold: attraction.pruning_threshold(),
        retained_edges: 0,
        pruned_edges: 0,
        retained_mass: 0.0,
        pruned_mass: 0.0,
        self_references,
        // The histogram is a drain fact; the staging pass records it
        // after the build.
        multi_typed_edges: Vec::new(),
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

    sort_by_pair(proper);
    let protection = assemble_protection(rows, proper, policies);

    Ok(RelationIndexes {
        attraction: AttractionIndex::new(groups),
        protection,
        evidence,
    })
}

/// Sorts instances by relation group and returns the proper count.
///
/// Self-references sort behind every proper instance, so the returned partition point drops them
/// without moving memory. The remainder of the key is total under the edge stream's uniqueness
/// contract, making the unstable parallel sort deterministic.
pub(super) fn sort_by_group(instances: &mut [RelationInstance]) -> usize {
    instances.par_sort_unstable_by_key(|instance| {
        (
            instance.source == instance.target,
            instance.relation.get(),
            instance.source.get(),
            instance.target.get(),
            instance.edge.get(),
        )
    });

    instances.partition_point(|instance| instance.source != instance.target)
}

/// Resolves every group's range and policy over group-sorted instances.
///
/// The resolution precedes any parallel work: the emission pass is infallible, and the first
/// uncovered relation in ascending order is the deterministic error.
///
/// # Errors
///
/// Returns an error when an instance references a relation the policy table does not cover.
pub(super) fn resolve_groups<'policy>(
    proper: &[RelationInstance],
    policies: Policies<'policy>,
) -> Result<Vec<(Range<usize>, &'policy RelationPolicy)>, RelationIndexError> {
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
    Ok(group_ranges)
}

/// Builds every relation's attraction group over its resolved range.
///
/// `chunk` is the emission granularity; the index build passes [`EMISSION_CHUNK`], and the
/// granularity claim on that constant is verified by benchmarking other values through this
/// parameter.
pub(super) fn build_groups(
    proper: &[RelationInstance],
    group_ranges: Vec<(Range<usize>, &RelationPolicy)>,
    attraction: AttractionOptions,
    chunk: usize,
) -> Vec<(AttractionGroup, GroupEvidence)> {
    group_ranges
        .into_par_iter()
        .map(|(range, policy)| build_group(&proper[range], policy, attraction, chunk))
        .collect()
}

/// Reorders proper instances in place by canonical endpoint pair.
///
/// Instances of one pair may arrive in any order behind the pair key; the protection aggregation's
/// per-component maximum is order-independent, so the assembled index is still a function of the
/// set.
pub(super) fn sort_by_pair(proper: &mut [RelationInstance]) {
    proper
        .par_sort_unstable_by_key(|instance| NodePair::new(instance.source, instance.target).key());
}

/// Returns whether two instances connect the same endpoint pair.
fn same_pair(one: &RelationInstance, other: &RelationInstance) -> bool {
    NodePair::new(one.source, one.target) == NodePair::new(other.source, other.target)
}

/// Assembles the symmetric evidence matrix from pair-sorted instances.
///
/// Two passes over the pair runs: counting fills the row pointers, the scatter writes each pair's
/// aggregated evidence into both of its rows. Canonical pair order makes the scatter emit every
/// row's partners ascending without a sort: a row's smaller partners arrive while the row is some
/// pair's second endpoint (ascending by the pairs' first components), its larger partners
/// afterwards while it is the first (ascending by second components). The scatter is sequential and
/// costs about as much as both whole-slice sorts together at live scale (measured at 4.4M
/// instances); the index validation behind it re-checks the constructed invariants in parallel.
///
/// # Panics
///
/// Panics when an instance endpoint lies outside the `rows` domain, which the dataset row contract
/// excludes.
pub(super) fn assemble_protection(
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
pub(super) struct GroupEvidence {
    pruned: usize,
    retained_mass: f64,
    pruned_mass: f64,
}

/// Builds one relation's attraction group from its contiguous instances.
///
/// The slice is one relation's run of the `(source, target, edge)` sort. Degrees count over two
/// compact endpoint columns in one scratch allocation: the source column inherits the run's order,
/// the target column sorts here, and a row's degree is the share sum over its run in each column,
/// read as a prefix difference. Emission then parallelizes over `chunk`-sized chunks reading those
/// shared columns.
fn build_group(
    instances: &[RelationInstance],
    policy: &RelationPolicy,
    attraction: AttractionOptions,
    chunk: usize,
) -> (AttractionGroup, GroupEvidence) {
    let relation = instances[0].relation;
    let weights = AttractionWeights {
        coincident: attraction.coincident_coefficient() * policy.attraction.coincident,
        proximal: policy.attraction.proximal,
        strength: policy.strength,
    };
    let scale = weights.scale();

    let share = |instance: &RelationInstance| f64::from(instance.multiplicity.max(1)).recip();
    let sources = DegreeColumn::new(
        instances
            .iter()
            .map(|instance| (instance.source.get(), share(instance)))
            .collect(),
    );
    let targets = DegreeColumn::new(
        instances
            .iter()
            .map(|instance| (instance.target.get(), share(instance)))
            .collect(),
    );

    let mut yielded: Vec<(Vec<AttractionEdge>, GroupEvidence)> = instances
        .par_chunks(chunk)
        .map(|chunk| emit_chunk(chunk, &sources, &targets, scale, attraction))
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

/// One group column: endpoint rows ascending, with the running share total ahead of every position.
///
/// A row's degree is the share sum over its run, read as a prefix difference; lookups stay binary
/// searches.
struct DegreeColumn {
    rows: Vec<u64>,
    prefix: Vec<f64>,
}

impl DegreeColumn {
    /// Sorts the entries and accumulates the share prefix.
    ///
    /// The sort key includes the share bits, so equal rows order their shares deterministically and
    /// the prefix sums are reproducible.
    fn new(mut entries: Vec<(u64, f64)>) -> Self {
        entries.par_sort_unstable_by(|left, right| {
            left.0.cmp(&right.0).then(left.1.total_cmp(&right.1))
        });

        let mut prefix = Vec::with_capacity(entries.len() + 1);
        let mut total = 0.0_f64;
        prefix.push(total);
        for &(_, share) in &entries {
            total += share;
            prefix.push(total);
        }

        Self {
            rows: entries.into_iter().map(|(row, _)| row).collect(),
            prefix,
        }
    }

    /// Returns the share-weighted degree of `row`.
    fn degree(&self, row: u64) -> f64 {
        let start = self.rows.partition_point(|&entry| entry < row);
        let end = self.rows.partition_point(|&entry| entry <= row);
        self.prefix[end] - self.prefix[start]
    }
}

/// Emits one fixed chunk of a group's instances against its columns.
fn emit_chunk(
    chunk: &[RelationInstance],
    sources: &DegreeColumn,
    targets: &DegreeColumn,
    scale: f32,
    attraction: AttractionOptions,
) -> (Vec<AttractionEdge>, GroupEvidence) {
    let mut edges = Vec::with_capacity(chunk.len());
    let mut evidence = GroupEvidence::default();
    for instance in chunk {
        let confidence = instance.confidence.effective();
        let share = f64::from(instance.multiplicity.max(1)).recip();
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the share is in (0, 1]; narrowing to working precision is the operation"
        )]
        let mass = confidence.value() * scale * share as f32;
        if mass < attraction.pruning_threshold() {
            evidence.pruned += 1;
            evidence.pruned_mass += f64::from(mass);
            continue;
        }

        #[expect(
            clippy::cast_possible_truncation,
            reason = "the factor is in (0, 1]; the final narrowing to working precision is the \
                      operation"
        )]
        let normalization = {
            // A row's degree spans both columns: it may source some
            // edges and receive others.
            let degree = |row: u64| sources.degree(row) + targets.degree(row);
            let source = degree(instance.source.get());
            let target = degree(instance.target.get());
            (((1.0 + source) * (1.0 + target)).sqrt().recip() * share) as f32
        };

        edges.push(AttractionEdge {
            edge: instance.edge,
            source: instance.source,
            target: instance.target,
            confidence,
            normalization,
        });
        evidence.retained_mass += f64::from(mass);
    }

    (edges, evidence)
}
