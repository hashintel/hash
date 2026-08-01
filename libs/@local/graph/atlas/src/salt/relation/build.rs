//! Construction of both relation indexes from one admitted instance set.

use core::ops::Range;

use hashql_core::id::{Id, IdVec};
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelIterator as _, ParallelIterator as _},
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};

use super::{
    BuildMeasurements, Policies, RelationIndexes, RelationInstance, RelationPolicy,
    attraction::{
        AttractionEdge, AttractionGroup, AttractionIndex, AttractionOptions, AttractionWeights,
    },
    error::RelationIndexError,
    protection::{NodePair, PairEvidence, ProtectionIndex, ProtectionMatrix},
};
use crate::math::narrow_f32;

/// Instances per parallel emission chunk within one relation group.
///
/// Relation volume is heavily skewed - a handful of types own most links - so the group pass cannot
/// lean on group-level parallelism alone: one dominant relation would serialize it. Within a group,
/// instances therefore emit over chunks of this size. Boundaries are fixed positions of the sorted
/// slice and the chunk partials combine in chunk order, so the double-precision mass sums
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
pub(super) fn build<N, E>(
    rows: usize,
    policies: Policies<'_>,
    instances: &mut [RelationInstance<N, E>],
    attraction: AttractionOptions,
) -> Result<RelationIndexes<N, E>, RelationIndexError>
where
    N: Id,
    E: Id,
{
    // The check precedes every allocation sized by `rows`.
    if u32::try_from(rows).is_err() {
        return Err(RelationIndexError::TooManyRows { rows });
    }

    let proper = sort_by_group(instances);
    let self_references = instances.len() - proper;
    let proper = &mut instances[..proper];

    let group_ranges = resolve_groups(proper, policies)?;
    let mut records = vec![ProtectionRecord::empty(); proper.len()];
    let built = build_groups(
        proper,
        group_ranges,
        &mut records,
        attraction,
        EMISSION_CHUNK,
    );

    let mut measurements = BuildMeasurements {
        pruning_threshold: attraction.pruning_threshold(),
        retained_edges: 0,
        pruned_edges: 0,
        retained_mass: 0.0,
        pruned_mass: 0.0,
        self_references,
        // Starts empty: the histogram counts readings per edge, which only the fit's relation stage
        // sees while draining the edge stream. That stage writes the counts here after the build
        // returns.
        multi_typed_edges: Vec::new(),
        // Starts at zero for the same reason: the clamp happens at the
        // drain, and its count joins these measurements afterwards.
        clamped_confidences: 0,
    };

    let mut groups = Vec::with_capacity(built.len());
    for (group, partial) in built {
        measurements.retained_edges += group.edges().len();
        measurements.pruned_edges += partial.pruned;
        measurements.retained_mass += partial.retained_mass;
        measurements.pruned_mass += partial.pruned_mass;

        if !group.edges().is_empty() {
            groups.push(group);
        }
    }

    let protection = assemble_protection(rows, &mut records);

    Ok(RelationIndexes {
        attraction: AttractionIndex::new(groups),
        protection,
        measurements,
    })
}

/// Sorts instances by relation group and returns the proper count.
///
/// Self-references sort behind every proper instance, so the returned partition point drops them
/// without moving memory. The remainder of the key is total under the edge stream's uniqueness
/// contract, making the unstable parallel sort deterministic.
pub(super) fn sort_by_group<N, E>(instances: &mut [RelationInstance<N, E>]) -> usize
where
    N: Id,
    E: Id,
{
    instances.par_sort_unstable_by_key(|instance| {
        (
            instance.source == instance.target,
            instance.relation,
            instance.source,
            instance.target,
            instance.edge,
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
pub(super) fn resolve_groups<'policy, N, E>(
    proper: &[RelationInstance<N, E>],
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

/// One proper instance's protection contribution: its canonical pair and class evidence.
///
/// The group emission writes one record per instance - pruning-exempt, since protection evidence
/// covers the complete admitted set - and the protection assembly orders and aggregates the
/// records without revisiting instances or policies.
#[derive(Debug, Copy, Clone)]
pub(super) struct ProtectionRecord<N> {
    pair: NodePair<N>,
    discounted: f32,
    undiscounted: f32,
}

impl<N> ProtectionRecord<N> {
    /// The zero record the build's scratch starts from; emission overwrites every slot.
    pub(crate) const fn empty() -> Self
    where
        N: [const] Id,
    {
        Self {
            pair: NodePair::new(N::from_u64(0), N::from_u64(0)),
            discounted: 0.0,
            undiscounted: 0.0,
        }
    }
}

/// Per-group pruning tallies beside the group they describe.
#[derive(Default)]
pub(super) struct GroupMeasurements {
    pruned: usize,
    retained_mass: f64,
    pruned_mass: f64,
}

/// Builds every relation's attraction group over its resolved range.
///
/// Each group also emits its instances' protection records into its slice of `records`,
/// positionally: the record at a group-relative offset describes the instance at that offset.
/// `chunk` is the emission batch size. The index build passes [`EMISSION_CHUNK`], and benchmarking
/// other values through this parameter verifies the batch-size claim on that constant.
pub(super) fn build_groups<N, E>(
    proper: &[RelationInstance<N, E>],
    group_ranges: Vec<(Range<usize>, &RelationPolicy)>,
    records: &mut [ProtectionRecord<N>],
    attraction: AttractionOptions,
    chunk: usize,
) -> Vec<(AttractionGroup<N, E>, GroupMeasurements)>
where
    N: Id,
    E: Id,
{
    // The resolved ranges are contiguous and ascending from zero, so the
    // record buffer carves into the groups' disjoint slices by length.
    let mut slices = Vec::with_capacity(group_ranges.len());
    let mut rest = records;
    for (range, _) in &group_ranges {
        let (head, tail) = rest.split_at_mut(range.len());
        slices.push(head);
        rest = tail;
    }

    group_ranges
        .into_par_iter()
        .zip(slices)
        .map(|((range, policy), records)| {
            build_group(&proper[range], policy, records, attraction, chunk)
        })
        .collect()
}

/// Assembles the symmetric evidence matrix from the emitted protection records.
///
/// The records order by canonical pair first: one pair's records may have emitted at any
/// positions, and the aggregation's per-component maximum is order-independent, so the assembled
/// index is a function of the instance set. Two passes over the pair runs then build the matrix:
/// counting fills the row pointers, the scatter writes each pair's aggregated evidence into both
/// of its rows. Canonical pair order makes the scatter emit every row's partners ascending
/// without a sort: a row's smaller partners arrive while the row is some pair's second endpoint
/// (ascending by the pairs' first components), its larger partners afterwards while it is the
/// first (ascending by second components). The scatter is sequential, the assembly's serial
/// floor; the index validation behind it re-checks the constructed invariants in parallel.
///
/// # Panics
///
/// Panics when a record endpoint lies outside the `rows` domain, which the dataset row contract
/// excludes.
pub(super) fn assemble_protection<N>(
    rows: usize,
    records: &mut [ProtectionRecord<N>],
) -> ProtectionIndex<N>
where
    N: Id + Send,
{
    records.par_sort_unstable_by_key(|record| record.pair);

    let mut indptr = IdVec::from_elem(0, rows + 1);
    for run in records.chunk_by(|one, other| one.pair == other.pair) {
        let pair = run[0].pair;
        indptr[pair.lhs().plus(1)] += 1;
        indptr[pair.rhs().plus(1)] += 1;
    }

    let mut total = 0_u64;
    for fencepost in &mut indptr {
        total += *fencepost;
        *fencepost = total;
    }

    let entries = usize::try_from(total).expect("resident entries fit the address space");
    let mut cursor = IdVec::from_fn(rows, |row: N| indptr[row]);
    let mut columns = vec![0_u32; entries];
    let mut evidence = vec![PairEvidence::default(); entries];
    for run in records.chunk_by(|one, other| one.pair == other.pair) {
        let pair = run[0].pair;
        let value = pair_evidence(run);
        for (row, partner) in [(pair.lhs(), pair.rhs()), (pair.rhs(), pair.lhs())] {
            // `columns` and `evidence` are the CSR entry arrays: their
            // positions are storage offsets in the matrix encoding, not
            // ids of any domain, so they stay raw.
            let slot =
                usize::try_from(cursor[row]).expect("resident entries fit the address space");
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the row domain was validated against the u32 column encoding"
            )]
            {
                columns[slot] = partner.as_u64() as u32;
            }
            evidence[slot] = value;
            cursor[row] += 1;
        }
    }

    let matrix = ProtectionMatrix::try_new((rows, rows), indptr.into_raw(), columns, evidence)
        .map_err(|(_, _, _, error)| error)
        .expect("the scatter emits sorted, in-bounds partners for every row");
    ProtectionIndex::new(matrix).expect("the assembled matrix satisfies every index invariant")
}

/// Aggregates one canonical pair's contiguous records into evidence.
fn pair_evidence<N>(run: &[ProtectionRecord<N>]) -> PairEvidence {
    let mut discounted = 0.0_f32;
    let mut undiscounted = 0.0_f32;
    for record in run {
        discounted = discounted.max(record.discounted);
        undiscounted = undiscounted.max(record.undiscounted);
    }

    PairEvidence {
        discounted,
        undiscounted,
    }
}

/// One group's per-instance emission factors, resolved once from its policy.
#[derive(Copy, Clone)]
struct GroupFactors {
    /// The positive force scale `s+`.
    scale: f32,
    /// The selected positive class evidence `p_C + p_P`.
    positive: f32,
    /// The relation's calibrated applicability `a`.
    applicability: f32,
}

/// Builds one relation's attraction group from its contiguous instances.
///
/// The slice is one relation's run of the `(source, target, edge)` sort. Degrees count over two
/// compact endpoint columns in one scratch allocation: the source column inherits the run's order,
/// the target column sorts here, and a row's degree is the share sum over its run in each column,
/// read as a prefix difference. Emission then parallelizes over `chunk`-sized chunks reading those
/// shared columns.
fn build_group<N, E>(
    instances: &[RelationInstance<N, E>],
    policy: &RelationPolicy,
    records: &mut [ProtectionRecord<N>],
    attraction: AttractionOptions,
    chunk: usize,
) -> (AttractionGroup<N, E>, GroupMeasurements)
where
    N: Id,
    E: Id,
{
    let relation = instances[0].relation;
    let weights = AttractionWeights {
        coincident: attraction.coincident_coefficient() * policy.attraction.coincident,
        proximal: policy.attraction.proximal,
        strength: policy.strength,
    };
    let factors = GroupFactors {
        scale: weights.scale(),
        positive: policy.selected.coincident + policy.selected.proximal,
        applicability: policy.applicability,
    };

    let share = |instance: &RelationInstance<N, E>| f64::from(instance.multiplicity.max(1)).recip();
    let sources = DegreeColumn::new(
        instances
            .iter()
            .map(|instance| (instance.source.as_u64(), share(instance)))
            .collect(),
    );
    let targets = DegreeColumn::new(
        instances
            .iter()
            .map(|instance| (instance.target.as_u64(), share(instance)))
            .collect(),
    );

    let mut yielded: Vec<(Vec<_>, GroupMeasurements)> = instances
        .par_chunks(chunk)
        .zip(records.par_chunks_mut(chunk))
        .map(|(chunk, records)| emit_chunk(chunk, records, &sources, &targets, factors, attraction))
        .collect();

    // Combined in chunk order; see EMISSION_CHUNK for why that keeps
    // the sums deterministic.
    let (edges, measurements) = if yielded.len() == 1 {
        yielded.pop().expect("one chunk was just checked")
    } else {
        let retained = yielded.iter().map(|(edges, _)| edges.len()).sum();
        let mut edges = Vec::with_capacity(retained);
        let mut measurements = GroupMeasurements::default();
        for (chunk_edges, partial) in yielded {
            edges.extend(chunk_edges);
            measurements.pruned += partial.pruned;
            measurements.retained_mass += partial.retained_mass;
            measurements.pruned_mass += partial.pruned_mass;
        }
        (edges, measurements)
    };

    (AttractionGroup::new(relation, weights, edges), measurements)
}

/// One group column of endpoint rows.
///
/// The rows ascend, with the running share total ahead of every position. A row's degree is the
/// share sum over its run, read as a prefix difference. Lookups stay binary searches.
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
///
/// Every instance writes its protection record - pruning-exempt - and the instances the pruning
/// predicate retains emit attraction edges.
fn emit_chunk<N, E>(
    chunk: &[RelationInstance<N, E>],
    records: &mut [ProtectionRecord<N>],
    sources: &DegreeColumn,
    targets: &DegreeColumn,
    factors: GroupFactors,
    attraction: AttractionOptions,
) -> (Vec<AttractionEdge<N, E>>, GroupMeasurements)
where
    N: Id,
    E: Id,
{
    let mut edges = Vec::with_capacity(chunk.len());
    let mut measurements = GroupMeasurements::default();
    for (instance, record) in chunk.iter().zip(records) {
        let confidence = instance.confidence.effective();

        // value · a ≤ value exactly: multiplying a non-negative f32 by a factor ∈ [0, 1] cannot
        // round above it, so every record keeps `discounted ≤ undiscounted`, and taking the maximum
        // over records keeps that ordering.
        let value = confidence.value() * factors.positive;
        *record = ProtectionRecord {
            pair: instance.pair(),
            discounted: value * factors.applicability,
            undiscounted: value,
        };

        let share = f64::from(instance.multiplicity.max(1)).recip();
        let mass = confidence.value()
            * factors.scale
            * narrow_f32(share).expect("a positive count's reciprocal is in (0, 1]");
        if mass < attraction.pruning_threshold() {
            measurements.pruned += 1;
            measurements.pruned_mass += f64::from(mass);
            continue;
        }

        let normalization = {
            // A row's degree spans both columns: it may source some
            // edges and receive others.
            let degree = |row: u64| sources.degree(row) + targets.degree(row);
            let source = degree(instance.source.as_u64());
            let target = degree(instance.target.as_u64());
            narrow_f32(((1.0 + source) * (1.0 + target)).sqrt().recip() * share)
                .expect("a product of factors in (0, 1] is in (0, 1]")
        };

        edges.push(AttractionEdge {
            edge: instance.edge,
            source: instance.source,
            target: instance.target,
            confidence,
            normalization,
        });
        measurements.retained_mass += f64::from(mass);
    }

    (edges, measurements)
}
