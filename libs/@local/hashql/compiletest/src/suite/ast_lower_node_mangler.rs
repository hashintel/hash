use hashql_ast::{
    format::SyntaxDump as _,
    lower::{expander::Expander, name_mangler::NameMangler},
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{
    heap::Scratch,
    module::{ModuleRegistry, namespace::ModuleNamespace},
    r#type::environment::Environment,
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLowerNameManglerSuite;

impl Suite for AstLowerNameManglerSuite {
    fn name(&self) -> &'static str {
        "ast/lower/name-mangler"
    }

    fn description(&self) -> &'static str {
        "Name mangling for unique identification"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        mut expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);
        let mut scratch = Scratch::new();

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let mut expander = Expander::new(namespace, &mut scratch);
        expander.visit_expr(&mut expr);
        process_issues(diagnostics, expander.take_diagnostics())?;

        let mut renumberer = NameMangler::new(heap);
        renumberer.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
