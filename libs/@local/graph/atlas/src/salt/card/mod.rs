//! Deterministic relation-card rendering.
//!
//! Relation cards are identifier-free labeled text used to embed relation
//! semantics. Rendering preserves one canonical block order and one trailing
//! newline. The labeled-text layout was introduced in format v5. Format v6
//! additionally requires datasource adapters to rewrite or remove identifier
//! references before constructing [`RelationCardInput`]. Descriptions attached
//! to referenced types are split into a retained lead sentence and removable
//! detail.
//!
//! When a card exceeds its target token budget, truncation proceeds in this
//! order:
//!
//! 1. remove example slots round-robin from the largest strata;
//! 2. remove ancestor, source-type and target-type description detail;
//! 3. remove whole example strata while retaining at least one example.
//!
//! If the result still exceeds the hard budget, all examples and then the
//! ancestor section are removed. Relation title, description, inverse,
//! endpoint-type summaries, constraints and slug are retained. The final UTF-8
//! text is checked for URLs, UUIDs and adapter-supplied source identifiers
//! before its SHA-256 hash is exposed.

use std::sync::LazyLock;

use regex::Regex;

use crate::salt::hash::ContentHash;

mod error;
mod format;
mod token;

use self::format::{CardContents, TruncationPass};
pub(crate) use self::{
    error::{CardError, TokenCountError},
    token::{
        Cl100kTokenCounter, HeuristicTokenCounter, NaiveSentenceSplitter, SentenceSplitter,
        TokenCounter,
    },
};

const DEFAULT_TOKEN_BUDGET: usize = 6_000;
const DEFAULT_HARD_TOKEN_BUDGET: usize = 7_500;

/// Current relation-card corpus contract.
pub(crate) const CARD_FORMAT_VERSION: u32 = 6;

/// A display phrase referenced by a relation.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PhraseInput<'input> {
    pub label: &'input str,
    pub description: Option<&'input str>,
}

/// The direction described by a card.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

/// Ontology facts rendered independently of relation-policy predictions.
#[derive(Debug, Copy, Clone)]
pub(crate) struct RelationConstraints {
    pub symmetric: Option<bool>,
    pub transitive: Option<bool>,
    pub single_value: Option<bool>,
    pub distinct_values: Option<bool>,
    pub direction: RelationDirection,
}

/// One identifier-free relation example.
#[derive(Debug, Copy, Clone)]
pub(crate) struct RelationExample<'input> {
    pub subject_label: &'input str,
    pub object_label: &'input str,
    pub stratum_label: Option<&'input str>,
}

/// Source-neutral semantic fields accepted by the canonical renderer.
#[derive(Debug, Copy, Clone)]
pub(crate) struct RelationCardInput<'input> {
    pub language: &'input str,
    pub title: &'input str,
    pub description: Option<&'input str>,
    pub aliases: &'input [&'input str],
    pub inverse: Option<PhraseInput<'input>>,
    pub ancestors: &'input [PhraseInput<'input>],
    pub source_types: &'input [PhraseInput<'input>],
    pub target_types: &'input [PhraseInput<'input>],
    pub constraints: RelationConstraints,
    pub examples: &'input [RelationExample<'input>],
    pub slug: Option<&'input str>,
}

/// Target and hard token limits for structural truncation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct CardBudgets {
    target: usize,
    hard: usize,
}

impl CardBudgets {
    /// Validates token budgets.
    ///
    /// # Errors
    ///
    /// Returns an error unless `0 < target <= hard`.
    pub(crate) const fn new(target: usize, hard: usize) -> Result<Self, CardError> {
        if target == 0 || target > hard {
            return Err(CardError::InvalidBudgets { target, hard });
        }
        Ok(Self { target, hard })
    }

    #[must_use]
    #[inline]
    pub(crate) const fn target(self) -> usize {
        self.target
    }

    #[must_use]
    #[inline]
    pub(crate) const fn hard(self) -> usize {
        self.hard
    }
}

impl Default for CardBudgets {
    #[inline]
    fn default() -> Self {
        Self {
            target: DEFAULT_TOKEN_BUDGET,
            hard: DEFAULT_HARD_TOKEN_BUDGET,
        }
    }
}

/// One structural removal made to satisfy a token budget.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Truncation {
    Example { index: usize },
    AncestorDetails,
    SourceTypeDetails,
    TargetTypeDetails,
    ExampleStratum { label: Option<String> },
    ExamplesSection,
    AncestorsSection,
}

/// A rendered and content-addressed relation card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RelationCard {
    text: String,
    hash: ContentHash,
    token_count: usize,
    truncations: Vec<Truncation>,
    severely_truncated: bool,
}

impl RelationCard {
    /// Returns canonical format-v5 text.
    #[must_use]
    #[inline]
    pub(crate) fn text(&self) -> &str {
        &self.text
    }

    /// Returns the SHA-256 identity of [`Self::text`].
    #[must_use]
    #[inline]
    pub(crate) const fn hash(&self) -> ContentHash {
        self.hash
    }

    /// Returns the final tokenizer count.
    #[must_use]
    #[inline]
    pub(crate) const fn token_count(&self) -> usize {
        self.token_count
    }

    /// Returns structural removals in execution order.
    #[must_use]
    #[inline]
    pub(crate) fn truncations(&self) -> &[Truncation] {
        &self.truncations
    }

    /// Reports a remaining hard-budget violation or removal of more than half
    /// the examples.
    #[must_use]
    #[inline]
    pub(crate) const fn severely_truncated(&self) -> bool {
        self.severely_truncated
    }
}

/// Renders, budgets, lints and hashes one canonical relation card.
///
/// `forbidden_identifiers` contains source identifiers resolved by the caller.
/// Empty identifiers are ignored.
///
/// # Errors
///
/// Returns an error when tokenization fails or the final text leaks a URL,
/// UUID, or caller-supplied source identifier.
pub(crate) fn build_card(
    input: RelationCardInput<'_>,
    budgets: CardBudgets,
    counter: &impl TokenCounter,
    splitter: &impl SentenceSplitter,
    forbidden_identifiers: &[&str],
) -> Result<RelationCard, CardError> {
    let mut contents = CardContents::make(input, splitter);
    let total_examples = contents.example_count();
    let mut truncations = Vec::new();
    let mut rendered = String::new();
    let mut token_count = measure(&contents, counter, &mut rendered)?;

    token_count = run_passes(
        &mut contents,
        [
            TruncationPass::DropExampleSlot,
            TruncationPass::StripAncestorDetails,
            TruncationPass::StripSourceTypeDetails,
            TruncationPass::StripTargetTypeDetails,
            TruncationPass::DropExampleStratum,
        ],
        budgets.target(),
        counter,
        &mut rendered,
        &mut truncations,
        token_count,
    )?;

    if token_count > budgets.hard() {
        token_count = run_passes(
            &mut contents,
            [
                TruncationPass::DropExamplesSection,
                TruncationPass::DropAncestorsSection,
            ],
            budgets.hard(),
            counter,
            &mut rendered,
            &mut truncations,
            token_count,
        )?;
    }

    contents.render_into(&mut rendered);
    lint_card_text(&rendered, forbidden_identifiers)?;
    let dropped_examples = total_examples - contents.example_count();
    let severely_truncated =
        token_count > budgets.hard() || dropped_examples > total_examples - dropped_examples;
    let hash = ContentHash::digest(rendered.as_bytes());

    Ok(RelationCard {
        text: rendered,
        hash,
        token_count,
        truncations,
        severely_truncated,
    })
}

fn run_passes<const PASSES: usize>(
    contents: &mut CardContents,
    passes: [TruncationPass; PASSES],
    budget: usize,
    counter: &impl TokenCounter,
    rendered: &mut String,
    truncations: &mut Vec<Truncation>,
    mut token_count: usize,
) -> Result<usize, CardError> {
    for pass in passes {
        while token_count > budget {
            let Some(truncation) = contents.apply(pass) else {
                break;
            };
            truncations.push(truncation);
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

fn lint_card_text(text: &str, forbidden_identifiers: &[&str]) -> Result<(), CardError> {
    static URL: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i:[a-z][a-z0-9+.-]*):/{2}")
            .expect("the canonical URL detector should compile")
    });
    static UUID: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
            .expect("the canonical UUID detector should compile")
    });

    if URL
        .find_iter(text)
        .any(|matched| ascii_boundary_before(text, matched.start(), u8::is_ascii_alphanumeric))
    {
        return Err(CardError::ForbiddenUrl);
    }
    if UUID.find_iter(text).any(|matched| {
        ascii_boundary_before(text, matched.start(), u8::is_ascii_hexdigit)
            && ascii_boundary_after(text, matched.end(), u8::is_ascii_hexdigit)
    }) {
        return Err(CardError::ForbiddenUuid);
    }

    for identifier in forbidden_identifiers
        .iter()
        .copied()
        .filter(|identifier| !identifier.is_empty())
    {
        if text.match_indices(identifier).any(|(start, _)| {
            ascii_boundary_before(text, start, u8::is_ascii_alphanumeric)
                && ascii_boundary_after(text, start + identifier.len(), u8::is_ascii_alphanumeric)
        }) {
            return Err(CardError::ForbiddenIdentifier {
                identifier: identifier.to_owned(),
            });
        }
    }
    Ok(())
}

#[inline]
fn ascii_boundary_before(text: &str, index: usize, member: fn(&u8) -> bool) -> bool {
    index == 0 || !member(&text.as_bytes()[index - 1])
}

#[inline]
fn ascii_boundary_after(text: &str, index: usize, member: fn(&u8) -> bool) -> bool {
    index == text.len() || !member(&text.as_bytes()[index])
}

#[cfg(test)]
mod tests;
