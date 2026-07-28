use core::{error::Error, fmt};
use std::sync::LazyLock;

use tiktoken_rs::cl100k_base_singleton;

/// Tokenizes text for structural card budgets.
pub(crate) trait Tokenizer {
    /// The failure produced when `text` cannot be counted.
    type Error;

    /// Counts the encoded tokens in `text`.
    ///
    /// # Errors
    ///
    /// Returns the tokenizer's error when `text` contains input the encoding cannot count.
    fn count_tokens(&self, text: &str) -> Result<usize, Self::Error>;
}

/// Text contains a token the encoding reserves for protocol use.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ReservedTokenError {
    /// The reserved token found in the text.
    pub token: &'static str,
}

impl fmt::Display for ReservedTokenError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "text contains the reserved token {}", self.token)
    }
}

impl Error for ReservedTokenError {}

/// The `cl100k_base` tokenizer used by the embedding model.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct Cl100kTokenizer;

impl Tokenizer for Cl100kTokenizer {
    type Error = ReservedTokenError;

    fn count_tokens(&self, text: &str) -> Result<usize, Self::Error> {
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
            return Err(ReservedTokenError { token });
        }

        Ok(cl100k_base_singleton().count_ordinary(text))
    }
}

/// Deterministic offline tokenizer: `ceil(utf8_bytes / 4)`.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct HeuristicTokenizer;

impl Tokenizer for HeuristicTokenizer {
    type Error = !;

    #[inline]
    fn count_tokens(&self, text: &str) -> Result<usize, Self::Error> {
        Ok(text.len().div_ceil(4))
    }
}
