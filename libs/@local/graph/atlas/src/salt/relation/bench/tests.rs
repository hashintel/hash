#![expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the hub and coverage bounds are deliberate integer fractions of the domain"
)]

use hashql_core::id::Id as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{Corpus, Profile};
use crate::{
    identity::{EdgeRowId, NodeRowId},
    math::UnitFraction,
};

const LINKS: usize = 4_096;
const SEED: u64 = 42;

fn corpus(profile: Profile) -> Corpus<NodeRowId, EdgeRowId> {
    Corpus::synthesize::<Xoshiro256PlusPlus>(profile, LINKS, SEED)
}

#[test]
fn synthesis_is_deterministic() {
    let one = corpus(Profile::Live);
    let two = corpus(Profile::Live);
    assert_eq!(one.instances(), two.instances());
}

#[test]
fn profiles_share_volume_and_domain() {
    let live = corpus(Profile::Live);
    let uniform = corpus(Profile::Uniform);
    let mega = corpus(Profile::Mega);

    for shape in [&live, &uniform, &mega] {
        assert_eq!(shape.instance_count(), LINKS * 2);
        assert_eq!(shape.links(), LINKS);
        assert_eq!(shape.rows(), 2_048);
    }
}

#[test]
fn live_base_relation_owns_half() {
    let live = corpus(Profile::Live);
    let base = live
        .instances()
        .iter()
        .filter(|instance| instance.relation.as_u64() == 0)
        .count();
    assert_eq!(base, LINKS);
}

#[test]
fn mega_concentrates_and_uniform_spreads() {
    let mega = corpus(Profile::Mega);
    assert!(
        mega.instances()
            .iter()
            .all(|instance| instance.relation.as_u64() == 0)
    );

    let uniform = corpus(Profile::Uniform);
    let mut volumes = [0_usize; 17];
    for instance in uniform.instances() {
        volumes[usize::try_from(instance.relation.as_u64()).expect("the table holds 17 types")] +=
            1;
    }
    let smallest = volumes.iter().min().expect("the table is non-empty");
    let largest = volumes.iter().max().expect("the table is non-empty");
    // Round-robin assignment leaves at most one extra pair per type.
    assert!(largest - smallest <= 2, "{volumes:?}");
}

#[test]
fn targets_are_hubbed_and_sources_are_not() {
    let live = corpus(Profile::Live);
    let mut target_volume = std::collections::HashMap::new();
    let mut sources = std::collections::HashSet::new();
    for instance in live.instances() {
        *target_volume
            .entry(instance.target.as_u64())
            .or_insert(0_usize) += 1;
        sources.insert(instance.source.as_u64());
    }

    let top = target_volume.values().max().expect("links exist");
    // The Zipf head gathers a few percent of all instances; a uniform
    // target draw over 2048 rows would put ~4 instances on each.
    assert!(*top > live.instance_count() / 50, "top hub owns {top}");
    // Sources are uniform over the domain: most rows appear.
    assert!(sources.len() > live.rows() / 2, "{} sources", sources.len());
}

#[test]
fn full_build_matches_composed_stages() {
    let live = corpus(Profile::Live);

    let mut scratch = live.scratch();
    let summary = live.build_in(&mut scratch, 0.0, 0.0);
    assert_eq!(summary.pruned_edges, 0);
    assert_eq!(summary.omitted_mass_fraction, UnitFraction::ZERO);

    // The isolated stages run over the same corpus without panicking
    // and the sorts agree with the full build's proper split.
    let mut sorting = live.scratch();
    let proper = sorting.sort_by_group();
    assert_eq!(proper, live.grouped().len());
    assert_eq!(summary.retained_edges, proper);

    live.emit_groups(super::production_chunk());
    let mut records = live.records_scratch();
    live.assemble_protection(&mut records);
}

#[test]
fn pruning_sweep_is_monotone() {
    let live = corpus(Profile::Live);

    let mut previous_retained = usize::MAX;
    let mut previous_omitted = UnitFraction::ZERO;
    for threshold in [0.0, 0.125, 0.5, 0.9] {
        let mut scratch = live.scratch();
        let summary = live.build_in(&mut scratch, 0.0, threshold);
        assert_eq!(
            summary.retained_edges + summary.pruned_edges,
            live.instance_count() - summary_self_references(&live),
        );
        assert!(summary.retained_edges <= previous_retained);
        assert!(summary.omitted_mass_fraction >= previous_omitted);
        previous_retained = summary.retained_edges;
        previous_omitted = summary.omitted_mass_fraction;
    }

    // Above every policy mass the sweep prunes everything.
    let mut scratch = live.scratch();
    let ceiling = live.build_in(&mut scratch, 0.0, 1.5);
    assert_eq!(ceiling.retained_edges, 0);
    assert!((ceiling.omitted_mass_fraction.get() - 1.0).abs() < 1e-12);
}

/// Counts the corpus's self-referencing instances directly.
fn summary_self_references(corpus: &Corpus<NodeRowId, EdgeRowId>) -> usize {
    corpus
        .instances()
        .iter()
        .filter(|instance| instance.source == instance.target)
        .count()
}

#[test]
fn judge_layouts_agree() {
    let live = corpus(Profile::Live);
    let per_row = core::num::NonZero::new(24).expect("the candidate width is positive");

    // Hit-poor and hit-rich sweeps: both layouts must count the same
    // protected pairs at every hit rate.
    for fraction in [0.0, 0.25, 0.9] {
        let probes = live.judge_probes::<Xoshiro256PlusPlus>(per_row, fraction, SEED);
        assert_eq!(probes.pairs(), live.rows() * per_row.get());

        let pointwise = live.judge_pointwise(&probes);
        let by_row = live.judge_by_row(&probes);
        assert_eq!(pointwise, by_row, "fraction {fraction}");
    }
}

#[test]
fn judge_hit_rate_follows_partner_fraction() {
    let live = corpus(Profile::Live);
    let per_row = core::num::NonZero::new(24).expect("the candidate width is positive");

    // Zero thresholds protect every linked pair, so drawing candidates from the partner lists must
    // raise the protected count.
    let uniform = live.judge_probes::<Xoshiro256PlusPlus>(per_row, 0.0, SEED);
    let linked = live.judge_probes::<Xoshiro256PlusPlus>(per_row, 0.9, SEED);
    assert!(live.judge_pointwise(&linked) > live.judge_pointwise(&uniform) * 4);
}
