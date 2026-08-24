use alloc::{alloc::Allocator, borrow::Cow};
use core::{error::Error, fmt, fmt::Write as _};

use super::{
    contents::{CardContents, TruncationPass},
    lint::{IdentifierLeakError, lint_card_text},
    token::{HeuristicTokenizer, Tokenizer},
};

// Pass order is normative: diagnostics recorded on persisted cards name
// these passes, so reordering changes observable behaviour.
const BUDGET_PASSES: [TruncationPass; 6] = [
    TruncationPass::DropExampleSlot,
    TruncationPass::StripAncestorDetails,
    TruncationPass::StripEndpointTypeDetails,
    TruncationPass::StripSourceTypeDetails,
    TruncationPass::StripTargetTypeDetails,
    TruncationPass::DropExampleGroup,
];
const HARD_BUDGET_PASSES: [TruncationPass; 2] = [
    TruncationPass::DropExamplesSection,
    TruncationPass::DropAncestorsSection,
];

/// Target and hard token limits for structural truncation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct CardsConfig {
    pub token_budget: usize = 6_000,
    pub hard_token_budget: usize = 7_500,
}

/// A card failed to render under its canonical contract.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum CardError<T> {
    /// The tokenizer rejected the rendered text.
    Token(T),
    /// The final text leaks a source identifier.
    Lint(IdentifierLeakError),
}

impl<T: fmt::Display> fmt::Display for CardError<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Token(error) => error.fmt(fmt),
            Self::Lint(error) => error.fmt(fmt),
        }
    }
}

impl<T: Error + 'static> Error for CardError<T> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Token(error) => Some(error),
            Self::Lint(error) => Some(error),
        }
    }
}

/// A finished source-neutral card and its budget diagnostics.
#[expect(
    clippy::struct_field_names,
    reason = "card_text names the persisted column, and the accessor carries the same name"
)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Card {
    card_text: String,
    token_count: usize,
    truncations: Vec<Cow<'static, str>>,
    severely_truncated: bool,
}

impl Card {
    /// Adopts pre-rendered text as a finished card.
    ///
    /// This adopts the text unchanged, with no truncation and no lint run. The diagnostics record
    /// zero truncation passes, and the token count is [`HeuristicTokenizer`]'s deterministic byte
    /// estimate.
    #[must_use]
    pub(crate) fn verbatim(card_text: String) -> Self {
        let Ok(token_count) = HeuristicTokenizer.count_tokens(&card_text);

        Self {
            card_text,
            token_count,
            truncations: Vec::new(),
            severely_truncated: false,
        }
    }

    /// Reassembles a card from its persisted fields.
    ///
    /// Every field is adopted unchanged, with nothing recomputed, so a card restored from
    /// storage compares equal to the card that was stored, diagnostics included. Use
    /// [`verbatim`](Self::verbatim) for fresh text, which computes its own token count.
    #[must_use]
    pub(crate) const fn from_parts(
        card_text: String,
        token_count: usize,
        truncations: Vec<Cow<'static, str>>,
        severely_truncated: bool,
    ) -> Self {
        Self {
            card_text,
            token_count,
            truncations,
            severely_truncated,
        }
    }

    /// Returns the canonical rendered text.
    ///
    /// Callers derive the persisted card hash from these UTF-8 bytes.
    #[inline]
    #[must_use]
    pub(crate) fn card_text(&self) -> &str {
        &self.card_text
    }

    /// Returns the final tokenizer count.
    #[inline]
    #[must_use]
    pub(crate) const fn token_count(&self) -> usize {
        self.token_count
    }

    /// Returns truncation-pass labels in execution order.
    #[inline]
    #[must_use]
    pub(crate) const fn truncations(&self) -> &[Cow<'static, str>] {
        &self.truncations
    }

    /// Reports a remaining hard-budget violation or removal of more than half the examples.
    #[inline]
    #[must_use]
    pub(crate) const fn severely_truncated(&self) -> bool {
        self.severely_truncated
    }
}

/// Renders one canonical relation card under its token budgets.
///
/// The contents arrive adapter-built. This applies the format's own normalization (the simple-pair
/// hoist) and truncates under the configured budgets, then verifies that the final text is
/// identifier-free. `forbidden_identifiers` contains source identifiers the caller resolved, and
/// this ignores empty identifiers.
///
/// # Errors
///
/// Returns an error when tokenization fails or the final text leaks a URL, UUID, or caller-supplied
/// source identifier.
pub(crate) fn build_card<T, A>(
    mut contents: CardContents<'_, A>,
    config: CardsConfig,
    tokenizer: &T,
    forbidden_identifiers: &[&str],
) -> Result<Card, CardError<T::Error>>
where
    T: Tokenizer,
    A: Allocator,
{
    contents.hoist_simple_pair();

    let total_examples = contents.example_count();
    let mut truncations = Vec::new();
    let mut rendered = String::new();
    let mut token_count = measure(&contents, tokenizer, &mut rendered)?;

    token_count = run_passes(
        &mut contents,
        &BUDGET_PASSES,
        config.token_budget,
        tokenizer,
        &mut rendered,
        &mut truncations,
        token_count,
    )?;

    if token_count > config.hard_token_budget {
        token_count = run_passes(
            &mut contents,
            &HARD_BUDGET_PASSES,
            config.hard_token_budget,
            tokenizer,
            &mut rendered,
            &mut truncations,
            token_count,
        )?;
    }

    let dropped_examples = total_examples - contents.example_count();
    let severely_truncated =
        token_count > config.hard_token_budget || dropped_examples * 2 > total_examples;

    render(&contents, &mut rendered);
    lint_card_text(&rendered, forbidden_identifiers).map_err(CardError::Lint)?;

    Ok(Card {
        card_text: rendered,
        token_count,
        truncations,
        severely_truncated,
    })
}

fn run_passes<T, A>(
    contents: &mut CardContents<'_, A>,
    passes: &[TruncationPass],
    budget: usize,
    tokenizer: &T,
    rendered: &mut String,
    truncations: &mut Vec<Cow<'static, str>>,
    mut token_count: usize,
) -> Result<usize, CardError<T::Error>>
where
    T: Tokenizer,
    A: Allocator,
{
    for pass in passes {
        while token_count > budget {
            let Some(label) = contents.apply(*pass) else {
                break;
            };

            truncations.push(label);
            token_count = measure(contents, tokenizer, rendered)?;
        }
    }

    Ok(token_count)
}

fn measure<T, A>(
    contents: &CardContents<'_, A>,
    tokenizer: &T,
    rendered: &mut String,
) -> Result<usize, CardError<T::Error>>
where
    T: Tokenizer,
    A: Allocator,
{
    render(contents, rendered);
    tokenizer.count_tokens(rendered).map_err(CardError::Token)
}

fn render<A: Allocator>(contents: &CardContents<'_, A>, rendered: &mut String) {
    rendered.clear();
    write!(rendered, "{contents}").expect("writing to a String cannot fail");
}
