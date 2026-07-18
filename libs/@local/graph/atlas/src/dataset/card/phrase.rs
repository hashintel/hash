use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

use super::{context::CardContext, segment::TextSegmenter, text::collapse_whitespace};

pub(crate) struct Description<'text> {
    pub lead: Cow<'text, str>,
    pub tail: Option<Cow<'text, str>>,
}

pub(crate) struct Phrase<'text> {
    pub label: Cow<'text, str>,
    pub description: Option<Description<'text>>,
}

impl<'text> Phrase<'text> {
    pub(crate) fn new<S, T>(
        label: &'text str,
        description: Option<&'text str>,
        context: &CardContext<S, T>,
    ) -> Result<Option<Self>, S::Error>
    where
        S: TextSegmenter,
    {
        let label = collapse_whitespace(label);
        if label.is_empty() {
            return Ok(None);
        }

        let Some(description) = description else {
            return Ok(Some(Self {
                label,
                description: None,
            }));
        };

        let description = collapse_whitespace(description);
        if description.is_empty() {
            return Ok(None);
        }

        match description {
            Cow::Borrowed(text) => {
                let sentences = context.segmenter.split_sentences(text, context.language)?;
                let Some((offset, value)) = sentences.into_iter().next() else {
                    return Ok(Some(Self {
                        label,
                        description: None,
                    }));
                };

                let lead = Cow::Borrowed(value);
                let tail = Some(Cow::Borrowed(&text[offset + value.len()..]))
                    .filter(|value| !value.is_empty());

                Ok(Some(Self {
                    label,
                    description: Some(Description { lead, tail }),
                }))
            }
            Cow::Owned(mut text) => {
                let sentences = context.segmenter.split_sentences(&text, context.language)?;
                let Some((offset, value)) = sentences.into_iter().next() else {
                    return Ok(Some(Self {
                        label,
                        description: None,
                    }));
                };

                let length = value.len();
                let tail = text.split_off(offset + length);
                let mut lead = text;

                // TODO: there's gotta be a better way...
                unsafe {
                    lead.as_mut_vec().rotate_left(offset);
                };
                lead.truncate(length);

                let tail = Some(tail).filter(|value| !value.is_empty()).map(Cow::Owned);

                Ok(Some(Self {
                    label,
                    description: Some(Description {
                        lead: Cow::Owned(lead),
                        tail,
                    }),
                }))
            }
        }
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
