use alloc::borrow::Cow;
use core::borrow::Borrow;

use error_stack::{Report, TryReportIteratorExt as _};

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
    pub const fn new<R>(span: S, replacement: R) -> Self
    where
        R: [const] Into<Cow<'static, str>>,
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
}

impl<S> Patch<S> {
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
    pub(crate) fn render(&self) -> annotate_snippets::Patch<'_> {
        annotate_snippets::Patch::new(self.span().range().into(), self.replacement())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Patches<S> {
    patches: Vec<Patch<S>>,
}

impl<S> Patches<S> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            patches: Vec::new(),
        }
    }

    pub fn push(&mut self, patch: Patch<S>) {
        self.patches.push(patch);
    }

    pub(crate) fn as_slice(&self) -> &[Patch<S>] {
        &self.patches
    }

    pub(crate) fn resolve<C>(
        self,
        context: &mut C,
    ) -> Result<Patches<AbsoluteDiagnosticSpan>, Report<[ResolveError]>>
    where
        S: DiagnosticSpan<C>,
    {
        let patches = self
            .patches
            .into_iter()
            .map(|patch| patch.resolve(context))
            .try_collect_reports()?;

        Ok(Patches { patches })
    }
}

impl<S> const Default for Patches<S> {
    fn default() -> Self {
        Self::new()
    }
}
