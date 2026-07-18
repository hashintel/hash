use unicode_segmentation::UnicodeSegmentation as _;

/// Splits normalized prose into borrowed sentences.
pub(crate) trait TextSegmenter {
    type Error;

    /// Returns sentence slices in source order.
    fn split_sentences<'text>(
        &self,
        text: &'text str,
        language: &str,
    ) -> Result<impl IntoIterator<Item = (usize, &'text str)>, Self::Error>;
}

struct UnicodeSegmenter;

impl TextSegmenter for UnicodeSegmenter {
    type Error = !;

    fn split_sentences<'text>(
        &self,
        text: &'text str,
        _: &str,
    ) -> Result<impl IntoIterator<Item = (usize, &'text str)>, Self::Error> {
        Ok(text.split_sentence_bound_indices())
    }
}
