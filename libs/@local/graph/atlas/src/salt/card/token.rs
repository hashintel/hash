//! Token-budget and sentence-boundary implementations.

use std::sync::LazyLock;

use tiktoken_rs::cl100k_base_singleton;

use super::error::TokenCountError;

/// Counts tokens for structural card budgets.
pub(crate) trait TokenCounter {
    /// Counts the encoded tokens in `text`.
    ///
    /// # Errors
    ///
    /// Returns an error when text contains a token that the encoding reserves
    /// for protocol use.
    fn count(&self, text: &str) -> Result<usize, TokenCountError>;
}

/// Splits normalized prose into borrowed sentences.
pub(crate) trait SentenceSplitter {
    /// Returns sentence slices in source order.
    fn split<'text>(&self, text: &'text str, language: &str) -> Vec<&'text str>;
}

/// The `cl100k_base` tokenizer used by the embedding model.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct Cl100kTokenCounter;

impl TokenCounter for Cl100kTokenCounter {
    fn count(&self, text: &str) -> Result<usize, TokenCountError> {
        static SPECIAL_TOKENS: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
            let mut tokens: Vec<_> = cl100k_base_singleton()
                .special_tokens()
                .into_iter()
                .collect();
            tokens.sort_unstable();
            tokens
        });

        if let Some(token) = SPECIAL_TOKENS
            .iter()
            .copied()
            .find(|token| text.contains(token))
        {
            return Err(TokenCountError::ReservedToken { token });
        }
        Ok(cl100k_base_singleton().count_ordinary(text))
    }
}

/// Deterministic byte-length counter for tests and offline fixtures.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct HeuristicTokenCounter;

impl TokenCounter for HeuristicTokenCounter {
    #[inline]
    fn count(&self, text: &str) -> Result<usize, TokenCountError> {
        Ok(text.len().div_ceil(4))
    }
}

/// Deterministic splitter that recognizes terminal punctuation followed by
/// whitespace.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct NaiveSentenceSplitter;

impl SentenceSplitter for NaiveSentenceSplitter {
    fn split<'text>(&self, text: &'text str, _language: &str) -> Vec<&'text str> {
        let mut sentences = Vec::new();
        let mut start = 0;
        let mut characters = text.char_indices().peekable();

        while let Some((index, character)) = characters.next() {
            if !matches!(character, '.' | '!' | '?')
                || !characters
                    .peek()
                    .is_some_and(|(_, next)| next.is_whitespace())
            {
                continue;
            }

            let end = index + character.len_utf8();
            if start < end {
                sentences.push(&text[start..end]);
            }

            start = end;
            while let Some(&(whitespace_index, whitespace)) = characters.peek() {
                if !whitespace.is_whitespace() {
                    break;
                }
                start = whitespace_index + whitespace.len_utf8();
                characters.next();
            }
        }

        if start < text.len() {
            sentences.push(&text[start..]);
        }
        sentences
    }
}
