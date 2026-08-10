//! Candidate census and draw expectations.
//!
//! The oracles restate the draw as a full sort over independently recollected candidate
//! domains, so the bounded selection is checked against a plain statement of the same order.
//! The subject keys are the rule's own ([`DrawRule::pair_order_key`],
//! [`DrawRule::row_order_key`]), whose encodings identity's own tests pin independently.
//!
//! [`DrawRule::pair_order_key`]: crate::salt::ladder::paired::identity::DrawRule::pair_order_key
//! [`DrawRule::row_order_key`]: crate::salt::ladder::paired::identity::DrawRule::row_order_key

use alloc::collections::BTreeSet;

use super::{CensusError, Draw, Pair, SAMPLE_CAP};
use crate::{
    file::attraction::{EdgeRecord, GroupRecord},
    identity::NodeRowId,
    salt::ladder::paired::{
        fixtures::{edge, group, node, reproducibility, rule, salt, snapshot},
        identity::DrawSalt,
    },
};

fn pair(source: u64, target: u64) -> Pair {
    Pair {
        source: node(source),
        target: node(target),
    }
}

/// An index of two Proximal-bearing groups around one Coincident-only group.
///
/// The Proximal groups duplicate one pair across groups and carry one orientation-reversed pair
/// and one self-pair. The Coincident-only group's endpoints participate without pairing. The
/// distinct Proximal pair domain is `(0,1)`, `(1,2)`, `(2,1)`, `(5,6)`, and `(6,6)`, and the
/// participant set is rows `0..=6`.
fn mixed_index() -> (Vec<GroupRecord>, Vec<EdgeRecord>) {
    (
        vec![group(3, 0, 1.0), group(5, 3, 0.0), group(9, 5, 0.25)],
        vec![
            edge(0, 1),
            edge(1, 2),
            edge(2, 1),
            edge(3, 4),
            edge(4, 5),
            edge(1, 2),
            edge(5, 6),
            edge(6, 6),
        ],
    )
}

/// Restates the pair draw as a full sort: gate, dedup, key, prefix.
fn oracle_pairs(
    salt: DrawSalt,
    groups: &[GroupRecord],
    edges: &[EdgeRecord],
    cap: usize,
) -> (u64, Vec<Pair>) {
    let mut domain = BTreeSet::new();
    for (index, group) in groups.iter().enumerate() {
        if group.proximal.get() > 0.0 {
            let start = usize::try_from(group.first_edge.get())
                .expect("the fixture ranges should be small");
            let end = groups.get(index + 1).map_or(edges.len(), |next| {
                usize::try_from(next.first_edge.get()).expect("the fixture ranges should be small")
            });
            for edge in &edges[start..end] {
                domain.insert((edge.source.get(), edge.target.get()));
            }
        }
    }

    let candidates = domain.len() as u64;
    let mut keyed: Vec<_> = domain
        .into_iter()
        .map(|(source, target)| {
            (
                rule().pair_order_key(salt, node(source), node(target)),
                source,
                target,
            )
        })
        .collect();
    keyed.sort_unstable();
    keyed.truncate(cap);

    (
        candidates,
        keyed
            .into_iter()
            .map(|(_key, source, target)| pair(source, target))
            .collect(),
    )
}

/// Restates the control draw as a full sort over the nonparticipant complement.
fn oracle_controls(
    salt: DrawSalt,
    rows: u64,
    edges: &[EdgeRecord],
    cap: usize,
) -> (u64, Vec<NodeRowId>) {
    let participants: BTreeSet<u64> = edges
        .iter()
        .flat_map(|edge| [edge.source.get(), edge.target.get()])
        .collect();

    let mut keyed: Vec<_> = (0..rows)
        .filter(|row| !participants.contains(row))
        .map(|value| (rule().row_order_key(salt, node(value)), value))
        .collect();
    let candidates = keyed.len() as u64;
    keyed.sort_unstable();
    keyed.truncate(cap);

    (
        candidates,
        keyed.into_iter().map(|(_key, value)| node(value)).collect(),
    )
}

#[test]
fn the_draw_matches_the_full_sort_oracle() {
    let salt = salt();
    let (groups, edges) = mixed_index();
    let rows = 13;

    let draw =
        Draw::over(rule(), salt, rows, &groups, &edges).expect("the fixture index is well-formed");

    let (pair_candidates, pairs) = oracle_pairs(salt, &groups, &edges, SAMPLE_CAP);
    assert_eq!(
        pair_candidates, 5,
        "the pair domain dedups across groups and keeps orientation",
    );
    assert_eq!(draw.pair_candidates(), pair_candidates);
    assert_eq!(draw.pairs(), pairs, "the drawn pairs keep keyed order");

    let mut selected = draw.pairs().to_vec();
    selected.sort_unstable();
    assert_eq!(
        selected,
        [pair(0, 1), pair(1, 2), pair(2, 1), pair(5, 6), pair(6, 6)],
        "a thin pool draws the whole hand-derived domain",
    );

    let (control_candidates, controls) = oracle_controls(salt, rows, &edges, pairs.len());
    assert_eq!(control_candidates, 6, "rows 7..13 are nonparticipants");
    assert_eq!(draw.control_candidates(), control_candidates);
    assert_eq!(draw.controls(), controls, "the drawn rows keep keyed order");
    assert_eq!(
        draw.controls().len(),
        5,
        "m = min(Q, n) with Q = 6 and n = 5"
    );
    assert!(
        draw.controls().iter().all(|&row| row >= node(7)),
        "every endpoint of any force class stays out of the control domain",
    );
}

#[test]
fn a_thin_control_pool_draws_whole() {
    let salt = salt();
    let (groups, edges) = mixed_index();

    let draw =
        Draw::over(rule(), salt, 9, &groups, &edges).expect("the fixture index is well-formed");

    let (control_candidates, controls) = oracle_controls(salt, 9, &edges, draw.pairs().len());
    assert_eq!(control_candidates, 2, "rows 7 and 8 are the whole pool");
    assert_eq!(draw.control_candidates(), control_candidates);
    assert_eq!(draw.controls(), controls);
    assert_eq!(draw.controls().len(), 2, "m = Q when Q falls below n");
}

#[test]
fn an_empty_pair_domain_draws_no_controls() {
    let groups = vec![group(3, 0, 0.0)];
    let edges = vec![edge(0, 1), edge(1, 2)];

    let draw =
        Draw::over(rule(), salt(), 10, &groups, &edges).expect("the fixture index is well-formed");

    assert_eq!(draw.pair_candidates(), 0);
    assert!(draw.pairs().is_empty());
    assert_eq!(
        draw.control_candidates(),
        0,
        "the P = 0 outcome constructs no control population",
    );
    assert!(draw.controls().is_empty());
    assert!(draw.anchors().is_empty());
}

#[test]
fn saturated_participation_draws_pairs_and_zero_controls() {
    let groups = vec![group(3, 0, 1.0)];
    let edges = vec![edge(0, 1)];

    let draw =
        Draw::over(rule(), salt(), 2, &groups, &edges).expect("the fixture index is well-formed");

    assert_eq!(draw.pair_candidates(), 1);
    assert_eq!(draw.pairs(), [pair(0, 1)]);
    assert_eq!(
        draw.control_candidates(),
        0,
        "Q = 0 while P > 0 measures pairs and leaves no controls",
    );
    assert!(draw.controls().is_empty());
}

#[test]
fn the_cap_bounds_the_pair_draw() {
    let salt = salt();
    let count = SAMPLE_CAP as u64 + 1;
    let groups = vec![group(3, 0, 1.0)];
    let edges: Vec<EdgeRecord> = (0..count).map(|index| edge(index, index + 1)).collect();
    let rows = count + 42;

    let draw =
        Draw::over(rule(), salt, rows, &groups, &edges).expect("the fixture index is well-formed");

    let (pair_candidates, pairs) = oracle_pairs(salt, &groups, &edges, SAMPLE_CAP);
    assert_eq!(pair_candidates, count, "one candidate past the cap");
    assert_eq!(draw.pair_candidates(), pair_candidates);
    assert_eq!(
        draw.pairs().len(),
        SAMPLE_CAP,
        "n = SAMPLE_CAP when P exceeds it"
    );
    assert_eq!(draw.pairs(), pairs);

    let (control_candidates, controls) = oracle_controls(salt, rows, &edges, draw.pairs().len());
    assert_eq!(
        control_candidates, 41,
        "rows past the endpoint run are the pool"
    );
    assert_eq!(draw.control_candidates(), control_candidates);
    assert_eq!(draw.controls(), controls);

    // At the cap exactly, the draw is the whole domain.
    let at_cap = &edges[..SAMPLE_CAP];
    let draw =
        Draw::over(rule(), salt, rows, &groups, at_cap).expect("the fixture index is well-formed");
    let (pair_candidates, pairs) = oracle_pairs(salt, &groups, at_cap, SAMPLE_CAP);
    assert_eq!(pair_candidates, SAMPLE_CAP as u64);
    assert_eq!(draw.pairs().len(), SAMPLE_CAP, "n = P at the cap boundary");
    assert_eq!(draw.pairs(), pairs);
}

#[test]
fn one_index_one_draw_and_a_rotated_salt_permutes() {
    let groups = vec![group(3, 0, 1.0)];
    let edges: Vec<EdgeRecord> = (0..48)
        .map(|index| edge(2 * index, 2 * index + 1))
        .collect();
    let rows = 128;

    let first = Draw::over(rule(), salt(), rows, &groups, &edges)
        .expect("the fixture index is well-formed");
    let second = Draw::over(rule(), salt(), rows, &groups, &edges)
        .expect("the fixture index is well-formed");
    assert_eq!(first, second, "byte-identical inputs share one draw");

    let mut grown = snapshot();
    grown.nodes += 1;
    let rotated_salt = rule()
        .derive_salt(&grown, &reproducibility())
        .expect("the grown snapshot should derive a salt");
    let rotated = Draw::over(rule(), rotated_salt, rows, &groups, &edges)
        .expect("the fixture index is well-formed");

    // Both pools are thin, so a rotated salt permutes each whole domain rather than reselecting.
    assert_ne!(
        rotated.pairs(),
        first.pairs(),
        "a rotated salt reorders the pair draw",
    );
    assert_ne!(
        rotated.controls(),
        first.controls(),
        "a rotated salt reorders the control draw",
    );

    let sorted_pairs = |draw: &Draw| {
        let mut pairs = draw.pairs().to_vec();
        pairs.sort_unstable();
        pairs
    };
    let sorted_controls = |draw: &Draw| {
        let mut controls = draw.controls().to_vec();
        controls.sort_unstable();
        controls
    };
    assert_eq!(
        sorted_pairs(&rotated),
        sorted_pairs(&first),
        "the drawn pair set is the whole domain under either salt",
    );
    assert_eq!(
        sorted_controls(&rotated),
        sorted_controls(&first),
        "the drawn control set is the whole domain under either salt",
    );
}

#[test]
fn anchors_are_the_distinct_drawn_endpoints() {
    let (groups, edges) = mixed_index();

    let draw =
        Draw::over(rule(), salt(), 13, &groups, &edges).expect("the fixture index is well-formed");

    assert_eq!(
        draw.anchors(),
        [node(0), node(1), node(2), node(5), node(6)],
        "endpoints dedup and ascend, and the self-pair contributes one anchor",
    );
}

#[test]
fn a_contradicted_group_range_is_refused() {
    let edges = vec![edge(0, 1), edge(1, 2)];

    let backwards = vec![group(3, 2, 1.0), group(5, 1, 1.0)];
    assert_eq!(
        Draw::over(rule(), salt(), 4, &backwards, &edges),
        Err(CensusError::GroupRange {
            group: 0,
            start: 2,
            end: 1,
            edges: 2,
        }),
    );

    let past_the_region = vec![group(3, 0, 1.0), group(5, 9, 1.0)];
    assert_eq!(
        Draw::over(rule(), salt(), 4, &past_the_region, &edges),
        Err(CensusError::GroupRange {
            group: 0,
            start: 0,
            end: 9,
            edges: 2,
        }),
    );
}

#[test]
fn an_out_of_domain_endpoint_is_refused() {
    let groups = vec![group(3, 0, 1.0)];
    let edges = vec![edge(0, 1), edge(1, 7)];

    assert_eq!(
        Draw::over(rule(), salt(), 7, &groups, &edges),
        Err(CensusError::Endpoint {
            edge: 1,
            row: 7,
            rows: 7,
        }),
    );
}

#[test]
fn the_cap_is_the_dkw_minimum_plus_the_margin() {
    // 2 · exp(−2 · n · ε²) ≤ δ at ε = 0.01 and δ = 10⁻⁶: exact integer minimum 72,544.
    let bound = |draws: f64| 2.0 * (-2.0 * draws * 0.01_f64.powi(2)).exp();
    assert!(bound(72_544.0) <= 1e-6, "the minimum satisfies the bound");
    assert!(
        bound(72_543.0) > 1e-6,
        "one draw below the minimum breaks the bound",
    );
    assert_eq!(
        SAMPLE_CAP,
        72_544 + 11,
        "the cap is the minimum plus the eleven-row margin",
    );
}
