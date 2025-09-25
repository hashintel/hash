use alloc::borrow::Cow;
use core::borrow::Borrow;

#[cfg(feature = "render")]
use annotate_snippets::Group;

#[cfg(feature = "render")]
use super::render::{RenderContext, RenderError};
use crate::source::{DiagnosticSpan, SourceSpan};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Patch<S> {
    span: S,
    replacement: Cow<'static, str>,
}

impl<S> Patch<S> {
    pub const fn new<M>(span: S, replacement: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            span,
            replacement: replacement.into(),
        }
    }

    pub const fn span(&self) -> &S {
        &self.span
    }

    pub const fn replacement(&self) -> &str
    where
        String: [const] Borrow<str>,
    {
        &self.replacement
    }

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
            span.range.into(),
            &*self.replacement,
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Suggestions<S> {
    patches: Vec<Patch<S>>,
    pub trailer: Option<Cow<'static, str>>,
}

impl<S> Suggestions<S> {
    pub fn patch(patch: Patch<S>) -> Self {
        Self {
            patches: vec![patch],
            trailer: None,
        }
    }

    pub fn push(&mut self, patch: Patch<S>) {
        self.patches.push(patch);
    }

    pub const fn with_trailer<T>(trailer: T) -> Self
    where
        T: [const] Into<Cow<'static, str>>,
    {
        Self {
            patches: Vec::new(),
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
    #[expect(
        clippy::panic_in_result_fn,
        clippy::indexing_slicing,
        reason = "chunks are always non-empty"
    )]
    pub(crate) fn render<'this, R>(
        &'this self,
        mut group: Group<'this>,
        context: &mut RenderContext<'this, '_, '_, R>,
    ) -> Result<Group<'this>, RenderError<'this, S>>
    where
        S: DiagnosticSpan<R>,
    {
        use annotate_snippets::{Level, Snippet};

        for chunk in self
            .patches
            .chunk_by(|lhs, rhs| lhs.span().source() == rhs.span().source())
        {
            assert!(!chunk.is_empty());

            let source_id = chunk[0].span().source();
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
                    RenderError::SourceNotFound(_) | RenderError::SpanNotFound(Some(_), _) => error,
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
