use alloc::borrow::Cow;
use core::borrow::Borrow;

#[cfg(feature = "render")]
use annotate_snippets::Group;

#[cfg(feature = "render")]
use super::render::{RenderContext, RenderError};
#[cfg(feature = "render")]
use crate::source::{DiagnosticSpan, SourceSpan};

/// A code patch that replaces a span of source code with new text.
///
/// Patches represent concrete code changes that can be applied to fix issues
/// identified by diagnostics. They specify exactly what text should replace
/// a particular location in the source code, which enable automated fixes or
/// providing clear suggestions for manual corrections.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::Patch;
///
/// // Fix a typo
/// let typo_fix = Patch::new(20..25, "function");
///
/// // Add missing punctuation
/// let punctuation = Patch::new(30..30, ";");
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Patch<S> {
    span: S,
    replacement: Cow<'static, str>,
}

impl<S> Patch<S> {
    /// Creates a new patch that replaces the given span with the specified text.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Patch;
    ///
    /// let patch = Patch::new(10..15, "corrected_value");
    /// assert_eq!(patch.span(), &(10..15));
    /// assert_eq!(patch.replacement(), "corrected_value");
    /// ```
    pub const fn new<M>(span: S, replacement: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            span,
            replacement: replacement.into(),
        }
    }

    /// Returns a reference to the span that this patch will replace.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Patch;
    ///
    /// let patch = Patch::new(15..20, "new_text");
    /// assert_eq!(patch.span(), &(15..20));
    /// ```
    pub const fn span(&self) -> &S {
        &self.span
    }

    /// Returns the replacement text that should replace the span.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Patch;
    ///
    /// let patch = Patch::new(10..15, "fixed_code");
    /// assert_eq!(patch.replacement(), "fixed_code");
    /// ```
    pub fn replacement(&self) -> &str {
        &self.replacement
    }

    /// Transforms the span type of this patch using the provided function.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Patch;
    ///
    /// let patch = Patch::new(10..15, "replacement");
    /// let absolute = patch.map_span(|range| (range.start, range.end));
    ///
    /// assert_eq!(absolute.span(), &(10, 15));
    /// assert_eq!(absolute.replacement(), "replacement");
    /// ```
    pub fn map_span<S2>(self, func: impl FnOnce(S) -> S2) -> Patch<S2> {
        Patch {
            span: func(self.span),
            replacement: self.replacement,
        }
    }
}

#[cfg(feature = "render")]
impl<S> Patch<S> {
    pub(crate) fn render<R>(
        &self,
        context: &mut RenderContext<R>,
    ) -> Result<annotate_snippets::Patch<'_>, RenderError<'_, S>>
    where
        S: DiagnosticSpan<R>,
    {
        let span = SourceSpan::resolve(&self.span, context.resolver)
            .ok_or(RenderError::SpanNotFound(None, &self.span))?;

        Ok(annotate_snippets::Patch::new(
            span.range().into(),
            &*self.replacement,
        ))
    }
}

/// A collection of code patches with optional trailing message.
///
/// Suggestions group related patches and may indicate related patches that should be applied
/// together to fix or alternative ways of addressing the diagnostic issue. They
/// can include an optional trailer message that provides additional context or instructions.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Patch, Suggestions};
///
/// // Create suggestions with a single patch
/// let patch = Patch::new(10..15, "corrected");
/// let suggestions = Suggestions::patch(patch);
///
/// // Build complex suggestions with multiple patches
/// let main_fix = Patch::new(20..25, "new_function");
/// let mut suggestions = Suggestions::patch(main_fix);
/// suggestions.push(Patch::new(30..35, "updated_param"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Suggestions<S> {
    patches: Vec<Patch<S>>,
    pub trailer: Option<Cow<'static, str>>,
}

impl<S> Suggestions<S> {
    /// Creates a suggestions collection containing a single patch.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Patch, Suggestions};
    ///
    /// let patch = Patch::new(10..15, "corrected");
    /// let suggestions = Suggestions::patch(patch);
    /// ```
    pub fn patch(patch: Patch<S>) -> Self {
        Self {
            patches: vec![patch],
            trailer: None,
        }
    }

    /// Adds an additional patch to this suggestions collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Patch, Suggestions};
    ///
    /// let first_patch = Patch::new(10..15, "new_name");
    /// let mut suggestions = Suggestions::patch(first_patch);
    ///
    /// suggestions.push(Patch::new(25..30, "updated_call"));
    /// suggestions.push(Patch::new(40..50, "fixed_reference"));
    /// ```
    pub fn push(&mut self, patch: Patch<S>) {
        self.patches.push(patch);
    }

    /// Adds a trailer message to existing suggestions.
    ///
    /// The trailer message provides additional context or instructions that will
    /// be displayed after any code suggestions.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Patch, Suggestions};
    ///
    /// let patch = Patch::new(10..15, "fixed_code");
    /// let suggestions =
    ///     Suggestions::patch(patch).with_trailer("Remember to run tests after applying this fix");
    /// ```
    #[must_use]
    pub fn with_trailer(self, trailer: impl Into<Cow<'static, str>>) -> Self {
        Self {
            patches: self.patches,
            trailer: Some(trailer.into()),
        }
    }

    pub(crate) fn map_patches<T>(self, func: impl FnMut(Patch<S>) -> Patch<T>) -> Suggestions<T> {
        Suggestions {
            patches: self.patches.into_iter().map(func).collect(),
            trailer: self.trailer,
        }
    }
}

#[cfg(feature = "render")]
impl<S> Suggestions<S> {
    #[expect(clippy::panic_in_result_fn, reason = "chunks are always non-empty")]
    pub(crate) fn render<'this, R>(
        &'this self,
        mut group: Group<'this>,
        context: &mut RenderContext<'this, '_, '_, R>,
    ) -> Result<Group<'this>, RenderError<'this, S>>
    where
        S: DiagnosticSpan<R>,
    {
        use annotate_snippets::{Level, Snippet};

        for chunk in self.patches.chunk_by(|lhs, rhs| {
            lhs.span().source() == rhs.span().source()
                || lhs.span().is_synthetic()
                || rhs.span().is_synthetic()
        }) {
            assert!(!chunk.is_empty());

            let source_id = chunk
                .iter()
                .find_map(|patch| (!patch.span().is_synthetic()).then(|| patch.span().source()))
                .ok_or(RenderError::ConcreteSourceNotFound)?;

            let source = context
                .sources
                .get(source_id)
                .ok_or(RenderError::SourceNotFound(source_id))?;

            let mut snippet = Snippet::source(&*source.content).path(source.path.as_deref());

            for patch in chunk {
                let patch = patch.render(context).map_err(|error| match error {
                    RenderError::SpanNotFound(None, span) => {
                        RenderError::SpanNotFound(Some(source_id), span)
                    }
                    RenderError::SourceNotFound(_)
                    | RenderError::SpanNotFound(Some(_), _)
                    | RenderError::ConcreteSourceNotFound => error,
                })?;
                snippet = snippet.patch(patch);
            }

            group = group.element(snippet);
        }

        if let Some(trailer) = self.trailer.as_deref() {
            group = group.element(Level::NOTE.no_name().message(trailer));
        }

        Ok(group)
    }
}
