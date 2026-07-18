//! HASH graph-store facts projected into relation-card contents.
//!
//! [`build_contents`] is the HASH datasource adapter: it turns the facts
//! recorded for one link entity type - prose, per-source link
//! constraints, and link instances - into [`CardContents`] for
//! [`build_card`](super::format::build_card). Every input row names
//! types at their latest version, and text borrows from the rows until
//! whitespace normalization forces ownership.
//!
//! Example candidates flow through a deterministic pipeline in front of
//! [`select_diverse_examples`]:
//!
//! 1. process candidates in the order of a SHA-256 key over the relation and candidate identities,
//!    so the outcome is a property of the facts alone, independent of row order;
//! 2. collapse interior whitespace in endpoint labels and drop candidates with a blank label on
//!    either side;
//! 3. keep the first candidate of every endpoint pair;
//! 4. group each candidate under the constraining source type nearest in its type closure, matched
//!    by id; and
//! 5. claim one rendered-pair conflict token per candidate, so textually identical examples from
//!    separate webs appear at most once.
//!
//! Candidates matching no source type surface only when every per-source
//! group is empty, as one unlabeled group; with no constraining source
//! types at all, every candidate forms one unlabeled group.

use alloc::{
    alloc::{Allocator, Global},
    borrow::Cow,
};
use std::collections::HashSet;

use super::{
    CardContext, TextSegmenter,
    constraints::{Constraints, Direction, EndpointConstraint},
    contents::CardContents,
    epilogue::Epilogue,
    example::Example,
    group::GroupItem,
    phrase::Phrase,
    prelude::Prelude,
    select::{Candidate, DEFAULT_GROUP_SLOT_CAP, Group, Selected, select_diverse_examples},
    text::normalize_whitespace,
};
use crate::integrity::{Sha256, Sha256Digest, Update as _};

#[cfg(test)]
mod tests;

/// A type's transferable prose.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TypePhrase<'text> {
    /// The type's display title.
    pub title: &'text str,
    /// The type's description, when the schema records one.
    pub description: Option<&'text str>,
}

/// One relation's own facts, resolved to its latest version.
#[derive(Debug)]
pub(crate) struct TypeFacts<'text, A: Allocator = Global> {
    /// The relation's base id: a URL whose path ends in the type's slug
    /// and a trailing slash.
    pub id: &'text str,
    /// The relation's display title.
    pub title: &'text str,
    /// The relation's description, when the schema records one.
    pub description: Option<&'text str>,
    /// The inverse reading's title, when the schema records one.
    pub inverse_title: Option<&'text str>,
    /// Ancestor types ordered by depth then id, with the relation itself
    /// and the link root excluded.
    pub ancestors: Vec<TypePhrase<'text>, A>,
}

/// One source type's link constraint on the relation.
///
/// Each constraining source type arrives as exactly one row, and the
/// target list holds the latest version per target type, ordered by
/// target id. The adapter contributes the casefolded-title ordering the
/// card renders.
#[derive(Debug)]
pub(crate) struct EndpointAssociation<'text, A: Allocator = Global> {
    /// The source type's base id.
    pub source_id: &'text str,
    /// The source type's prose. The title contains visible text.
    pub source: TypePhrase<'text>,
    /// The allowed target types; an empty list allows any target type.
    pub targets: Vec<TypePhrase<'text>, A>,
    /// The fewest targets one source instance links, when the schema
    /// records a minimum.
    pub minimum_targets: Option<usize>,
    /// The most targets one source instance links, when the schema
    /// records a maximum.
    pub maximum_targets: Option<usize>,
}

/// One link instance eligible as a card example.
#[derive(Debug)]
pub(crate) struct ExampleRow<'text, A: Allocator = Global> {
    /// The link entity's identity.
    pub link_id: &'text str,
    /// The source endpoint's identity.
    pub source_id: &'text str,
    /// The target endpoint's identity.
    pub target_id: &'text str,
    /// The source endpoint's display label.
    pub source_label: &'text str,
    /// The target endpoint's display label.
    pub target_label: &'text str,
    /// The source endpoint's first direct type id; empty when the store
    /// records no direct type.
    pub source_direct_type: &'text str,
    /// The source endpoint's type ids, nearest first.
    pub source_type_closure: Vec<&'text str, A>,
    /// Occurrences of the source entity among the relation's instances;
    /// at least 1.
    pub source_frequency: u64,
    /// Occurrences of the target entity among the relation's instances;
    /// at least 1.
    pub target_frequency: u64,
}

/// Builds card contents from one relation's graph-store facts.
///
/// Associations render as endpoint constraints ordered by casefolded
/// source title then source id, and drive both the single-value
/// constraint and example grouping. Example candidates pass through the
/// deterministic pipeline described in the [module docs](self) before
/// [`select_diverse_examples`] fills at most `example_count` slots.
///
/// `Ok(None)` reports an association outside its contract: a source
/// title with no visible text, or a minimum above its maximum.
///
/// # Errors
///
/// Returns the segmenter's error when a description cannot be segmented.
pub(crate) fn build_contents<'text, S, T, A>(
    facts: TypeFacts<'text, A>,
    mut associations: Vec<EndpointAssociation<'text, A>, A>,
    examples: Vec<ExampleRow<'text, A>, A>,
    example_count: usize,
    context: &CardContext<S, T>,
) -> Result<Option<CardContents<'text, A>>, S::Error>
where
    S: TextSegmenter,
    A: Allocator + Clone,
{
    let TypeFacts {
        id,
        title,
        description,
        inverse_title,
        ancestors: ancestor_rows,
    } = facts;
    let alloc = associations.allocator().clone();

    associations.sort_unstable_by(|left, right| {
        casefolded(left.source.title)
            .cmp(casefolded(right.source.title))
            .then_with(|| left.source_id.cmp(right.source_id))
    });
    for association in &mut associations {
        // Stable: targets arrive ordered by id, so equal casefolded
        // titles keep id order.
        association
            .targets
            .sort_by(|left, right| casefolded(left.title).cmp(casefolded(right.title)));
    }

    let mut endpoint_constraints = Vec::with_capacity_in(associations.len(), alloc.clone());
    for association in &associations {
        let Some(constraint) = endpoint_constraint(association, context, &alloc)? else {
            return Ok(None);
        };
        endpoint_constraints.push(constraint);
    }

    let singleton = (!associations.is_empty()).then(|| {
        associations.iter().all(|association| {
            association
                .maximum_targets
                .is_some_and(|maximum| maximum <= 1)
        })
    });

    let candidates = normalized_examples(id, examples);
    let selected = select_diverse_examples(
        example_groups(&associations, candidates),
        example_count,
        DEFAULT_GROUP_SLOT_CAP,
    );
    let mut examples = Vec::with_capacity_in(selected.len(), alloc.clone());
    examples.extend(
        selected
            .into_iter()
            .map(|Selected { group, payload }| GroupItem {
                data: Example {
                    source: Phrase {
                        label: payload.source_label,
                        description: None,
                    },
                    target: Phrase {
                        label: payload.target_label,
                        description: None,
                    },
                },
                group: group.map(normalize_whitespace),
            }),
    );

    let mut ancestors = Vec::with_capacity_in(ancestor_rows.len(), alloc.clone());
    for ancestor in ancestor_rows {
        if let Some(phrase) = Phrase::new(ancestor.title, ancestor.description, context)? {
            ancestors.push(phrase);
        }
    }

    let inverse = inverse_title
        .map(|inverse| Phrase::new(inverse, None, context))
        .transpose()?
        .flatten();

    Ok(Some(CardContents {
        prelude: Prelude {
            relation: normalize_whitespace(title),
            description: description
                .map(normalize_whitespace)
                .filter(|description| !description.is_empty()),
            aliases: Vec::new_in(alloc.clone()),
            inverse,
        },
        ancestors,
        source_types: Vec::new_in(alloc.clone()),
        target_types: Vec::new_in(alloc),
        endpoint_constraints,
        constraints: Constraints {
            symmetric: None,
            transitive: None,
            singleton,
            distinct: None,
            direction: Direction::SourceToTarget,
        },
        examples,
        epilogue: Epilogue {
            slug: Cow::Borrowed(slug(id)),
        },
    }))
}

/// Builds one association's endpoint constraint.
///
/// `Ok(None)` reports an association outside its contract; a target
/// whose title holds no visible text is skipped.
///
/// # Errors
///
/// Returns the segmenter's error when a description cannot be segmented.
fn endpoint_constraint<'text, S, T, A>(
    association: &EndpointAssociation<'text, A>,
    context: &CardContext<S, T>,
    alloc: &A,
) -> Result<Option<EndpointConstraint<'text, A>>, S::Error>
where
    S: TextSegmenter,
    A: Allocator + Clone,
{
    let Some(source) = Phrase::new(
        association.source.title,
        association.source.description,
        context,
    )?
    else {
        return Ok(None);
    };

    let mut targets = Vec::with_capacity_in(association.targets.len(), alloc.clone());
    for target in &association.targets {
        if let Some(phrase) = Phrase::new(target.title, target.description, context)? {
            targets.push(phrase);
        }
    }

    Ok(EndpointConstraint::new(
        source,
        targets,
        association.minimum_targets,
        association.maximum_targets,
    ))
}

/// One deduplicated example candidate with normalized endpoint labels.
struct NormalizedExample<'text, A: Allocator = Global> {
    row: ExampleRow<'text, A>,
    source_label: Cow<'text, str>,
    target_label: Cow<'text, str>,
}

/// One stratified example group keyed by its source type's title.
type ExampleGroup<'text, A> =
    Group<'text, Option<&'text str>, NormalizedExample<'text, A>, &'text str, A>;

/// Normalizes candidates into deterministic processing order.
///
/// Candidates sort by [`order_key`], endpoint labels collapse interior
/// whitespace, candidates a blank label leaves unrenderable drop out, and
/// every endpoint pair keeps its first candidate.
fn normalized_examples<'text, A: Allocator + Clone>(
    relation_id: &str,
    examples: Vec<ExampleRow<'text, A>, A>,
) -> Vec<NormalizedExample<'text, A>, A> {
    let alloc = examples.allocator().clone();

    let mut ordered = Vec::with_capacity_in(examples.len(), alloc.clone());
    ordered.extend(
        examples
            .into_iter()
            .map(|row| (order_key(relation_id, &row), row)),
    );
    ordered.sort_unstable_by_key(|&(key, _)| key);

    let mut distinct = Vec::with_capacity_in(ordered.len(), alloc);
    let mut seen: HashSet<(&str, &str)> = HashSet::new();
    for (_, row) in ordered {
        let source_label = normalize_whitespace(row.source_label);
        let target_label = normalize_whitespace(row.target_label);
        if source_label.is_empty() || target_label.is_empty() {
            continue;
        }
        if !seen.insert((row.source_id, row.target_id)) {
            continue;
        }

        distinct.push(NormalizedExample {
            row,
            source_label,
            target_label,
        });
    }

    distinct
}

/// Keys one candidate's position in the deterministic processing order.
///
/// The digest covers the relation and candidate identities separated by
/// NUL bytes, so the order is a property of the facts alone.
fn order_key<A: Allocator>(relation_id: &str, row: &ExampleRow<'_, A>) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(relation_id.as_bytes());
    for part in [row.link_id, row.source_id, row.target_id] {
        hasher.update(b"\0");
        hasher.update(part.as_bytes());
    }

    hasher.finalize()
}

/// Stratifies candidates by their nearest constraining source type.
///
/// Grouping matches type ids, so title collisions between source types
/// leave assignment unchanged. Candidates matching no source type appear
/// only when every per-source group is empty, as one unlabeled group;
/// with no source types at all, every candidate forms one unlabeled
/// group.
fn example_groups<'text, A: Allocator + Clone>(
    associations: &[EndpointAssociation<'text, A>],
    candidates: Vec<NormalizedExample<'text, A>, A>,
) -> Vec<ExampleGroup<'text, A>, A> {
    let alloc = candidates.allocator().clone();

    if associations.is_empty() {
        return unlabeled_group(candidates, &alloc);
    }

    let mut pools = Vec::with_capacity_in(associations.len(), alloc.clone());
    pools.resize_with(associations.len(), || Vec::new_in(alloc.clone()));
    let mut unmatched = Vec::new_in(alloc.clone());
    for candidate in candidates {
        match nearest_source(associations, &candidate) {
            Some(pool) => pools[pool].push(candidate),
            None => unmatched.push(candidate),
        }
    }

    if pools.iter().all(Vec::is_empty) {
        return unlabeled_group(unmatched, &alloc);
    }

    let mut groups = Vec::with_capacity_in(pools.len(), alloc.clone());
    groups.extend(
        associations
            .iter()
            .zip(pools)
            .map(|(association, pool)| example_group(Some(association.source.title), pool, &alloc)),
    );
    groups
}

/// Wraps `pool` as the only group, without a label.
fn unlabeled_group<'text, A: Allocator + Clone>(
    pool: Vec<NormalizedExample<'text, A>, A>,
    alloc: &A,
) -> Vec<ExampleGroup<'text, A>, A> {
    let mut groups = Vec::with_capacity_in(1, alloc.clone());
    groups.push(example_group(None, pool, alloc));
    groups
}

/// Finds the source type nearest in the candidate's type closure.
///
/// Sources tying on closure position resolve to the earlier source, and
/// a candidate whose closure contains no source type yields `None`.
fn nearest_source<A: Allocator>(
    associations: &[EndpointAssociation<'_, A>],
    candidate: &NormalizedExample<'_, A>,
) -> Option<usize> {
    let mut nearest: Option<(usize, usize)> = None;
    for (index, association) in associations.iter().enumerate() {
        let Some(position) = candidate
            .row
            .source_type_closure
            .iter()
            .position(|id| *id == association.source_id)
        else {
            continue;
        };

        if nearest.is_none_or(|(best, _)| position < best) {
            nearest = Some((position, index));
        }
    }

    nearest.map(|(_, index)| index)
}

/// Wraps one candidate pool as a selection group.
///
/// Every candidate claims its endpoint identities plus one rendered-pair
/// conflict token, and scores by endpoint prominence. The candidate's
/// first direct type id forms the diversity subgroup.
fn example_group<'text, A: Allocator + Clone>(
    title: Option<&'text str>,
    pool: Vec<NormalizedExample<'text, A>, A>,
    alloc: &A,
) -> ExampleGroup<'text, A> {
    let mut candidates = Vec::with_capacity_in(pool.len(), alloc.clone());
    candidates.extend(pool.into_iter().map(|example| {
        let mut conflicts = Vec::with_capacity_in(1, alloc.clone());
        conflicts.push(Cow::Owned(rendered_pair(
            title,
            &example.source_label,
            &example.target_label,
        )));

        Candidate {
            source: Cow::Borrowed(example.row.source_id),
            target: Cow::Borrowed(example.row.target_id),
            subgroup: example.row.source_direct_type,
            recognizability: recognizability(&example.row),
            conflicts,
            payload: example,
        }
    }));

    Group {
        key: title,
        candidates,
    }
}

/// Builds a candidate's rendered-pair conflict token.
///
/// The token joins the casefolded group title (empty for the unlabeled
/// group) and both casefolded endpoint labels with NUL bytes under the
/// `rendered:` prefix, so one card never repeats a line of identical
/// rendered text even when the underlying entities differ.
fn rendered_pair(title: Option<&str>, source_label: &str, target_label: &str) -> String {
    let mut token = String::from("rendered:");
    token.extend(casefolded(title.unwrap_or_default()));
    token.push('\0');
    token.extend(casefolded(source_label));
    token.push('\0');
    token.extend(casefolded(target_label));
    token
}

/// Scores a candidate by its endpoints' prominence.
///
/// Prominence is `ln(1 + frequency)` summed over both endpoints, so a
/// pair of moderately connected entities outranks one hub paired with an
/// obscure partner.
fn recognizability<A: Allocator>(row: &ExampleRow<'_, A>) -> f64 {
    ln_count(row.source_frequency) + ln_count(row.target_frequency)
}

/// Returns `ln(1 + count)`.
#[expect(
    clippy::cast_precision_loss,
    reason = "the widening is the operation: counts above 2^53 round to the nearest representable \
              float, and the logarithm leaves that error far below the score's discrimination"
)]
fn ln_count(count: u64) -> f64 {
    (count as f64).ln_1p()
}

/// Iterates `text`'s characters through the Unicode lowercase mapping.
fn casefolded(text: &str) -> impl Iterator<Item = char> {
    text.chars().flat_map(char::to_lowercase)
}

/// Extracts the relation's slug: the last path segment of its base id.
///
/// Trailing slashes do not count as segment boundaries, so the canonical
/// `.../entity-type/<slug>/` shape yields `<slug>`.
fn slug(id: &str) -> &str {
    id.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or_default()
}
