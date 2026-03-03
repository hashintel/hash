use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        import_resolver::ImportResolver, pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander,
    },
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{
    module::{ModuleRegistry, namespace::ModuleNamespace},
    r#type::environment::Environment,
};
use hashql_diagnostics::Diagnostic;

use super::{RunContext, Suite, SuiteDiagnostic};

pub(crate) struct AstLoweringImportResolverContinueSuite;

impl Suite for AstLoweringImportResolverContinueSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/import-resolver/continue"
    }

    fn description(&self) -> &'static str {
        "Import resolution with non-fatal error handling"
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

        let mut resolver = PreExpansionNameResolver::new(&registry);

        resolver.visit_expr(&mut expr);

        let mut expander = SpecialFormExpander::new(heap);
        expander.visit_expr(&mut expr);

        diagnostics.extend(
            expander
                .take_diagnostics()
                .into_iter()
                .map(Diagnostic::boxed),
        );

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let mut resolver = ImportResolver::new(heap, namespace);
        resolver.visit_expr(&mut expr);

        diagnostics.extend(
            resolver
                .take_diagnostics()
                .into_iter()
                .map(Diagnostic::boxed),
        );

        Ok(expr.syntax_dump_to_string())
    }
}
