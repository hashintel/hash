//! Canonical relation-card construction, rendering, and truncation.
//!
//! Cards are deterministic labeled text, never JSON. Datasource adapters
//! resolve their identifiers into [`RelationCardInput`] before calling
//! [`build_card`] and supply the identifiers they resolved to the final text
//! linter. Independent domain/range summaries and paired endpoint
//! constraints ([`EndpointTypeConstraint`]) are distinct blocks.
//!
//! Truncation is structural. Referenced descriptions are split into a lead
//! sentence and removable detail, then passes run in this fixed order:
//!
//! 1. drop example slots round-robin from the largest strata;
//! 2. remove ancestor and endpoint-type description detail;
//! 3. drop whole single-example strata while preserving one example;
//! 4. above the hard budget only, drop examples and then ancestors.
//!
//! Title, description, inverse, and endpoint-type summaries are never
//! dropped.

use std::sync::LazyLock;

use regex::Regex;

use self::{
    error::{CardError, IdentifierLeakError},
    format::{CardContents, TruncationPass},
    token::{SentenceSplitter, TokenCounter},
};

pub(crate) mod error;
pub(crate) mod examples;
mod format;
pub(crate) mod token;

#[cfg(test)]
mod tests;

// Pass order is normative: diagnostics recorded on persisted cards name
// these passes, so reordering changes observable behavior.
const BUDGET_PASSES: [TruncationPass; 6] = [
    TruncationPass::DropExampleSlot,
    TruncationPass::StripAncestorDetails,
    TruncationPass::StripEndpointTypeDetails,
    TruncationPass::StripSourceTypeDetails,
    TruncationPass::StripTargetTypeDetails,
    TruncationPass::DropExampleStratum,
];
const HARD_BUDGET_PASSES: [TruncationPass; 2] = [
    TruncationPass::DropExamplesSection,
    TruncationPass::DropAncestorsSection,
];

/// A transferable label and optional description, with no source ID.
#[derive(Debug, Clone)]
pub(crate) struct PhraseInput {
    pub label: String,
    pub description: Option<String>,
}

/// The direction described by a card.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RelationDirection {
    Symmetric,
    SourceToTarget,
}

impl RelationDirection {
    #[must_use]
    #[inline]
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Symmetric => "symmetric",
            Self::SourceToTarget => "source -> target",
        }
    }
}

/// The shared constraint vocabulary.
///
/// `None` means the datasource does not record that fact and renders as
/// "not recorded"; `Some(false)` is a recorded negative assertion. Cards
/// report the ontology as-is.
#[derive(Debug, Copy, Clone)]
pub(crate) struct RelationConstraints {
    pub symmetric: Option<bool>,
    pub transitive: Option<bool>,
    pub single_value: Option<bool>,
    pub distinct_values: Option<bool>,
    pub direction: RelationDirection,
}

/// One source type's allowed target types and per-source cardinality.
#[derive(Debug, Clone)]
pub(crate) struct EndpointTypeConstraint {
    source_type: PhraseInput,
    target_types: Vec<PhraseInput>,
    minimum_targets: Option<usize>,
    maximum_targets: Option<usize>,
}

impl EndpointTypeConstraint {
    /// Validates the per-source cardinality range.
    ///
    /// `None` reports a minimum that exceeds the maximum.
    #[must_use]
    pub(crate) fn new(
        source_type: PhraseInput,
        target_types: Vec<PhraseInput>,
        minimum_targets: Option<usize>,
        maximum_targets: Option<usize>,
    ) -> Option<Self> {
        if let (Some(minimum), Some(maximum)) = (minimum_targets, maximum_targets)
            && minimum > maximum
        {
            return None;
        }
        Some(Self {
            source_type,
            target_types,
            minimum_targets,
            maximum_targets,
        })
    }
}

/// One identifier-free example pair and its optional source-type stratum.
#[expect(
    clippy::struct_field_names,
    reason = "the field names mirror the Python input model for traceability"
)]
#[derive(Debug, Clone)]
pub(crate) struct RelationExample {
    pub subject_label: String,
    pub object_label: String,
    pub stratum_label: Option<String>,
}

/// Canonical semantic input accepted from any ontology adapter.
#[derive(Debug, Clone)]
pub(crate) struct RelationCardInput {
    pub language: String,
    pub title: String,
    pub description: Option<String>,
    pub aliases: Vec<String>,
    pub inverse: Option<PhraseInput>,
    pub ancestors: Vec<PhraseInput>,
    pub endpoint_constraints: Vec<EndpointTypeConstraint>,
    pub source_types: Vec<PhraseInput>,
    pub target_types: Vec<PhraseInput>,
    pub constraints: RelationConstraints,
    pub examples: Vec<RelationExample>,
    pub slug: Option<String>,
}

/// Target and hard token limits for structural truncation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct CardsConfig {
    pub token_budget: usize = 6_000,
    pub hard_token_budget: usize = 7_500,
}

/// A finished source-neutral card and its budget diagnostics.
#[expect(
    clippy::struct_field_names,
    reason = "the field names mirror the Python output model for traceability"
)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Card {
    card_text: String,
    token_count: usize,
    truncations: Vec<String>,
    severely_truncated: bool,
}

impl Card {
    /// Returns the canonical rendered text.
    ///
    /// Callers derive the persisted card hash from these UTF-8 bytes.
    #[must_use]
    #[inline]
    pub(crate) fn card_text(&self) -> &str {
        &self.card_text
    }

    /// Returns the final tokenizer count.
    #[must_use]
    #[inline]
    pub(crate) const fn token_count(&self) -> usize {
        self.token_count
    }

    /// Returns truncation-pass labels in execution order.
    #[must_use]
    #[inline]
    pub(crate) const fn truncations(&self) -> &[String] {
        &self.truncations
    }

    /// Reports a remaining hard-budget violation or removal of more than
    /// half the examples.
    #[must_use]
    #[inline]
    pub(crate) const fn severely_truncated(&self) -> bool {
        self.severely_truncated
    }
}

/// Constructs, budgets, renders, and lints one canonical relation card.
///
/// `forbidden_identifiers` contains source identifiers resolved by the
/// caller. Empty identifiers are ignored.
///
/// # Errors
///
/// Returns an error when tokenization fails or the final text leaks a URL,
/// UUID, or caller-supplied source identifier.
pub(crate) fn build_card(
    input: &RelationCardInput,
    config: CardsConfig,
    counter: &impl TokenCounter,
    splitter: &impl SentenceSplitter,
    forbidden_identifiers: &[&str],
) -> Result<Card, CardError> {
    let mut contents = CardContents::make(input, splitter);
    let total_examples = contents.example_count();
    let mut truncations = Vec::new();
    let mut rendered = String::new();
    let mut token_count = measure(&contents, counter, &mut rendered)?;

    token_count = run_passes(
        &mut contents,
        &BUDGET_PASSES,
        config.token_budget,
        counter,
        &mut rendered,
        &mut truncations,
        token_count,
    )?;

    if token_count > config.hard_token_budget {
        token_count = run_passes(
            &mut contents,
            &HARD_BUDGET_PASSES,
            config.hard_token_budget,
            counter,
            &mut rendered,
            &mut truncations,
            token_count,
        )?;
    }

    let dropped_examples = total_examples - contents.example_count();
    let severely_truncated =
        token_count > config.hard_token_budget || dropped_examples * 2 > total_examples;

    contents.render_into(&mut rendered);
    lint_card_text(&rendered, forbidden_identifiers)?;

    Ok(Card {
        card_text: rendered,
        token_count,
        truncations,
        severely_truncated,
    })
}

fn run_passes(
    contents: &mut CardContents,
    passes: &[TruncationPass],
    budget: usize,
    counter: &impl TokenCounter,
    rendered: &mut String,
    truncations: &mut Vec<String>,
    mut token_count: usize,
) -> Result<usize, CardError> {
    for pass in passes {
        while token_count > budget {
            let Some(label) = contents.apply(*pass) else {
                break;
            };
            truncations.push(label);
            token_count = measure(contents, counter, rendered)?;
        }
    }
    Ok(token_count)
}

#[inline]
fn measure(
    contents: &CardContents,
    counter: &impl TokenCounter,
    rendered: &mut String,
) -> Result<usize, CardError> {
    contents.render_into(rendered);
    counter.count(rendered).map_err(CardError::from)
}

/// Rejects universal keys and the adapter's known source identifiers.
///
/// Every check requires the match to stand on its own token boundary, so
/// ordinary prose that merely resembles an identifier passes.
///
/// # Errors
///
/// Returns an error when the text contains a URL, a UUID, or one of
/// `forbidden_identifiers`. Empty identifiers are ignored.
pub(crate) fn lint_card_text(
    card_text: &str,
    forbidden_identifiers: &[&str],
) -> Result<(), IdentifierLeakError> {
    static URL: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new("(?i)[a-z][a-z0-9+.-]*:/{2}").expect("the canonical URL detector should compile")
    });
    static UUID: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
            .expect("the canonical UUID detector should compile")
    });

    if find_with_boundaries(&URL, card_text, u8::is_ascii_alphanumeric, None) {
        return Err(IdentifierLeakError::Url);
    }
    if find_with_boundaries(
        &UUID,
        card_text,
        u8::is_ascii_hexdigit,
        Some(u8::is_ascii_hexdigit),
    ) {
        return Err(IdentifierLeakError::Uuid);
    }

    for identifier in forbidden_identifiers
        .iter()
        .copied()
        .filter(|identifier| !identifier.is_empty())
    {
        if contains_identifier(card_text, identifier) {
            return Err(IdentifierLeakError::SourceIdentifier {
                identifier: identifier.to_owned(),
            });
        }
    }
    Ok(())
}

/// Normalizes a label into a URL slug.
#[must_use]
pub(crate) fn slugify(label: &str) -> String {
    let mut slug = String::with_capacity(label.len());
    let mut separator = false;
    for character in label.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            separator = false;
            slug.push(character);
        } else {
            separator = true;
        }
    }
    slug
}

// The reference patterns guard matches with lookarounds the regex crate
// does not support, so candidate matches are re-sought from one past a
// failed match start until one stands on its own boundary.
fn find_with_boundaries(
    pattern: &Regex,
    text: &str,
    before: fn(&u8) -> bool,
    after: Option<fn(&u8) -> bool>,
) -> bool {
    let mut search_start = 0;
    while let Some(found) = pattern.find_at(text, search_start) {
        if boundary_before(text, found.start(), before)
            && after.is_none_or(|member| boundary_after(text, found.end(), member))
        {
            return true;
        }
        // Both patterns begin with an ASCII byte, so one past the match
        // start stays on a character boundary.
        search_start = found.start() + 1;
    }
    false
}

#[expect(
    clippy::string_slice,
    reason = "offsets advance by whole characters from match starts, so slicing stays on \
              character boundaries"
)]
fn contains_identifier(text: &str, identifier: &str) -> bool {
    let mut offset = 0;
    while let Some(position) = text[offset..].find(identifier) {
        let start = offset + position;
        if boundary_before(text, start, u8::is_ascii_alphanumeric)
            && boundary_after(text, start + identifier.len(), u8::is_ascii_alphanumeric)
        {
            return true;
        }
        offset = start + text[start..].chars().next().map_or(1, char::len_utf8);
    }
    false
}

#[inline]
fn boundary_before(text: &str, index: usize, member: fn(&u8) -> bool) -> bool {
    index == 0 || !member(&text.as_bytes()[index - 1])
}

#[inline]
fn boundary_after(text: &str, index: usize, member: fn(&u8) -> bool) -> bool {
    index == text.len() || !member(&text.as_bytes()[index])
}
