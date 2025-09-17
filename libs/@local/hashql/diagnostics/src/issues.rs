use crate::{Diagnostic, category::DiagnosticCategory};

pub type BoxedDiagnosticIssues<'category, S> =
    DiagnosticIssues<Box<dyn DiagnosticCategory + 'category>, S>;

pub struct DiagnosticIssues<C, S> {
    diagnostics: Vec<Diagnostic<C, S>>,
    fatal: usize,
}

impl<C, S> DiagnosticIssues<C, S> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            fatal: 0,
        }
    }

    pub fn map<C2, S2>(
        self,
        func: impl FnMut(Diagnostic<C, S>) -> Diagnostic<C2, S2>,
    ) -> DiagnosticIssues<C2, S2> {
        DiagnosticIssues {
            diagnostics: self.diagnostics.into_iter().map(func).collect(),
            fatal: self.fatal,
        }
    }

    pub fn map_category<C2>(self, mut func: impl FnMut(C) -> C2) -> DiagnosticIssues<C2, S> {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.map_category(&mut func))
                .collect(),
            fatal: self.fatal,
        }
    }

    pub fn boxed<'category>(self) -> BoxedDiagnosticIssues<'category, S>
    where
        C: DiagnosticCategory + 'category,
    {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(Diagnostic::boxed)
                .collect(),
            fatal: self.fatal,
        }
    }

    pub fn clear(&mut self) {
        self.diagnostics.clear();
        self.fatal = 0;
    }

    #[must_use]
    pub const fn fatal(&self) -> usize {
        self.fatal
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.diagnostics.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.diagnostics.is_empty()
    }

    pub fn push(&mut self, diagnostic: Diagnostic<C, S>) {
        self.fatal += usize::from(diagnostic.severity.is_fatal());
        self.diagnostics.push(diagnostic);
    }

    pub fn append(&mut self, other: &mut Self) {
        self.fatal += other.fatal;
        self.diagnostics.append(&mut other.diagnostics);
    }

    pub fn iter(&self) -> impl Iterator<Item = &Diagnostic<C, S>> {
        self.diagnostics.iter()
    }
}

impl<C, S> Extend<Diagnostic<C, S>> for DiagnosticIssues<C, S> {
    #[expect(clippy::indexing_slicing, reason = "indexing is checke")]
    fn extend<T: IntoIterator<Item = Diagnostic<C, S>>>(&mut self, iter: T) {
        let previous = self.diagnostics.len();
        self.diagnostics.extend(iter);

        if self.diagnostics.len() == previous {
            return;
        }

        self.fatal += self.diagnostics[previous..]
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count();
    }
}

impl<C, S> IntoIterator for DiagnosticIssues<C, S> {
    type IntoIter = alloc::vec::IntoIter<Self::Item>;
    type Item = Diagnostic<C, S>;

    fn into_iter(self) -> Self::IntoIter {
        self.diagnostics.into_iter()
    }
}

impl<C, S> Default for DiagnosticIssues<C, S> {
    fn default() -> Self {
        Self::new()
    }
}
