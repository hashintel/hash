/// Tokenizes text for structural card budgets.
pub(crate) trait Tokenizer {
    type Error;

    /// Counts the encoded tokens in `text`.
    ///
    /// # Errors
    ///
    /// Returns an error when text contains a token that the encoding reserves
    /// for protocol use.
    fn count_tokens(&self, text: &str) -> Result<usize, Self::Error>;
}
