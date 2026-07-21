use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

use super::{context::CardContext, segment::TextSegmenter, text::normalize_whitespace};

/// A phrase description divided at its first sentence boundary.
pub(crate) struct Description<'text> {
    /// The first sentence, retained through every truncation pass.
    pub lead: Cow<'text, str>,
    /// The remaining sentences, removable under budget pressure.
    pub tail: Option<Cow<'text, str>>,
}

/// A transferable label and optional description, with no source id.
///
/// Every labelled item on a card - inverse, ancestor, endpoint type, example endpoint - is a
/// phrase, so rendering and detail truncation are uniform whether or not a description is present
/// today.
pub(crate) struct Phrase<'text> {
    pub label: Cow<'text, str>,
    pub description: Option<Description<'text>>,
}

impl<'text> Phrase<'text> {
    /// Normalizes a labelled input into a phrase.
    ///
    /// A whitespace-only label yields `Ok(None)`; a whitespace-only description yields a bare
    /// label.
    ///
    /// # Errors
    ///
    /// Returns the segmenter's error when the description cannot be segmented.
    pub(crate) fn new<S, T>(
        label: &'text str,
        description: Option<&'text str>,
        context: &CardContext<S, T>,
    ) -> Result<Option<Self>, S::Error>
    where
        S: TextSegmenter,
    {
        let label = normalize_whitespace(label);
        if label.is_empty() {
            return Ok(None);
        }

        let description = description
            .map(normalize_whitespace)
            .filter(|description| !description.is_empty());
        let Some(description) = description else {
            return Ok(Some(Self {
                label,
                description: None,
            }));
        };

        #[expect(
            clippy::string_slice,
            reason = "the offset and length come from the segmenter's sentence boundaries, which \
                      lie on character boundaries"
        )]
        let description = match description {
            Cow::Borrowed(text) => {
                let sentences = context.segmenter.split_sentences(text, context.language)?;
                sentences.into_iter().next().map(|(offset, lead)| {
                    let tail = &text[offset + lead.len()..];
                    Description {
                        lead: Cow::Borrowed(lead),
                        tail: (!tail.is_empty()).then_some(Cow::Borrowed(tail)),
                    }
                })
            }
            Cow::Owned(mut text) => {
                let bounds = {
                    let sentences = context.segmenter.split_sentences(&text, context.language)?;
                    sentences
                        .into_iter()
                        .next()
                        .map(|(offset, lead)| (offset, lead.len()))
                };

                bounds.map(|(offset, length)| {
                    let tail = text.split_off(offset + length);
                    text.replace_range(..offset, "");

                    Description {
                        lead: Cow::Owned(text),
                        tail: (!tail.is_empty()).then_some(Cow::Owned(tail)),
                    }
                })
            }
        };

        Ok(Some(Self { label, description }))
    }

    /// Removes the description's removable detail.
    ///
    /// Reports whether any detail was present to remove.
    pub(crate) fn strip_tail(&mut self) -> bool {
        self.description
            .as_mut()
            .and_then(|description| description.tail.take())
            .is_some()
    }
}

impl Display for Phrase<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(&self.label)?;
        let Some(description) = &self.description else {
            return Ok(());
        };

        fmt.write_str(" (")?;
        fmt.write_str(description.lead.trim_end())?;
        if let Some(tail) = &description.tail {
            fmt.write_str(" ")?;
            fmt.write_str(tail)?;
        }
        fmt.write_str(")")
    }
}
