use alloc::borrow::Cow;
use core::{borrow::Borrow, slice};

#[cfg(feature = "render")]
use annotate_snippets::{Group, Level};
use anstyle::{Color, Style};

use super::Suggestions;
#[cfg(feature = "render")]
use super::render::{RenderContext, RenderError};
#[cfg(feature = "render")]
use crate::source::DiagnosticSpan;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
enum MessageKind {
    Note,
    Help,
}

/// A diagnostic message providing additional context, explanation, or guidance.
///
/// Messages are used to give users more information about diagnostic issues beyond
/// the primary error message and code labels. There are two types of messages:
///
/// - **Note messages**: Provide background information, context, or explanations about why
///   something is problematic
/// - **Help messages**: Offer actionable guidance and suggestions for resolving the diagnostic
///   issue
///
/// Messages can be styled with colors and can include code suggestions.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::Message;
///
/// // Create informational context
/// let note: Message<()> = Message::note("Variables must be initialized before use");
///
/// // Create actionable guidance
/// let help: Message<()> = Message::help("Try initializing the variable with a default value");
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Message<S> {
    kind: MessageKind,
    contents: Cow<'static, str>,

    pub suggestions: Option<Suggestions<S>>,

    #[cfg_attr(feature = "serde", serde(with = "crate::encoding::style_opt"))]
    pub style: Option<Style>,
}

impl<S> Message<S> {
    /// Creates a note message providing background information or context.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Message;
    ///
    /// let note: Message<()> =
    ///     Message::note("Variables must be initialized before use in this context");
    /// assert_eq!(
    ///     note.message(),
    ///     "Variables must be initialized before use in this context"
    /// );
    /// ```
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

    /// Creates a help message offering actionable guidance for resolving the issue.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Message;
    ///
    /// let help: Message<()> = Message::help("Try initializing the variable with a default value");
    /// assert_eq!(
    ///     help.message(),
    ///     "Try initializing the variable with a default value"
    /// );
    /// ```
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

    /// Returns the text content of this message.
    ///
    /// This method provides access to the actual message text that will be displayed to
    /// the user, without any styling or formatting information.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Message;
    ///
    /// let note: Message<()> = Message::note("This is a note message");
    /// assert_eq!(note.message(), "This is a note message");
    ///
    /// let help: Message<()> = Message::help("This is a help message");
    /// assert_eq!(help.message(), "This is a help message");
    /// ```
    #[must_use]
    pub const fn message(&self) -> &str
    where
        String: [const] Borrow<str>,
    {
        &self.contents
    }

    /// Attaches code suggestions to this message.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Message, Patch, Suggestions};
    ///
    /// let patch = Patch::new(10..15, "new_value");
    /// let suggestions = Suggestions::patch(patch);
    /// let help = Message::help("Consider using a different value").with_suggestions(suggestions);
    /// ```
    #[must_use]
    pub fn with_suggestions(mut self, suggestions: Suggestions<S>) -> Self {
        self.suggestions = Some(suggestions);
        self
    }

    /// Applies visual styling to this message.
    ///
    /// # Examples
    ///
    /// ```
    /// use anstyle::{Ansi256Color, Color, Style};
    /// use hashql_diagnostics::Message;
    ///
    /// let style = Style::new()
    ///     .bold()
    ///     .fg_color(Some(Color::Ansi256(Ansi256Color(196)))); // Bold red
    /// let important_note: Message<()> =
    ///     Message::note("Critical: This operation is irreversible").with_style(style);
    /// ```
    #[must_use]
    pub const fn with_style(mut self, style: Style) -> Self {
        self.style = Some(style);
        self
    }

    /// Sets the text color for this message.
    ///
    /// # Examples
    ///
    /// ```
    /// use anstyle::{Color, Ansi256Color};
    /// use hashql_diagnostics::Message;
    ///
    /// let warning: Message<()> =
    ///     Message::note("This feature is deprecated").with_color(Color::Ansi256(Ansi256Color(214))); // Orange
    /// ```
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

    fn render_suggestions<'this, R>(
        &'this self,
        suggestions: &'this Suggestions<S>,
        context: &mut RenderContext<'this, '_, '_, R>,
    ) -> Result<Group<'this>, RenderError<'this, S>>
    where
        S: DiagnosticSpan<R>,
    {
        let mut group =
            Group::with_title(self.render_level().secondary_title(self.render_message()));

        group = suggestions.render(group, context)?;
        Ok(group)
    }

    pub(crate) fn render_plain(&self) -> annotate_snippets::Message<'_> {
        self.render_level().message(self.render_message())
    }

    pub(crate) fn render<'this, R>(
        &'this self,
        context: &mut RenderContext<'this, '_, '_, R>,
    ) -> Result<Option<annotate_snippets::Message<'this>>, RenderError<'this, S>>
    where
        S: DiagnosticSpan<R>,
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

/// A collection of diagnostic messages (notes and help messages).
///
/// Messages are displayed after the main diagnostic and code labels to provide
/// additional context, explanations, and guidance to users. The collection can
/// be reordered so that notes appear before help messages for logical flow.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Message, diagnostic::Messages};
///
/// let mut messages: Messages<()> = Messages::new();
/// messages.push(Message::note("Variables should be camelCase"));
/// messages.push(Message::help("Consider renaming to 'userName'"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Messages<S> {
    messages: Vec<Message<S>>,
}

impl<S> Messages<S> {
    /// Creates a new empty collection of messages.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Message, diagnostic::Messages};
    ///
    /// let mut messages: Messages<()> = Messages::new();
    /// assert_eq!(messages.iter().count(), 0);
    ///
    /// messages.push(Message::note("This is a note"));
    /// messages.push(Message::help("This is helpful advice"));
    /// assert_eq!(messages.iter().count(), 2);
    /// ```
    #[must_use]
    pub const fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    /// Adds a message to the collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Message, diagnostic::Messages};
    ///
    /// let mut messages: Messages<()> = Messages::new();
    /// messages.push(Message::note("Variables should be camelCase"));
    /// messages.push(Message::help("Consider renaming to 'userName'"));
    ///
    /// assert_eq!(messages.iter().count(), 2);
    /// ```
    pub fn push(&mut self, message: Message<S>) {
        self.messages.push(message);
    }

    /// Reorders messages by type, placing notes before help messages.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Message, diagnostic::Messages};
    ///
    /// let mut messages: Messages<()> = Messages::new();
    /// messages.push(Message::help("Try using a different approach"));
    /// messages.push(Message::note("This pattern is discouraged"));
    /// messages.push(Message::help("Consider using method X instead"));
    /// messages.push(Message::note("Method Y has been deprecated"));
    ///
    /// // Before ordering: help, note, help, note
    /// messages.order_by_type();
    /// // After ordering: note, note, help, help
    /// ```
    pub fn order_by_type(&mut self) {
        // Order the messages so that we first have notes and then help messages
        self.messages.sort_by_key(|message| match message.kind {
            MessageKind::Help => 1,
            MessageKind::Note => 0,
        });
    }

    /// Returns an iterator over all messages in the collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Message, diagnostic::Messages};
    ///
    /// let mut messages: Messages<()> = Messages::new();
    /// messages.push(Message::note("Background information"));
    /// messages.push(Message::help("Actionable advice"));
    ///
    /// let texts: Vec<&str> = messages.iter().map(|msg| msg.message()).collect();
    /// assert_eq!(texts, ["Background information", "Actionable advice"]);
    /// ```
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

impl<'this, S> IntoIterator for &'this Messages<S> {
    type IntoIter = slice::Iter<'this, Message<S>>;
    type Item = &'this Message<S>;

    fn into_iter(self) -> Self::IntoIter {
        self.messages.iter()
    }
}
