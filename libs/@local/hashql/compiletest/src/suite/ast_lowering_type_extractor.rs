use core::fmt::Write as _;

use anstream::adapter::strip_str;
use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        import_resolver::ImportResolver, name_mangler::NameMangler,
        pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander, type_extractor::TypeExtractor,
    },
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{
    heap::Heap,
    module::{ModuleRegistry, locals::LocalTypeDef, namespace::ModuleNamespace},
    span::SpanId,
    r#type::{environment::Environment, pretty_print::PrettyPrint as _},
};

use super::{Suite, SuiteDiagnostic, common::process_diagnostics};

pub(crate) struct AstLoweringTypeExtractorSuite;

impl Suite for AstLoweringTypeExtractorSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/type-extractor"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(SpanId::SYNTHETIC, heap);
        let registry = ModuleRegistry::new(&environment);

        let mut resolver = PreExpansionNameResolver::new(&registry);

        resolver.visit_expr(&mut expr);

        let mut expander = SpecialFormExpander::new(heap);
        expander.visit_expr(&mut expr);

        process_diagnostics(diagnostics, expander.take_diagnostics())?;

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let mut resolver = ImportResolver::new(heap, namespace);
        resolver.visit_expr(&mut expr);

        process_diagnostics(diagnostics, resolver.take_diagnostics())?;

        let mut mangler = NameMangler::new(heap);
        mangler.visit_expr(&mut expr);

        let mut extractor =
            TypeExtractor::new(&environment, &registry, heap.intern_symbol("::main"));
        extractor.visit_expr(&mut expr);

        let (locals, extractor_diagnostics) = extractor.finish();
        process_diagnostics(diagnostics, extractor_diagnostics)?;

        let mut output = expr.syntax_dump_to_string();
        output.push_str("\n------------------------");

        let mut locals: Vec<_> = locals.iter().collect();
        locals.sort_by_key(|&LocalTypeDef { name, .. }| name);

        for LocalTypeDef { id, name } in locals {
            let _: Result<(), _> = write!(
                output,
                "\n\n{name} = {}",
                strip_str(&environment.r#type(id).pretty_print(&environment, 80))
            );
        }

        Ok(output)
    }
}
