//! Validation-group derivation: leakage axes, near-duplication, and budgeted subdivision.
//!
//! Rows that could leak shared content across a train/validation split must share a group; the
//! union runs over value-keyed leakage axes and near-duplicate pairs, and over-budget components
//! subdivide by relaxing their weakest axes in information order. The target and weight arithmetic
//! lives here beside the grouping because both read the same vote counts.

use std::collections::{HashMap, HashSet, hash_map::Entry};

use hashql_core::id::Id as _;

use super::{
    super::{Card, VoteCounts},
    AssemblyConfig, AssemblyEvidence, DIRICHLET_ALPHA, NEAR_DUPLICATE_CEILING_FRACTION, Relaxation,
};
use crate::{
    disjoint::DisjointSet,
    identity::OntologyRowId,
    integrity::{Sha256, Sha256Digest, Update as _},
    salt::{embedding::CardEmbeddingView, policy::GeometryClass},
};

hashql_core::id::newtype! {
    /// A row's dense position within one partitioned subset.
    ///
    /// The disjoint-set domain of one [`partition`] call: subset positions, not corpus rows. The
    /// key exists so a subset position and the `u32` row encodings it groups cannot stand in for
    /// one another.
    #[id(const)]
    struct SubsetRowId(u32)
}

/// Returns the card's geometry-vote total as the row weight.
#[expect(
    clippy::cast_precision_loss,
    reason = "vote counts are far below f64's 2^53 exact-integer range"
)]
pub(super) fn weight(counts: &VoteCounts) -> f64 {
    counts.weight() as f64
}

/// Returns the Dirichlet posterior-mean target over the geometry classes.
#[expect(
    clippy::cast_precision_loss,
    reason = "vote counts and the class count are far below f64's 2^53 exact-integer range"
)]
pub(super) fn dirichlet_target(counts: &VoteCounts) -> [f64; GeometryClass::COUNT] {
    let total = (GeometryClass::COUNT as f64).mul_add(DIRICHLET_ALPHA, weight(counts));

    counts
        .geometry
        .map(|count| (count as f64 + DIRICHLET_ALPHA) / total)
}

/// One trained row's interned axis values.
struct RowAxes {
    /// The row's own identity and every inverse identity it names.
    identity: Vec<u32>,
    /// The relation family.
    family: u32,
    /// The base URL.
    base: u32,
}

/// Which axis ranks a partition unites through.
///
/// Beside the identity axis and the near-duplicate pairs it always honours.
#[derive(Copy, Clone)]
struct Ranks {
    family: bool,
    base: bool,
    /// The inclusive cosine-distance cut for near-duplicate pairs.
    cut: f64,
}

impl Ranks {
    /// Every axis at full strength.
    const ALL: Self = Self {
        family: true,
        base: true,
        cut: f64::INFINITY,
    };
}

/// Unites a row subset through the admitted axis ranks and returns the resulting parts.
///
/// Members ascending, parts ordered by first member.
fn partition(
    subset: &[u32],
    axes: &[RowAxes],
    pairs: &[(u32, u32, f64)],
    ranks: Ranks,
) -> Vec<Vec<u32>> {
    let mut local_of: HashMap<u32, SubsetRowId> = HashMap::with_capacity(subset.len());
    for (local, &row) in subset.iter().enumerate() {
        local_of.insert(row, SubsetRowId::from_usize(local));
    }

    let mut components: DisjointSet<SubsetRowId> = DisjointSet::new(subset.len());
    let mut first_of_key: HashMap<u32, SubsetRowId> = HashMap::new();
    for (local, &row) in subset.iter().enumerate() {
        let local = SubsetRowId::from_usize(local);
        let row_axes = &axes[row as usize];

        let mut join = |key: u32| match first_of_key.entry(key) {
            Entry::Occupied(first) => {
                components.unite(local, *first.get());
            }
            Entry::Vacant(slot) => {
                slot.insert(local);
            }
        };

        for &key in &row_axes.identity {
            join(key);
        }
        if ranks.family {
            join(row_axes.family);
        }
        if ranks.base {
            join(row_axes.base);
        }
    }

    for (left, right, distance) in pairs {
        if *distance <= ranks.cut
            && let (Some(&left), Some(&right)) = (local_of.get(left), local_of.get(right))
        {
            components.unite(left, right);
        }
    }

    let mut parts: Vec<Vec<u32>> = Vec::new();
    let mut part_of_representative: HashMap<SubsetRowId, usize> = HashMap::new();
    for (local, &row) in subset.iter().enumerate() {
        let local = SubsetRowId::from_usize(local);
        let representative = components.find(local);
        let part = *part_of_representative
            .entry(representative)
            .or_insert_with(|| {
                parts.push(Vec::new());
                parts.len() - 1
            });
        parts[part].push(row);
    }

    parts
}

/// Cuts a component's near-duplicate edges farthest-first.
///
/// The kept cut is the largest distance under which every resulting part fits the budget, or the
/// empty cut when none does.
#[expect(
    clippy::cast_precision_loss,
    reason = "group sizes are far below f64's 2^53 exact-integer range"
)]
fn farthest_first_cut(
    component: &[u32],
    axes: &[RowAxes],
    pairs: &[(u32, u32, f64)],
    budget: f64,
) -> Vec<Vec<u32>> {
    // Candidate cuts are the distinct pair distances inside the
    // component, ascending; a cut keeps every pair at or under it.
    let mut distances: Vec<f64> = {
        let members: HashSet<u32> = component.iter().copied().collect();
        pairs
            .iter()
            .filter(|(left, right, _)| members.contains(left) && members.contains(right))
            .map(|&(_, _, distance)| distance)
            .collect()
    };
    distances.sort_unstable_by(f64::total_cmp);
    distances.dedup();

    let fits = |cut: f64| {
        partition(
            component,
            axes,
            pairs,
            Ranks {
                family: false,
                base: false,
                cut,
            },
        )
        .iter()
        .all(|part| (part.len() as f64) <= budget)
    };

    // Component size is monotone in the cut, so the fitting prefix of
    // the candidate list is contiguous and binary-searchable.
    let (mut fitting, mut exceeded) = (None, distances.len());
    let mut low = 0;
    while low < exceeded {
        let middle = usize::midpoint(low, exceeded);
        if fits(distances[middle]) {
            fitting = Some(distances[middle]);
            low = middle + 1;
        } else {
            exceeded = middle;
        }
    }

    // The empty cut keeps identity edges alone; the caller records
    // any part still over budget.
    partition(
        component,
        axes,
        pairs,
        Ranks {
            family: false,
            base: false,
            cut: fitting.unwrap_or(f64::NEG_INFINITY),
        },
    )
}

/// Splits an over-budget component by relaxing its weakest remaining axis.
///
/// Recurses one rank deeper wherever a part stays over budget.
///
/// The relaxation order is family, then base URL, then near-duplicate edges farthest-first;
/// identity edges never relax. A part the deepest relaxation cannot fit is accepted over budget and
/// counted in the evidence.
#[expect(
    clippy::cast_precision_loss,
    reason = "group sizes are far below f64's 2^53 exact-integer range"
)]
fn subdivide(
    component: &[u32],
    level: Relaxation,
    axes: &[RowAxes],
    pairs: &[(u32, u32, f64)],
    budget: f64,
    evidence: &mut AssemblyEvidence,
) -> Vec<Vec<u32>> {
    evidence.deepest_relaxation = evidence.deepest_relaxation.max(level);

    let (parts, deeper) = match level {
        Relaxation::None => unreachable!("subdivision engages at the family rank"),
        Relaxation::Family => (
            partition(
                component,
                axes,
                pairs,
                Ranks {
                    family: false,
                    ..Ranks::ALL
                },
            ),
            Relaxation::Base,
        ),
        Relaxation::Base => (
            partition(
                component,
                axes,
                pairs,
                Ranks {
                    family: false,
                    base: false,
                    ..Ranks::ALL
                },
            ),
            Relaxation::NearDuplicate,
        ),
        Relaxation::NearDuplicate => {
            let parts = farthest_first_cut(component, axes, pairs, budget);
            evidence.oversized_accepted += parts
                .iter()
                .filter(|part| (part.len() as f64) > budget)
                .count();

            return parts;
        }
    };

    let mut groups = Vec::with_capacity(parts.len());
    for part in parts {
        if (part.len() as f64) <= budget {
            groups.push(part);
        } else {
            groups.extend(subdivide(&part, deeper, axes, pairs, budget, evidence));
        }
    }

    groups
}

/// The derived near-duplicate boundary with its grounds.
struct NearDuplicateBoundary {
    /// The cosine-distance threshold under which two rows join; zero when no void was found.
    epsilon: f64,
    /// The winning void's edges; zeros when no void was found.
    void: [f64; 2],
    /// The search region's top: the median pairwise distance scaled by the fraction.
    ceiling: f64,
}

/// Derives the near-duplicate boundary from every pairwise cosine distance.
///
/// Sorts the distances and scans `(0, ceiling]` for the widest multiplicative void between
/// consecutive distances, the trailing void up to the ceiling included and the leading gap from
/// zero excluded; the boundary is the winning void's geometric midpoint, maximally far from the
/// evidence on both sides, and ties keep the lowest void so a near-duplicate stays near. Exact
/// coincidences (distances ≤ 0 after rounding) join under any non-negative boundary and carry no
/// void evidence, and an empty region - no low tail below the ceiling - derives a zero boundary:
/// no duplicate structure, no near-duplicate edges.
fn near_duplicate_boundary(mut distances: Vec<f64>) -> NearDuplicateBoundary {
    if distances.is_empty() {
        return NearDuplicateBoundary {
            epsilon: 0.0,
            void: [0.0; 2],
            ceiling: 0.0,
        };
    }

    distances.sort_unstable_by(f64::total_cmp);
    let ceiling = distances[usize::midpoint(0, distances.len())] * NEAR_DUPLICATE_CEILING_FRACTION;
    if !ceiling.is_finite() {
        return NearDuplicateBoundary {
            epsilon: 0.0,
            void: [0.0; 2],
            ceiling,
        };
    }

    let low = distances.partition_point(|distance| distance.total_cmp(&0.0).is_le());
    let high = distances.partition_point(|distance| distance.total_cmp(&ceiling).is_le());
    let region = &distances[low..high];
    let Some(&last) = region.last() else {
        return NearDuplicateBoundary {
            epsilon: 0.0,
            void: [0.0; 2],
            ceiling,
        };
    };

    let mut void = None;
    let mut widest = 0.0;
    for window in region.windows(2) {
        let ratio = window[1] / window[0];
        if ratio > widest {
            void = Some([window[0], window[1]]);
            widest = ratio;
        }
    }
    if ceiling / last > widest {
        void = Some([last, ceiling]);
    }

    let void = void.unwrap_or([last, ceiling]);
    NearDuplicateBoundary {
        epsilon: (void[0] * void[1]).sqrt(),
        void,
        ceiling,
    }
}

/// Assigns every trained row its validation-group digest.
///
/// The returned digests align with `trained`; the evidence gains the group count, the derived
/// near-duplicate boundary with its grounds, and the near-duplicate pair count.
#[expect(
    clippy::cast_precision_loss,
    reason = "row and group counts are far below f64's 2^53 exact-integer range"
)]
pub(super) fn validation_groups(
    trained: &[(usize, &Card, VoteCounts)],
    view: CardEmbeddingView<'_>,
    config: AssemblyConfig,
    evidence: &mut AssemblyEvidence,
) -> Vec<Sha256Digest> {
    let rows = trained.len();

    // Value-keyed axes join cards sharing an axis value; an inverse
    // pair meets at the named identity's key whether or not that
    // identity is itself on the corpus.
    let mut keys: HashMap<String, u32> = HashMap::new();
    let mut intern = |key: String| {
        let next = u32::try_from(keys.len()).expect("the axis-value domain is bound to u32");
        *keys.entry(key).or_insert(next)
    };

    let mut axes_by_row = Vec::with_capacity(rows);
    for (_, corpus_card, _) in trained {
        let axes = &corpus_card.axes;
        let mut identity = vec![intern(format!(
            "id:{}",
            corpus_card.identity.canonical_url()
        ))];
        identity.extend(
            axes.inverse_of
                .iter()
                .map(|inverse| intern(format!("id:{inverse}"))),
        );

        axes_by_row.push(RowAxes {
            identity,
            family: intern(format!("family:{}", axes.family)),
            base: intern(format!("base:{}", axes.base_url)),
        });
    }

    // T(rows - 1) unordered pairs; the product is even, so the midpoint halves it exactly.
    let mut distances = Vec::with_capacity(usize::midpoint(0, rows * rows.saturating_sub(1)));
    for left in 0..rows {
        let embedding = view
            .embedding(OntologyRowId::from_usize(left))
            .expect("the table holds one row per trained card");

        for right in (left + 1)..rows {
            let other = view
                .embedding(OntologyRowId::from_usize(right))
                .expect("the table holds one row per trained card");

            distances.push(f64::from(embedding.cosine_distance(other)));
        }
    }

    let boundary = near_duplicate_boundary(distances.clone());

    let mut pairs = Vec::new();
    let mut pair_distances = distances.into_iter();
    for left in 0..rows {
        for right in (left + 1)..rows {
            let distance = pair_distances
                .next()
                .expect("one distance was recorded per unordered row pair");
            if distance <= boundary.epsilon {
                let node =
                    |value: usize| u32::try_from(value).expect("the row domain is bound to u32");
                pairs.push((node(left), node(right), distance));
            }
        }
    }
    evidence.near_duplicate_pairs = pairs.len();
    evidence.near_duplicate_epsilon = boundary.epsilon;
    evidence.near_duplicate_void = boundary.void;
    evidence.near_duplicate_ceiling = boundary.ceiling;

    // A single row cannot leak against itself: the budget never
    // falls under one row.
    let budget = (config.maximum_group_fraction * (rows as f64)).max(1.0);
    let all: Vec<u32> = (0..rows)
        .map(|row| u32::try_from(row).expect("the row domain is bound to u32"))
        .collect();

    let mut groups = Vec::new();
    for component in partition(&all, &axes_by_row, &pairs, Ranks::ALL) {
        if (component.len() as f64) <= budget {
            groups.push(component);
            continue;
        }

        let produced = subdivide(
            &component,
            Relaxation::Family,
            &axes_by_row,
            &pairs,
            budget,
            evidence,
        );
        if produced.len() > 1 {
            evidence.subdivided_groups += 1;
        }
        groups.extend(produced);
    }
    evidence.fold_groups = groups.len();

    // Trained rows ascend by card identity (the corpus order), so each
    // group's members are already in ascending byte order.
    let mut assigned: Vec<Option<Sha256Digest>> = vec![None; rows];
    for group in groups {
        let mut hasher = Sha256::new();
        for &row in &group {
            let (_, corpus_card, _) = &trained[row as usize];
            hasher.update(corpus_card.identity.canonical_url().as_bytes());
            hasher.update(b"\n");
        }

        let digest = hasher.finalize();
        for row in group {
            assigned[row as usize] = Some(digest);
        }
    }

    assigned
        .into_iter()
        .map(|digest| digest.expect("every trained row belongs to exactly one group"))
        .collect()
}
