//! Deterministic, datasource-neutral relation-example selection.
//!
//! Adapters remain responsible for acquiring candidates, deciding which
//! candidates are semantically eligible, and assigning them to ordered
//! strata. This module handles the mechanics shared by relation-card
//! sources:
//!
//! 1. order each stratum by recognizability while interleaving subgroups;
//! 2. guarantee every non-empty stratum a slot, then deal capped rounds;
//! 3. relax the cap when otherwise-unused budget remains;
//! 4. reject candidates that reuse either endpoint or an adapter-defined conflict token anywhere on
//!    the card; and
//! 5. redistribute slots lost to endpoint conflicts.
//!
//! Input order is the final deterministic tie-break throughout. Selected
//! examples are returned grouped in stratum declaration order, matching
//! the order used by the canonical card renderer.

use core::num::NonZeroUsize;
use std::collections::HashSet;

/// Per-stratum slot ceiling applied before cap relaxation.
pub(crate) const DEFAULT_STRATUM_SLOT_CAP: NonZeroUsize =
    NonZeroUsize::new(3).expect("the default slot cap is non-zero");

/// One adapter-owned candidate annotated for common selection.
#[derive(Debug, Clone)]
pub(crate) struct ExampleCandidate<Payload, Subgroup> {
    pub payload: Payload,
    pub subject_token: String,
    pub object_token: String,
    pub subgroup: Subgroup,
    // f64 mirrors the Python float, so recognizability orderings computed by
    // existing adapters reproduce exactly.
    pub recognizability: f64,
    /// Text-level conflict tokens that endpoint identity does not capture,
    /// such as duplicate rendered pairs across separate tenants.
    pub additional_conflict_tokens: Vec<String>,
}

/// An ordered semantic stratum and its eligible candidate pool.
#[derive(Debug, Clone)]
pub(crate) struct ExampleStratum<Stratum, Payload, Subgroup> {
    pub key: Stratum,
    pub candidates: Vec<ExampleCandidate<Payload, Subgroup>>,
}

/// An adapter payload selected for one semantic stratum.
#[derive(Debug, Clone)]
pub(crate) struct SelectedExample<Stratum, Payload> {
    pub stratum: Stratum,
    pub payload: Payload,
}

/// Selects a bounded, diverse, endpoint-disjoint example set.
///
/// Empty strata do not consume guaranteed slots, and `count` may be zero.
/// Invalid budgets are unrepresentable: `count` is unsigned and `slot_cap`
/// is non-zero.
pub(crate) fn select_diverse_examples<Stratum, Payload, Subgroup>(
    strata: Vec<ExampleStratum<Stratum, Payload, Subgroup>>,
    count: usize,
    slot_cap: NonZeroUsize,
) -> Vec<SelectedExample<Stratum, Payload>>
where
    Stratum: Clone,
    Subgroup: PartialEq,
{
    let mut selection_state: Vec<_> = strata
        .into_iter()
        .filter(|stratum| !stratum.candidates.is_empty())
        .map(|stratum| SelectionStratum {
            key: stratum.key,
            order: scale_diverse_order(stratum.candidates),
            pointer: 0,
            picks: Vec::new(),
        })
        .collect();
    select_from_strata(&mut selection_state, count, slot_cap.get());

    let mut selected = Vec::new();
    for stratum in selection_state {
        let key = stratum.key;
        // Picks record strictly increasing order indices, so one forward walk
        // moves every selected payload out in pick order.
        let mut picks = stratum.picks.into_iter().peekable();
        for (index, candidate) in stratum.order.into_iter().enumerate() {
            if picks.peek() == Some(&index) {
                picks.next();
                selected.push(SelectedExample {
                    stratum: key.clone(),
                    payload: candidate.payload,
                });
            }
        }
    }
    selected
}

/// Puts the strongest candidate first, interleaving subgroups thereafter.
fn scale_diverse_order<Payload, Subgroup: PartialEq>(
    pool: Vec<ExampleCandidate<Payload, Subgroup>>,
) -> Vec<ExampleCandidate<Payload, Subgroup>> {
    let total = pool.len();
    let mut groups: Vec<Vec<(usize, ExampleCandidate<Payload, Subgroup>)>> = Vec::new();
    for (arrival, candidate) in pool.into_iter().enumerate() {
        if let Some(members) = groups.iter_mut().find(|members| {
            members
                .first()
                .is_some_and(|(_, member)| member.subgroup == candidate.subgroup)
        }) {
            members.push((arrival, candidate));
        } else {
            groups.push(vec![(arrival, candidate)]);
        }
    }

    for members in &mut groups {
        members.sort_by(|left, right| {
            right
                .1
                .recognizability
                .total_cmp(&left.1.recognizability)
                .then_with(|| left.0.cmp(&right.0))
        });
    }
    groups.sort_by(|left, right| {
        let (left_arrival, left_head) = &left[0];
        let (right_arrival, right_head) = &right[0];
        right_head
            .recognizability
            .total_cmp(&left_head.recognizability)
            .then_with(|| left_arrival.cmp(right_arrival))
    });

    let mut columns: Vec<_> = groups.into_iter().map(Vec::into_iter).collect();
    let mut order = Vec::with_capacity(total);
    loop {
        let mut advanced = false;
        for column in &mut columns {
            if let Some((_, candidate)) = column.next() {
                order.push(candidate);
                advanced = true;
            }
        }
        if !advanced {
            return order;
        }
    }
}

#[derive(Debug)]
struct SelectionStratum<Stratum, Payload, Subgroup> {
    key: Stratum,
    order: Vec<ExampleCandidate<Payload, Subgroup>>,
    pointer: usize,
    picks: Vec<usize>,
}

impl<Stratum, Payload, Subgroup> SelectionStratum<Stratum, Payload, Subgroup> {
    #[inline]
    const fn volume(&self) -> usize {
        self.order.len()
    }

    /// Advances past endpoint conflicts and takes one candidate, if possible.
    fn take(&mut self, used_tokens: &mut HashSet<String>) -> bool {
        while let Some(candidate) = self.order.get(self.pointer) {
            let index = self.pointer;
            self.pointer += 1;

            let conflict_tokens = [&candidate.subject_token, &candidate.object_token]
                .into_iter()
                .chain(&candidate.additional_conflict_tokens);
            if conflict_tokens
                .clone()
                .any(|token| used_tokens.contains(token))
            {
                continue;
            }

            used_tokens.extend(conflict_tokens.cloned());
            self.picks.push(index);
            return true;
        }
        false
    }
}

/// Allocates guaranteed, capped, then relaxed slots in stratum order.
fn allocate_slots<Stratum, Payload, Subgroup>(
    strata: &[SelectionStratum<Stratum, Payload, Subgroup>],
    count: usize,
    slot_cap: usize,
) -> Vec<usize> {
    let mut budget = count;
    let mut slots = vec![0_usize; strata.len()];
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
            for (allocation, stratum) in slots.iter_mut().zip(strata) {
                if budget == 0 {
                    break;
                }
                let limit = ceiling
                    .map_or_else(|| stratum.volume(), |ceiling| ceiling.min(stratum.volume()));
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

/// Refills endpoint-dedup shortfalls round-robin across all strata.
fn redistribute_shortfall<Stratum, Payload, Subgroup>(
    strata: &mut [SelectionStratum<Stratum, Payload, Subgroup>],
    count: usize,
    used_tokens: &mut HashSet<String>,
) {
    let mut total: usize = strata.iter().map(|stratum| stratum.picks.len()).sum();
    while total < count {
        let mut progressed = false;
        for stratum in &mut *strata {
            if total == count {
                break;
            }
            if stratum.take(used_tokens) {
                total += 1;
                progressed = true;
            }
        }
        if !progressed {
            break;
        }
    }
}

fn select_from_strata<Stratum, Payload, Subgroup>(
    strata: &mut [SelectionStratum<Stratum, Payload, Subgroup>],
    count: usize,
    slot_cap: usize,
) {
    let mut used_tokens = HashSet::new();
    let slots = allocate_slots(strata, count, slot_cap);

    for (stratum, allocation) in strata.iter_mut().zip(slots) {
        for _ in 0..allocation {
            if !stratum.take(&mut used_tokens) {
                break;
            }
        }
    }

    redistribute_shortfall(strata, count, &mut used_tokens);
}
