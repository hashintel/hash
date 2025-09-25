use core::borrow::Borrow;
use std::borrow::Cow;

#[cfg(feature = "render")]
use annotate_snippets::Group;
use error_stack::{Report, TryReportIteratorExt as _};

#[cfg(feature = "render")]
use crate::source::Sources;
use crate::{
    error::ResolveError,
    source::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

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

    pub(crate) fn resolve<C>(
        self,
        context: &mut C,
    ) -> Result<Patch<AbsoluteDiagnosticSpan>, Report<ResolveError>>
    where
        S: DiagnosticSpan<C>,
    {
        let span = AbsoluteDiagnosticSpan::new(&self.span, context)?;

        Ok(Patch {
            span,
            replacement: self.replacement,
        })
    }
}

impl Patch<AbsoluteDiagnosticSpan> {
    #[cfg(feature = "render")]
    pub(crate) fn render(&self) -> annotate_snippets::Patch {
        annotate_snippets::Patch::new(self.span.range().into(), &*self.replacement)
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

    pub(crate) fn resolve<C>(
        self,
        context: &mut C,
    ) -> Result<Suggestions<AbsoluteDiagnosticSpan>, Report<[ResolveError]>>
    where
        S: DiagnosticSpan<C>,
    {
        let patches = self
            .patches
            .into_iter()
            .map(|patch| patch.resolve(context))
            .try_collect_reports()?;

        Ok(Suggestions {
            patches,
            trailer: self.trailer,
        })
    }

    pub(crate) fn map_patches<T>(self, func: impl FnMut(Patch<S>) -> Patch<T>) -> Suggestions<T> {
        Suggestions {
            patches: self.patches.into_iter().map(func).collect(),
            trailer: self.trailer,
        }
    }
}

#[cfg(feature = "render")]
impl Suggestions<AbsoluteDiagnosticSpan> {
    pub(crate) fn render<'this>(
        &'this self,
        sources: &'this Sources,
        mut group: Group<'this>,
    ) -> Group<'this> {
        use annotate_snippets::{Level, Snippet};

        for chunk in self
            .patches
            .chunk_by(|lhs, rhs| lhs.span().source() == rhs.span().source())
        {
            assert!(!chunk.is_empty());

            let source = chunk[0].span().source();
            let source = sources.get(source).unwrap();

            let snippet = Snippet::source(&*source.content)
                .path(source.path.as_deref())
                .patches(chunk.iter().map(Patch::render));

            group = group.element(snippet);
        }

        if let Some(trailer) = self.trailer.as_deref() {
            group = group.element(Level::NOTE.no_name().message(trailer));
        }

        group
    }
}
