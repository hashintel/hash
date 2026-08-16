//! Store-fact queries behind the dataset's card rendering.
//!
//! [`corpus_facts`] gathers everything the card builder consumes for every type in the dataset's
//! type table, inside the frozen transaction and at its temporal axes. One query per fact kind
//! (prose, ancestors, associations, examples) covers the whole table at once, so the expensive
//! scans over the entity tables amortize across all cards instead of repeating per type:
//!
//! - each type's prose and its (depth, id)-ordered ancestor chain, which omits the type itself and
//!   the link root;
//! - the endpoint associations, which cover every current source type whose resolved schema
//!   constrains a scoped type as a link under any version of its id, plus allowed targets resolved
//!   to their latest-current prose and per-source cardinality;
//! - pooled example candidates over each link type's current instances, with display labels,
//!   nearest-first source-type closures, and endpoint frequencies within the relation.
//!
//! Only types descending from the link root carry instances into the example query. For a type
//! that nothing constrains as a link and that has no link instances - every non-link entity type
//! - the association and example sets are empty and the card carries prose and ancestry alone.
//!
//! Type prose resolves by pinned ontology id without a liveness check, because the type table
//! derives from current editions under the same snapshot and the versioned type rows it
//! references are immutable. The association query filters to current types, where liveness
//! decides which constraints exist.
//!
//! Every identifier the queries resolve - type ids at every version, entity ids of example
//! endpoints - feeds each card's final text linter as a forbidden identifier.

mod associations;
mod examples;
mod prose;

/// The versioned URL key of a type schema.
const ID_KEY: &str = "$id";
/// The title key of a type schema.
const TITLE_KEY: &str = "title";
/// The description key of a type schema.
const DESCRIPTION_KEY: &str = "description";

use std::io;

use tokio_postgres::Transaction;
use uuid::Uuid;

use super::id::ArchivedOntologyTypeUuid;
use crate::dataset::{
    TemporalAxes,
    card::{
        Card, CardContext, CardsConfig, Cl100kTokenizer, UnicodeSegmenter, build_card,
        hash::{EndpointAssociation, ExampleRow, TypeFacts, TypePhrase, build_contents},
    },
};

/// Content-affecting controls for card extraction.
///
/// A card is deterministic in the dataset's temporal axes and these parameters, so a generation
/// records both. The dataset starts from the defaults.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct CardParameters {
    /// The most examples one finished card presents.
    pub example_count: usize = 8,
    /// Example candidates fetched per source-type subgroup.
    ///
    /// A multiple of [`example_count`](Self::example_count).
    ///
    /// The pool bounds what the query transfers, and the diverse selector consumes candidates
    /// from each subgroup in a deterministic order, so the pool is the slack it has for
    /// rejecting duplicates and conflicts. The selector never reaches rows beyond the pool.
    pub subgroup_pool_factor: usize = 8,
    /// Example candidates fetched per relation across all subgroups.
    ///
    /// A multiple of [`example_count`](Self::example_count).
    pub pool_factor: usize = 32,
    /// Token budgets for structural truncation.
    pub budgets: CardsConfig = CardsConfig { .. },
}

/// One type's own phrasing, owned by the rows the queries returned.
struct OwnedType {
    id: String,
    title: String,
    description: Option<String>,
    inverse_title: Option<String>,
}

/// One source type's link constraint against the relation, owned.
struct OwnedAssociation {
    source_id: String,
    source_title: String,
    source_description: Option<String>,
    targets: Vec<(String, Option<String>)>,
    minimum_targets: Option<usize>,
    maximum_targets: Option<usize>,
}

/// One pooled live link instance, owned.
struct OwnedExample {
    link_id: String,
    source_id: String,
    target_id: String,
    source_label: String,
    target_label: String,
    source_direct_type: String,
    source_type_closure: Vec<String>,
    source_frequency: u64,
    target_frequency: u64,
}

/// One type's store facts, owned by the rows the queries returned.
pub(crate) struct RelationFacts {
    relation: OwnedType,
    ancestors: Vec<OwnedType>,
    associations: Vec<OwnedAssociation>,
    examples: Vec<OwnedExample>,
    forbidden: Vec<String>,
}

impl RelationFacts {
    /// Projects the owned rows into the card builder's borrowed inputs.
    fn contents_inputs(
        &self,
    ) -> (
        TypeFacts<'_>,
        Vec<EndpointAssociation<'_>>,
        Vec<ExampleRow<'_>>,
    ) {
        let facts = TypeFacts {
            id: &self.relation.id,
            title: &self.relation.title,
            description: self.relation.description.as_deref(),
            inverse_title: self.relation.inverse_title.as_deref(),
            ancestors: self
                .ancestors
                .iter()
                .map(|ancestor| TypePhrase {
                    title: &ancestor.title,
                    description: ancestor.description.as_deref(),
                })
                .collect(),
        };

        let associations = self
            .associations
            .iter()
            .map(|association| EndpointAssociation {
                source_id: &association.source_id,
                source: TypePhrase {
                    title: &association.source_title,
                    description: association.source_description.as_deref(),
                },
                targets: association
                    .targets
                    .iter()
                    .map(|(title, description)| TypePhrase {
                        title,
                        description: description.as_deref(),
                    })
                    .collect(),
                minimum_targets: association.minimum_targets,
                maximum_targets: association.maximum_targets,
            })
            .collect();

        let examples = self
            .examples
            .iter()
            .map(|example| ExampleRow {
                link_id: &example.link_id,
                source_id: &example.source_id,
                target_id: &example.target_id,
                source_label: &example.source_label,
                target_label: &example.target_label,
                source_direct_type: &example.source_direct_type,
                source_type_closure: example
                    .source_type_closure
                    .iter()
                    .map(String::as_str)
                    .collect(),
                source_frequency: example.source_frequency,
                target_frequency: example.target_frequency,
            })
            .collect();

        (facts, associations, examples)
    }

    /// Returns the source identifiers the queries resolved.
    fn forbidden_identifiers(&self) -> Vec<&str> {
        self.forbidden.iter().map(String::as_str).collect()
    }
}

/// Gathers card facts for every type in `types` inside `transaction`.
///
/// The `n`-th returned facts belong to `types[n]`, so the result aligns with ontology row order.
///
/// # Errors
///
/// Returns the store's error when a query fails.
///
/// # Panics
///
/// This panics when the store violates its own referential contracts, such as a type in `types`
/// without a versioned type row (the `entity_is_of_type` foreign key forbids this).
pub(crate) async fn corpus_facts(
    transaction: &Transaction<'_>,
    axes: TemporalAxes,
    parameters: CardParameters,
    types: &[Uuid],
) -> Result<Vec<RelationFacts>, tokio_postgres::Error> {
    let mut facts = prose::prose_rows(transaction, types).await?;

    prose::ancestor_rows(transaction, types, &mut facts).await?;
    associations::association_rows(transaction, axes, types, &mut facts).await?;
    examples::example_rows(transaction, axes, parameters, types, &mut facts).await?;

    for fact in &mut facts {
        fact.forbidden.sort_unstable();
        fact.forbidden.dedup();
    }

    Ok(facts)
}

/// Resolves the 1-based `ordinality` column into an index over `facts`.
fn fact_at(facts: &mut [RelationFacts], ordinality: i64) -> &mut RelationFacts {
    let index =
        usize::try_from(ordinality - 1).expect("WITH ORDINALITY yields positions starting at one");

    facts
        .get_mut(index)
        .expect("WITH ORDINALITY yields positions inside the unnested type table")
}

/// Renders one type's gathered facts into its finished card.
pub(crate) fn render_card(
    id: Uuid,
    facts: &RelationFacts,
    parameters: CardParameters,
) -> io::Result<(ArchivedOntologyTypeUuid, Card)> {
    let context = CardContext {
        language: "en",
        segmenter: UnicodeSegmenter,
        tokenizer: Cl100kTokenizer,
    };

    let (type_facts, associations, examples) = facts.contents_inputs();
    let Ok(contents) = build_contents(
        type_facts,
        associations,
        examples,
        parameters.example_count,
        &context,
    );
    let Some(contents) = contents else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("the stored constraints on {id} violate the card contract"),
        ));
    };

    let card = build_card(
        contents,
        parameters.budgets,
        &context.tokenizer,
        &facts.forbidden_identifiers(),
    )
    .map_err(io::Error::other)?;

    Ok((id.into(), card))
}
