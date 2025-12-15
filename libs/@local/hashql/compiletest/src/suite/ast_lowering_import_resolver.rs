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

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLoweringImportResolverSuite;

impl Suite for AstLoweringImportResolverSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/import-resolver"
    }

    fn description(&self) -> &'static str {
        "Import and module resolution in the AST"
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

        process_issues(diagnostics, expander.take_diagnostics())?;

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let mut resolver = ImportResolver::new(heap, namespace);
        resolver.visit_expr(&mut expr);

        process_issues(diagnostics, resolver.take_diagnostics())?;

        Ok(expr.syntax_dump_to_string())
    }
}
