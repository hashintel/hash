use alloc::borrow::Cow;
use core::borrow::Borrow;

use anstyle::{Color, Style};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
enum MessageKind {
    Note,
    Help,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Message {
    kind: MessageKind,
    contents: Cow<'static, str>,

    #[cfg_attr(feature = "serde", serde(skip))] // TODO: implement
    pub style: Option<Style>,
}

impl Message {
    pub const fn note<M>(message: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            kind: MessageKind::Note,
            contents: message.into(),
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
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Messages {
    messages: Vec<Message>,
}

impl Messages {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    pub fn push(&mut self, message: Message) {
        self.messages.push(message);
    }

    pub fn order_by_type(&mut self) {
        // Order the messages so that we first have notes and then help messages
        self.messages.sort_by_key(|message| match message.kind {
            MessageKind::Help => 1,
            MessageKind::Note => 0,
        });
    }

    pub fn iter(&self) -> impl Iterator<Item = &Message> {
        self.messages.iter()
    }
}

impl const Default for Messages {
    fn default() -> Self {
        Self::new()
    }
}
