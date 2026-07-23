//! Corpus-card rendering through the canonical template.
//!
//! The classifier trains on exactly the card text production serves, so every corpus card renders
//! through the same template, budgets, and lint as generation-time cards; helpers here adapt the
//! corpus wire shapes to the template's inputs.

use super::{
    super::{Card, CardIdentity, Content, Direction, Phrase},
    AssemblyError, CARD_LANGUAGE,
};
use crate::dataset::card;

/// Normalizes one wire phrase for the template.
fn phrase<'text>(
    input: &'text Phrase,
    context: &card::CardContext<card::UnicodeSegmenter, card::Cl100kTokenizer>,
) -> Option<card::Phrase<'text>> {
    let Ok(phrase) = card::Phrase::new(&input.label, input.description.as_deref(), context);
    phrase
}

/// Builds one card's rendered example pairs.
fn examples<'text>(
    content: &'text Content,
    template: &card::CardContext<card::UnicodeSegmenter, card::Cl100kTokenizer>,
) -> Vec<card::GroupItem<'text, card::Example<'text>>> {
    content
        .examples
        .iter()
        .filter_map(|example| {
            let Ok(source) = card::Phrase::new(&example.subject, None, template);
            let Ok(target) = card::Phrase::new(&example.object, None, template);

            Some(card::GroupItem {
                data: card::Example {
                    source: source?,
                    target: target?,
                },
                group: example.stratum.as_deref().map(Into::into),
            })
        })
        .collect()
}

/// Builds one card's rendered endpoint constraints.
fn endpoint_constraints<'text, E>(
    index: usize,
    content: &'text Content,
    template: &card::CardContext<card::UnicodeSegmenter, card::Cl100kTokenizer>,
) -> Result<Vec<card::EndpointConstraint<'text>>, AssemblyError<E>> {
    let mut constraints = Vec::with_capacity(content.endpoint_constraints.len());
    for constraint in &content.endpoint_constraints {
        // A constraint whose source label normalizes away has no
        // association to render; its targets render nothing either.
        let Some(source) = phrase(&constraint.source_type, template) else {
            continue;
        };

        let targets = constraint
            .target_types
            .iter()
            .filter_map(|target| phrase(target, template))
            .collect();
        let Some(constraint) = card::EndpointConstraint::new(
            source,
            targets,
            constraint.minimum_targets.map(|minimum| minimum as usize),
            constraint.maximum_targets.map(|maximum| maximum as usize),
        ) else {
            return Err(AssemblyError::Cardinality { card: index });
        };

        constraints.push(constraint);
    }

    Ok(constraints)
}

/// Renders one corpus card through the canonical template.
pub(super) fn render_card<E>(
    index: usize,
    corpus_card: &Card,
) -> Result<card::Card, AssemblyError<E>> {
    let content = &corpus_card.content;
    if content.language != CARD_LANGUAGE {
        return Err(AssemblyError::Language {
            card: index,
            language: content.language.as_str().into(),
        });
    }

    let template = card::CardContext {
        language: CARD_LANGUAGE,
        segmenter: card::UnicodeSegmenter,
        tokenizer: card::Cl100kTokenizer,
    };

    let contents = card::CardContents {
        prelude: card::Prelude {
            relation: content.title.as_str().into(),
            description: content.description.as_deref().map(Into::into),
            aliases: content
                .aliases
                .iter()
                .map(|alias| alias.as_str().into())
                .collect(),
            inverse: content
                .inverse
                .as_ref()
                .and_then(|inverse| phrase(inverse, &template)),
        },
        ancestors: content
            .ancestors
            .iter()
            .filter_map(|ancestor| phrase(ancestor, &template))
            .collect(),
        source_types: content
            .source_types
            .iter()
            .filter_map(|source| phrase(source, &template))
            .collect(),
        target_types: content
            .target_types
            .iter()
            .filter_map(|target| phrase(target, &template))
            .collect(),
        endpoint_constraints: endpoint_constraints(index, content, &template)?,
        constraints: card::Constraints {
            symmetric: content.constraints.symmetric,
            transitive: content.constraints.transitive,
            singleton: content.constraints.single_value,
            distinct: content.constraints.distinct_values,
            direction: match content.constraints.direction {
                // NOTE: shouldn't this be a `From` impl?
                Direction::Symmetric => card::Direction::Symmetric,
                Direction::SourceToTarget => card::Direction::SourceToTarget,
            },
        },
        examples: examples(content, &template),
        epilogue: card::Epilogue {
            slug: content.slug.as_str().into(),
        },
    };

    // The wikidata entity token is the card's resolved source
    // identifier; hash identities are URLs, which the structural lint
    // already forbids.
    let forbidden = match &corpus_card.identity {
        CardIdentity::Wikidata { url, .. } => url.rsplit('/').next(),
        CardIdentity::Hash(_) => None,
    };

    card::build_card(
        contents,
        card::CardsConfig::default(),
        &template.tokenizer,
        forbidden.as_slice(),
    )
    .map_err(|error| AssemblyError::Render { card: index, error })
}
