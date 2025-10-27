use alloc::borrow::Cow;
use core::slice;

#[cfg(feature = "render")]
use annotate_snippets::{Annotation, AnnotationKind};

#[cfg(feature = "render")]
use super::render::{RenderContext, RenderError};
#[cfg(feature = "render")]
use crate::source::{DiagnosticSpan, SourceSpan};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub(crate) enum LabelKind {
    Primary,
    Secondary,
}

/// A label pointing to a specific location in source code with explanatory text.
///
/// Labels highlight relevant parts of the code and provide context about diagnostic issues.
/// They can be primary (the main focus of the diagnostic) or secondary (providing additional
/// context). Labels can optionally be highlighted for visual emphasis when rendered.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::Label;
///
/// // Create a label pointing to a syntax error
/// let error_label = Label::new(15..20, "unexpected token");
///
/// // Create a highlighted label for emphasis
/// let important = Label::new(25..30, "critical issue").with_highlight(true);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Label<S> {
    span: S,
    kind: LabelKind,
    message: Cow<'static, str>,

    pub highlight: bool,
}

impl<S> Label<S> {
    /// Creates a new label with the specified span and message.
    ///
    /// Labels created with this method are secondary by default. The first label
    /// added to a diagnostic becomes the primary label automatically.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let label = Label::new(10..15, "variable declared here");
    /// assert_eq!(label.message(), "variable declared here");
    /// assert_eq!(label.span(), &(10..15));
    /// assert!(!label.highlight);
    /// ```
    pub const fn new<M>(span: S, message: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            span,
            kind: LabelKind::Secondary,
            message: message.into(),
            highlight: false,
        }
    }

    /// Returns a reference to the span that this label points to.
    ///
    /// The span indicates the location in the source code that this label is highlighting.
    /// This could be a byte range, line/column position, or any other representation
    /// of a source location depending on the span type `S`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let label = Label::new(10..20, "error occurred here");
    /// assert_eq!(label.span(), &(10..20));
    /// ```
    pub const fn span(&self) -> &S {
        &self.span
    }

    /// Transforms the span type of this label using the provided function.
    ///
    /// This method applies a transformation function to convert the label's span from one
    /// type to another while preserving all other label properties. This is useful when moving
    /// labels between different compilation phases that use different span representations.
    ///
    /// # Examples
    ///
    /// Converting from a range to a tuple representation:
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let label = Label::new(10..15, "issue here");
    /// let converted = label.map_span(|range| (range.start, range.end));
    ///
    /// assert_eq!(converted.span(), &(10, 15));
    /// assert_eq!(converted.message(), "issue here");
    /// ```
    ///
    /// Adding an offset to a span:
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let label = Label::new(5..8, "error");
    /// let offset_label = label.map_span(|range| (range.start + 100)..(range.end + 100));
    ///
    /// assert_eq!(offset_label.span(), &(105..108));
    /// ```
    pub fn map_span<S2>(self, func: impl FnOnce(S) -> S2) -> Label<S2> {
        Label {
            span: func(self.span),
            kind: self.kind,
            message: self.message,

            highlight: self.highlight,
        }
    }

    /// Returns the explanatory message text for this label.
    ///
    /// The message provides context about what's happening at the location pointed to by
    /// this label's span. This text is typically displayed alongside the highlighted
    /// source code when the diagnostic is rendered.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let label = Label::new(42..47, "undefined variable 'x'");
    /// assert_eq!(label.message(), "undefined variable 'x'");
    /// ```
    pub fn message(&self) -> &str {
        &self.message
    }

    /// Sets whether this label should be highlighted when rendered.
    ///
    /// Highlighted labels receive visual emphasis when the diagnostic is displayed,
    /// typically through background colors or other styling. This is useful for
    /// drawing attention to the most important parts of the code related to the
    /// diagnostic issue.
    ///
    /// Returns the modified label for method chaining.
    ///
    /// # Examples
    ///
    /// Creating a highlighted label for emphasis:
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let highlighted = Label::new(10..15, "critical error here").with_highlight(true);
    /// assert!(highlighted.highlight);
    /// ```
    ///
    /// Disabling highlighting:
    ///
    /// ```
    /// use hashql_diagnostics::Label;
    ///
    /// let normal = Label::new(20..25, "context information").with_highlight(false);
    /// assert!(!normal.highlight);
    /// ```
    #[must_use]
    pub const fn with_highlight(mut self, highlight: bool) -> Self {
        self.highlight = highlight;
        self
    }
}

#[cfg(feature = "render")]
impl<S> Label<S> {
    pub(crate) fn render<R>(
        &self,
        context: &mut RenderContext<R>,
    ) -> Result<Annotation<'_>, RenderError<'_, S>>
    where
        S: DiagnosticSpan<R>,
    {
        let span = SourceSpan::resolve(&self.span, context.resolver)
            .ok_or(RenderError::SpanNotFound(None, &self.span))?;

        let kind = match self.kind {
            LabelKind::Primary => AnnotationKind::Primary,
            LabelKind::Secondary => AnnotationKind::Context,
        };

        Ok(kind
            .span(span.range().into())
            .label(&*self.message)
            .highlight_source(self.highlight))
    }
}

/// A collection of labels for a diagnostic, with exactly one primary label.
///
/// The labels collection maintains a set of labels where the first label is always
/// the primary label (the main focus of the diagnostic), and all subsequent labels
/// are secondary labels that provide additional context.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Label, diagnostic::Labels};
///
/// // Create labels collection with a primary label
/// let primary = Label::new(25..30, "undefined variable");
/// let mut labels = Labels::new(primary);
///
/// // Add secondary labels for context
/// labels.push(Label::new(10..15, "similar variable defined here"));
/// labels.push(Label::new(50..55, "did you mean this variable?"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Labels<S> {
    labels: Vec<Label<S>>,
}

impl<S> Labels<S> {
    /// Creates a new label collection with the given label as the primary label.
    ///
    /// The provided label becomes the primary label regardless of its original kind.
    /// Additional secondary labels can be added using [`push`](Self::push).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Label, diagnostic::Labels};
    ///
    /// let primary_label = Label::new(15..20, "syntax error here");
    /// let labels = Labels::new(primary_label);
    ///
    /// assert_eq!(labels.iter().count(), 1);
    /// ```
    pub fn new(mut primary: Label<S>) -> Self {
        primary.kind = LabelKind::Primary;

        Self {
            labels: vec![primary],
        }
    }

    /// Adds a secondary label to the collection.
    ///
    /// All labels added via this method become secondary labels, which have the purpose of
    /// providing additional context to the primary diagnostic issue.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Label, diagnostic::Labels};
    ///
    /// let primary = Label::new(25..30, "variable redefined");
    /// let mut labels = Labels::new(primary);
    ///
    /// // Add labels showing related locations
    /// labels.push(Label::new(10..15, "first definition here"));
    /// labels.push(Label::new(40..45, "also used here"));
    ///
    /// assert_eq!(labels.iter().count(), 3);
    /// ```
    pub fn push(&mut self, label: impl Into<Label<S>>) {
        self.labels.push(label.into());
    }

    /// Returns an iterator over all labels, with the primary label first.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Label, diagnostic::Labels};
    ///
    /// let primary = Label::new(10..15, "main error");
    /// let mut labels = Labels::new(primary);
    /// labels.push(Label::new(20..25, "related issue"));
    /// labels.push(Label::new(30..35, "context"));
    ///
    /// let messages: Vec<&str> = labels.iter().map(|label| label.message()).collect();
    /// assert_eq!(messages, vec!["main error", "related issue", "context"]);
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = &Label<S>> {
        self.labels.iter()
    }

    #[cfg(feature = "render")]
    pub(crate) fn as_slice(&self) -> &[Label<S>] {
        &self.labels
    }

    pub(crate) fn map<T>(self, func: impl FnMut(Label<S>) -> Label<T>) -> Labels<T> {
        Labels {
            labels: self.labels.into_iter().map(func).collect(),
        }
    }
}

impl<'this, S> IntoIterator for &'this Labels<S> {
    type IntoIter = slice::Iter<'this, Label<S>>;
    type Item = &'this Label<S>;

    fn into_iter(self) -> Self::IntoIter {
        self.labels.iter()
    }
}
