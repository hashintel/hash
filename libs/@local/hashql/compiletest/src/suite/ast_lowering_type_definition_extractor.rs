use core::fmt::Write as _;

use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        import_resolver::ImportResolver, name_mangler::NameMangler,
        pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander, type_extractor::TypeDefinitionExtractor,
    },
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{
    module::{
        ModuleRegistry,
        locals::{Local, TypeDef},
        namespace::ModuleNamespace,
    },
    pretty::{Formatter, RenderOptions},
    r#type::{TypeFormatter, environment::Environment, kind::generic::GenericArgumentReference},
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};
use crate::suite::common::Annotated;

pub(crate) struct AstLoweringTypeDefinitionExtractorSuite;

impl Suite for AstLoweringTypeDefinitionExtractorSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/type-definition-extractor"
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

        let mut mangler = NameMangler::new(heap);
        mangler.visit_expr(&mut expr);

        let mut extractor =
            TypeDefinitionExtractor::new(&environment, &registry, heap.intern_symbol("::main"));
        extractor.visit_expr(&mut expr);

        let (locals, extractor_diagnostics) = extractor.finish();
        process_issues(diagnostics, extractor_diagnostics)?;

        let mut output = expr.syntax_dump_to_string();
        output.push_str("\n------------------------");

        let mut locals: Vec<_> = locals.iter().collect();
        locals.sort_by_key(|&Local { name, .. }| name);

        let formatter = Formatter::new(heap);
        let mut formatter = TypeFormatter::with_defaults(&formatter, &environment);

        for &Local {
            name,
            value: TypeDef { id, arguments },
        } in locals
        {
            let _: Result<(), _> = write!(
                output,
                "\n\n{}",
                Annotated {
                    content: format!(
                        "{name}{}",
                        GenericArgumentReference::display_mangled(&arguments)
                    ),
                    annotation: formatter.render(id, RenderOptions::default().with_plain())
                }
            );
        }

        Ok(output)
    }
}
