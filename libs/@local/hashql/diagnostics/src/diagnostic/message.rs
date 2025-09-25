use alloc::borrow::Cow;
use core::borrow::Borrow;

use annotate_snippets::Group;
#[cfg(feature = "render")]
use annotate_snippets::Level;
use anstyle::{Color, Style};

use super::Suggestions;
#[cfg(feature = "render")]
use super::render::{RenderContext, RenderError};
use crate::source::DiagnosticSpan;

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

#[cfg(feature = "render")]
impl<S> Message<S> {
    const fn render_level(&self) -> Level<'_> {
        match self.kind {
            MessageKind::Help => Level::HELP,
            MessageKind::Note => Level::NOTE,
        }
    }

    fn render_message(&self) -> Cow<'_, str> {
        self.style.map_or_else(
            || Cow::Borrowed(&*self.contents),
            |style| Cow::Owned(format!("{style}{}{style:#}", self.contents)),
        )
    }

    fn render_suggestions<'this, C>(
        &'this self,
        suggestions: &'this Suggestions<S>,
        context: &mut RenderContext<'this, '_, '_, C>,
    ) -> Result<Group<'this>, RenderError<'this, S>>
    where
        S: DiagnosticSpan<C>,
    {
        let mut group =
            Group::with_title(self.render_level().secondary_title(self.render_message()));

        group = suggestions.render(group, context)?;
        Ok(group)
    }

    pub(crate) fn render_plain(&self) -> annotate_snippets::Message<'_> {
        self.render_level().message(self.render_message())
    }

    pub(crate) fn render<'this, C>(
        &'this self,
        context: &mut RenderContext<'this, '_, '_, C>,
    ) -> Result<Option<annotate_snippets::Message<'this>>, RenderError<'this, S>>
    where
        S: DiagnosticSpan<C>,
    {
        if let Some(suggestions) = &self.suggestions {
            let group = self.render_suggestions(suggestions, context)?;
            context.groups.push(group);
            Ok(None)
        } else {
            Ok(Some(self.render_plain()))
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
