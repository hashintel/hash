use unicode_segmentation::UnicodeSegmentation as _;

/// Splits normalized prose into borrowed sentences.
pub(crate) trait TextSegmenter {
    /// The failure produced when the segmenter cannot process `text`.
    type Error;

    /// Returns `(offset, sentence)` slices in source order.
    ///
    /// Offsets index into `text` and every slice starts at its offset, so callers can address the
    /// text before, inside, and after any sentence.
    ///
    /// # Errors
    ///
    /// Returns this segmenter's error when it cannot split `text` into sentences.
    fn split_sentences<'text>(
        &self,
        text: &'text str,
        language: &str,
    ) -> Result<impl IntoIterator<Item = (usize, &'text str)>, Self::Error>;
}

/// The default sentence segmenter: Unicode Standard Annex 29 boundaries.
///
/// Sentence boundaries follow the Unicode default rules for every language, so segmentation is
/// deterministic and needs no training data. Abbreviation-heavy prose can split early ("Dr.
/// Smith"). An early split lowers truncation quality without causing an error.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct UnicodeSegmenter;

impl TextSegmenter for UnicodeSegmenter {
    type Error = !;

    fn split_sentences<'text>(
        &self,
        text: &'text str,
        _language: &str,
    ) -> Result<impl IntoIterator<Item = (usize, &'text str)>, Self::Error> {
        Ok(text.split_sentence_bound_indices())
    }
}
