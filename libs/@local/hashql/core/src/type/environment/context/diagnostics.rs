use alloc::vec;

use hashql_diagnostics::severity::SeverityKind as _;

use crate::r#type::error::TypeCheckDiagnostic;

/// A collection of type checking diagnostics produced during compilation.
///
/// This struct maintains a list of [`TypeCheckDiagnostic`] items and keeps track of
/// how many of them are fatal errors. This allows the compiler to collect multiple
/// errors before aborting, improving the development experience by reporting more
/// issues at once.
#[derive(Debug)]
pub struct Diagnostics {
    inner: Vec<TypeCheckDiagnostic>,
    fatal: usize,
}

impl Diagnostics {
    /// Create a new, empty diagnostics collection.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            inner: Vec::new(),
            fatal: 0,
        }
    }

    pub fn clear(&mut self) {
        self.inner.clear();
        self.fatal = 0;
    }

    /// Returns the number of fatal errors in the diagnostics collection.
    #[must_use]
    pub const fn fatal(&self) -> usize {
        self.fatal
    }

    /// Returns the number of diagnostics in the collection.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` if the diagnostics collection is empty.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Adds a new diagnostic to the collection.
    pub(crate) fn push(&mut self, diagnostic: TypeCheckDiagnostic) {
        if diagnostic.severity.is_critical() {
            self.fatal += 1;
        }

        self.inner.push(diagnostic);
    }

    /// Merges another diagnostics collection into this one.
    ///
    /// This adds the diagnostics from the other collection to this one and updates the fatal error
    /// count accordingly.
    pub fn merge(&mut self, other: Self) {
        self.fatal += other.fatal;
        self.inner.extend(other.inner);
    }

    /// Merges another diagnostics collection into this one.
    ///
    /// This adds the diagnostics from the other collection to this one and updates the fatal error
    /// count accordingly.
    pub fn merge_into(&mut self, diagnostics: &mut Self) {
        diagnostics.fatal += self.fatal;
        diagnostics.inner.append(&mut self.inner);
        self.fatal = 0;
    }

    /// Consumes the diagnostics collection and returns a vector of diagnostics.
    #[must_use]
    pub fn into_vec(self) -> Vec<TypeCheckDiagnostic> {
        self.inner
    }
}

impl IntoIterator for Diagnostics {
    type IntoIter = vec::IntoIter<Self::Item>;
    type Item = TypeCheckDiagnostic;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter()
    }
}

impl Default for Diagnostics {
    fn default() -> Self {
        Self::new()
    }
}
