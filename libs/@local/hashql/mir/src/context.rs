use hashql_core::{heap::Heap, r#type::environment::Environment};

use crate::{error::MirDiagnosticIssues, intern::Interner};

#[derive(Debug)]
pub struct MirContext<'env, 'heap> {
    pub heap: &'heap Heap,
    pub env: &'env Environment<'heap>,
    pub interner: &'env Interner<'heap>,
    pub diagnostics: MirDiagnosticIssues,
}

impl<'env, 'heap> MirContext<'env, 'heap> {
    pub const fn new(env: &'env Environment<'heap>, interner: &'env Interner<'heap>) -> Self {
        Self {
            heap: env.heap,
            env,
            interner,
            diagnostics: MirDiagnosticIssues::new(),
        }
    }
}
