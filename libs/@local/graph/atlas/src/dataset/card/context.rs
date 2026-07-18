/// The corpus-level settings one card build runs under.
///
/// The language, segmenter, and tokenizer are properties of the corpus
/// and its embedding model, never of an individual relation, so they
/// travel together past every per-card input.
pub(crate) struct CardContext<S, T> {
    /// The prose language, as a BCP 47 primary language subtag.
    pub language: &'static str,
    /// The sentence segmenter dividing descriptions into a lead sentence
    /// and removable detail.
    pub segmenter: S,
    /// The tokenizer measuring rendered text against the card budgets.
    pub tokenizer: T,
}
