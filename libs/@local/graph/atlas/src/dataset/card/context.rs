pub struct CardContext<S, T> {
    pub language: &'static str,
    pub segmenter: S,
    pub tokenizer: T,
}
