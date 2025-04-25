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

    #[must_use]
    pub const fn fatal(&self) -> usize {
        self.fatal
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.inner.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub(crate) fn push(&mut self, diagnostic: TypeCheckDiagnostic) {
        if diagnostic.severity.is_fatal() {
            self.fatal += 1;
        }

        self.inner.push(diagnostic);
    }

    pub fn merge(&mut self, other: Self) {
        self.fatal += other.fatal;
        self.inner.extend(other.inner);
    }

    #[must_use]
    pub fn into_vec(self) -> Vec<TypeCheckDiagnostic> {
        self.inner
    }
}

impl Default for Diagnostics {
    fn default() -> Self {
        Self::new()
    }
}
