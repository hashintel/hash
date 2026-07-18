//! Deterministic, datasource-neutral relation-example selection.
//!
//! Adapters remain responsible for acquiring candidates, deciding which
//! candidates are semantically eligible, and assigning them to ordered
//! groups. This module handles the mechanics shared by relation-card
//! sources:
//!
//! 1. order each group by recognizability while interleaving subgroups;
//! 2. guarantee every non-empty group a slot, then deal capped rounds;
//! 3. relax the cap when otherwise-unused budget remains;
//! 4. reject candidates that reuse either endpoint or an adapter-defined conflict token anywhere on
//!    the card; and
//! 5. redistribute slots lost to endpoint conflicts.
//!
//! Input order is the final deterministic tie-break throughout. Selected
//! examples are returned grouped in group declaration order, matching the
//! order used by the canonical card renderer.

use alloc::{
    alloc::{Allocator, Global},
    borrow::Cow,
};
use core::num::NonZero;
use std::collections::HashSet;

/// Per-group slot ceiling applied before cap relaxation.
pub(crate) const DEFAULT_GROUP_SLOT_CAP: NonZero<usize> =
    NonZero::new(3).expect("the default slot cap is non-zero");

/// One adapter-owned candidate annotated for common selection.
pub(crate) struct Candidate<'text, P, S, A: Allocator = Global> {
    pub payload: P,
    /// The source endpoint's identity token; two candidates sharing it
    /// never appear on one card.
    pub source: Cow<'text, str>,
    /// The target endpoint's identity token, under the same exclusion.
    pub target: Cow<'text, str>,
    pub subgroup: S,
    /// Adapter-scored prominence; higher values are selected first.
    pub recognizability: f64,
    /// Text-level conflict tokens that endpoint identity does not
    /// capture, such as duplicate rendered pairs across separate tenants.
    pub conflicts: Vec<Cow<'text, str>, A>,
}

impl<P, S, A: Allocator> Candidate<'_, P, S, A> {
    /// Iterates every token the candidate claims when selected.
    fn tokens(&self) -> impl Iterator<Item = &str> {
        [self.source.as_ref(), self.target.as_ref()]
            .into_iter()
            .chain(self.conflicts.iter().map(Cow::as_ref))
    }
}

/// An ordered semantic group and its eligible candidate pool.
pub(crate) struct Group<'text, K, P, S, A: Allocator = Global> {
    pub key: K,
    pub candidates: Vec<Candidate<'text, P, S, A>, A>,
}

/// An adapter payload selected for one semantic group.
pub(crate) struct Selected<K, P> {
    pub group: K,
    pub payload: P,
}

/// Selects a bounded, diverse, endpoint-disjoint example set.
///
/// Empty groups do not consume guaranteed slots, and `count` may be zero.
/// Invalid budgets are unrepresentable: `count` is unsigned and
/// `slot_cap` is non-zero.
pub(crate) fn select_diverse_examples<K, P, S, A>(
    groups: Vec<Group<'_, K, P, S, A>, A>,
    count: usize,
    slot_cap: NonZero<usize>,
) -> Vec<Selected<K, P>, A>
where
    K: Clone,
    S: PartialEq,
    A: Allocator + Clone,
{
    let alloc = groups.allocator().clone();
    let mut pools = Vec::new_in(alloc.clone());
    pools.extend(
        groups
            .into_iter()
            .filter(|group| !group.candidates.is_empty())
            .map(|group| (group.key, diverse_order(group.candidates))),
    );

    // Pick state lives apart from the pools: the used-token set borrows
    // from the candidates, which therefore never move or mutate until the
    // final extraction.
    let mut cursors = Vec::new_in(alloc.clone());
    cursors.resize(pools.len(), 0_usize);
    let mut picks = Vec::new_in(alloc.clone());
    picks.resize_with(pools.len(), || Vec::new_in(alloc.clone()));
    let mut used: HashSet<&str> = HashSet::new();

    let slots = allocate_slots(&pools, count, slot_cap.get(), alloc.clone());
    for (pool, allocation) in slots.into_iter().enumerate() {
        for _ in 0..allocation {
            if !take(&pools, pool, &mut cursors, &mut picks, &mut used) {
                break;
            }
        }
    }

    // Refill endpoint-dedup shortfalls round-robin across all groups.
    let mut total: usize = picks.iter().map(Vec::len).sum();
    'refill: while total < count {
        let mut progressed = false;
        for pool in 0..pools.len() {
            if total == count {
                break 'refill;
            }

            if take(&pools, pool, &mut cursors, &mut picks, &mut used) {
                total += 1;
                progressed = true;
            }
        }

        if !progressed {
            break;
        }
    }
    drop(used);

    let mut selected = Vec::with_capacity_in(total, alloc);
    for ((key, candidates), picks) in pools.into_iter().zip(picks) {
        // Picks record strictly increasing order indices, so one forward
        // walk moves every selected payload out in pick order.
        let mut picks = picks.into_iter().peekable();
        for (index, candidate) in candidates.into_iter().enumerate() {
            if picks.peek() == Some(&index) {
                picks.next();
                selected.push(Selected {
                    group: key.clone(),
                    payload: candidate.payload,
                });
            }
        }
    }
    selected
}

/// One group's key and its diversity-ordered candidate pool.
type Pool<'text, K, P, S, A> = (K, Vec<Candidate<'text, P, S, A>, A>);

/// Advances one pool past conflicts and claims one candidate, if possible.
fn take<'pool, K, P, S, A: Allocator>(
    pools: &'pool [Pool<'_, K, P, S, A>],
    pool: usize,
    cursors: &mut [usize],
    picks: &mut [Vec<usize, A>],
    used: &mut HashSet<&'pool str>,
) -> bool {
    let candidates = &pools[pool].1;
    while let Some(candidate) = candidates.get(cursors[pool]) {
        let index = cursors[pool];
        cursors[pool] += 1;

        if candidate.tokens().any(|token| used.contains(token)) {
            continue;
        }

        used.extend(candidate.tokens());
        picks[pool].push(index);
        return true;
    }

    false
}

/// Allocates guaranteed, capped, then relaxed slots in group order.
fn allocate_slots<K, P, S, A: Allocator>(
    pools: &[Pool<'_, K, P, S, A>],
    count: usize,
    slot_cap: usize,
    alloc: A,
) -> Vec<usize, A> {
    let mut budget = count;
    let mut slots = Vec::new_in(alloc);
    slots.resize(pools.len(), 0_usize);
    for allocation in &mut slots {
        if budget == 0 {
            break;
        }

        *allocation = 1;
        budget -= 1;
    }

    for ceiling in [Some(slot_cap), None] {
        while budget > 0 {
            let mut progressed = false;
            for (allocation, (_, candidates)) in slots.iter_mut().zip(pools) {
                if budget == 0 {
                    break;
                }

                let limit =
                    ceiling.map_or(candidates.len(), |ceiling| ceiling.min(candidates.len()));
                if *allocation < limit {
                    *allocation += 1;
                    budget -= 1;
                    progressed = true;
                }
            }

            if !progressed {
                break;
            }
        }
    }

    slots
}

/// Puts the strongest candidate first, interleaving subgroups thereafter.
fn diverse_order<P, S, A>(
    candidates: Vec<Candidate<'_, P, S, A>, A>,
) -> Vec<Candidate<'_, P, S, A>, A>
where
    S: PartialEq,
    A: Allocator + Clone,
{
    let alloc = candidates.allocator().clone();

    // Subgroup membership as arrival-index lists; the candidates
    // themselves never move until the final permutation.
    let mut members: Vec<Vec<usize, A>, A> = Vec::new_in(alloc.clone());
    for (arrival, candidate) in candidates.iter().enumerate() {
        if let Some(subgroup) = members
            .iter_mut()
            .find(|list| candidates[list[0]].subgroup == candidate.subgroup)
        {
            subgroup.push(arrival);
        } else {
            let mut list = Vec::new_in(alloc.clone());
            list.push(arrival);
            members.push(list);
        }
    }

    // Orders `left` before `right` on higher recognizability, then on
    // earlier arrival.
    let stronger_first = |left: usize, right: usize| {
        candidates[right]
            .recognizability
            .total_cmp(&candidates[left].recognizability)
            .then_with(|| left.cmp(&right))
    };
    for list in &mut members {
        list.sort_unstable_by(|&left, &right| stronger_first(left, right));
    }
    members.sort_by(|left, right| stronger_first(left[0], right[0]));

    // Round-robin over the subgroups yields the interleaved rank of every
    // arrival index; sorting by rank is the final permutation.
    let mut rank = Vec::new_in(alloc.clone());
    rank.resize(candidates.len(), 0_usize);
    let mut next = 0;
    let mut round = 0;
    while next < candidates.len() {
        for list in &members {
            if let Some(&arrival) = list.get(round) {
                rank[arrival] = next;
                next += 1;
            }
        }
        round += 1;
    }

    let mut ranked = Vec::with_capacity_in(candidates.len(), alloc);
    ranked.extend(rank.into_iter().zip(candidates));
    ranked.sort_unstable_by_key(|&(rank, _)| rank);

    let alloc = ranked.allocator().clone();
    let mut ordered = Vec::with_capacity_in(ranked.len(), alloc);
    ordered.extend(ranked.into_iter().map(|(_, candidate)| candidate));
    ordered
}
