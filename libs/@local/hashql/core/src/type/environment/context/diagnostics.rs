use crate::r#type::error::TypeCheckDiagnostic;

pub struct Diagnostics {
    inner: Vec<TypeCheckDiagnostic>,
    fatal: usize,
}

impl Diagnostics {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            inner: Vec::new(),
            fatal: 0,
        }
    }

    pub fn take(&mut self) -> Vec<TypeCheckDiagnostic> {
        core::mem::take(&mut self.inner)
    }

    pub fn replace(&mut self, diagnostics: Vec<TypeCheckDiagnostic>) {
        self.fatal = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count();

        self.inner = diagnostics;
    }

    #[must_use]
    pub const fn fatal(&self) -> usize {
        self.fatal
    }

    pub fn push(&mut self, diagnostic: TypeCheckDiagnostic) {
        if diagnostic.severity.is_fatal() {
            self.fatal += 1;
        }

        self.inner.push(diagnostic);
    }
}

impl Default for Diagnostics {
    fn default() -> Self {
        Self::new()
    }
}
