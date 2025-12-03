use core::fmt::Write as _;

use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        import_resolver::ImportResolver,
        name_mangler::NameMangler,
        node_renumberer::NodeRenumberer,
        pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander,
        type_extractor::{TypeDefinitionExtractor, TypeExtractor},
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

pub(crate) struct AstLoweringTypeExtractorSuite;

impl Suite for AstLoweringTypeExtractorSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/type-extractor"
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

        let mut node_renumberer = NodeRenumberer::new();
        node_renumberer.visit_expr(&mut expr);

        let mut extractor = TypeExtractor::new(&environment, &registry, &locals);
        extractor.visit_expr(&mut expr);

        process_issues(diagnostics, extractor.take_diagnostics())?;

        let mut output = expr.syntax_dump_to_string();
        output.push_str("\n------------------------");

        let mut local_definitions: Vec<_> = locals.iter().collect();
        local_definitions.sort_by_key(|&Local { name, .. }| name);

        let formatter = Formatter::new(heap);
        let mut formatter = TypeFormatter::with_defaults(&formatter, &environment);

        for &Local {
            name,
            value: TypeDef { id, arguments },
        } in local_definitions
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

        let (anon, closures) = extractor.into_types();

        output.push_str("\n------------------------");
        let mut anon: Vec<_> = anon.into_iter().collect();
        anon.sort_unstable();
        for (node_id, type_id) in anon {
            let _: Result<(), _> = write!(
                output,
                "\n\n{node_id} = {}",
                formatter.render(type_id, RenderOptions::default().with_plain())
            );
        }

        output.push_str("\n------------------------");
        let mut closures: Vec<_> = closures.into_iter().collect();
        closures.sort_unstable_by_key(|&(key, _)| key);

        for (node_id, TypeDef { id, arguments }) in closures {
            let _: Result<(), _> = write!(
                output,
                "\n\n{}",
                Annotated {
                    content: format!(
                        "{node_id}{}",
                        GenericArgumentReference::display_mangled(&arguments)
                    ),
                    annotation: formatter.render(id, RenderOptions::default().with_plain())
                }
            );
        }

        Ok(output)
    }
}
