use alloc::borrow::Cow;
use core::borrow::Borrow;

use anstyle::{Color, Style};
use error_stack::{Report, TryReportIteratorExt};

use super::Suggestions;
use crate::{
    error::ResolveError,
    source::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
enum MessageKind {
    Note,
    Help,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Message<S> {
    kind: MessageKind,
    contents: Cow<'static, str>,

    pub suggestions: Option<Suggestions<S>>,

    #[cfg_attr(feature = "serde", serde(skip))] // TODO: implement
    pub style: Option<Style>,
}

impl<S> Message<S> {
    pub const fn note<M>(message: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            kind: MessageKind::Note,
            contents: message.into(),
            suggestions: None,
            style: None,
        }
    }

    pub const fn help<M>(message: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            kind: MessageKind::Help,
            contents: message.into(),
            suggestions: None,
            style: None,
        }
    }

    #[must_use]
    pub const fn message(&self) -> &str
    where
        String: [const] Borrow<str>,
    {
        &self.contents
    }

    #[must_use]
    pub fn with_suggestions(mut self, suggestions: Suggestions<S>) -> Self {
        self.suggestions = Some(suggestions);
        self
    }

    #[must_use]
    pub const fn with_style(mut self, style: Style) -> Self {
        self.style = Some(style);
        self
    }

    #[must_use]
    pub const fn with_color(mut self, color: Color) -> Self {
        self.style = Some(Style::new().fg_color(Some(color)));
        self
    }

    #[cfg(feature = "render")]
    pub(crate) fn render(&self) -> annotate_snippets::Message<'_> {
        use annotate_snippets::Level;

        let level = match self.kind {
            MessageKind::Help => Level::HELP,
            MessageKind::Note => Level::NOTE,
        };

        let Some(style) = self.style else {
            return level.message(&*self.contents);
        };

        level.message(format!("{style}{}{style:#}", self.contents))
    }

    pub(crate) fn map_suggestions<S2>(
        self,
        func: impl FnOnce(Suggestions<S>) -> Suggestions<S2>,
    ) -> Message<S2> {
        Message {
            kind: self.kind,
            contents: self.contents,
            suggestions: self.suggestions.map(func),
            style: self.style,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Messages<S> {
    messages: Vec<Message<S>>,
}

impl<S> Messages<S> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    pub fn push(&mut self, message: Message<S>) {
        self.messages.push(message);
    }

    pub fn order_by_type(&mut self) {
        // Order the messages so that we first have notes and then help messages
        self.messages.sort_by_key(|message| match message.kind {
            MessageKind::Help => 1,
            MessageKind::Note => 0,
        });
    }

    pub fn iter(&self) -> impl Iterator<Item = &Message<S>> {
        self.messages.iter()
    }

    pub(crate) fn resolve<C>(
        self,
        context: &mut C,
    ) -> Result<Messages<AbsoluteDiagnosticSpan>, Report<[ResolveError]>>
    where
        S: DiagnosticSpan<C>,
    {
        let messages = self
            .messages
            .into_iter()
            .map(
                |Message {
                     kind,
                     contents,
                     suggestions,
                     style,
                 }| {
                    let suggestions = suggestions
                        .map(|suggestions| suggestions.resolve(context))
                        .transpose()?;

                    Ok::<_, Report<[_]>>(Message {
                        kind,
                        contents,
                        suggestions,
                        style,
                    })
                },
            )
            .try_collect_reports()?;

        Ok(Messages { messages })
    }

    pub(crate) fn map<T>(self, func: impl FnMut(Message<S>) -> Message<T>) -> Messages<T> {
        Messages {
            messages: self.messages.into_iter().map(func).collect(),
        }
    }
}

impl<S> const Default for Messages<S> {
    fn default() -> Self {
        Self::new()
    }
}
