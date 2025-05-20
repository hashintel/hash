use core::fmt::Write as _;

use anstream::adapter::strip_str;
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
    heap::Heap,
    module::{ModuleRegistry, locals::Local, namespace::ModuleNamespace},
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
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
            TypeDefinitionExtractor::new(&environment, &registry, heap.intern_symbol("::main"));
        extractor.visit_expr(&mut expr);

        let (locals, extractor_diagnostics) = extractor.finish();
        process_diagnostics(diagnostics, extractor_diagnostics)?;

        let mut node_renumberer = NodeRenumberer::new();
        node_renumberer.visit_expr(&mut expr);

        let mut extractor = TypeExtractor::new(&environment, &registry, &locals);
        extractor.visit_expr(&mut expr);

        process_diagnostics(diagnostics, extractor.take_diagnostics())?;

        let mut output = expr.syntax_dump_to_string();
        output.push_str("\n------------------------");

        let mut local_definitions: Vec<_> = locals.iter().collect();
        local_definitions.sort_by_key(|&Local { name, .. }| name);

        for def in local_definitions {
            let _: Result<(), _> = write!(
                output,
                "\n\n{}",
                strip_str(&def.pretty_print(&environment, PrettyOptions::default()))
            );
        }

        let (anon, closures) = extractor.into_types();

        output.push_str("\n------------------------");
        let mut anon: Vec<_> = anon.into_iter().collect();
        anon.sort_unstable();
        for (node_id, type_id) in anon {
            let r#type = environment.r#type(type_id);

            let _: Result<(), _> = write!(
                output,
                "\n\n{node_id} = {}",
                strip_str(&r#type.pretty_print(&environment, PrettyOptions::default()))
            );
        }

        output.push_str("\n------------------------");
        let mut closures: Vec<_> = closures.into_iter().collect();
        closures.sort_unstable_by_key(|&(key, _)| key);

        for (node_id, def) in closures {
            let _: Result<(), _> = write!(
                output,
                "\n\n{node_id}{}",
                strip_str(&def.pretty_print(&environment, PrettyOptions::default()))
            );
        }

        Ok(output)
    }
}
