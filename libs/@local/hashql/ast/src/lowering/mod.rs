use hashql_core::{
    module::{ModuleRegistry, locals::TypeLocals, namespace::ModuleNamespace},
    symbol::Symbol,
    r#type::environment::Environment,
};

use self::{
    error::{LoweringDiagnostic, LoweringDiagnosticCategory},
    import_resolver::ImportResolver,
    name_mangler::NameMangler,
    node_renumberer::NodeRenumberer,
    pre_expansion_name_resolver::PreExpansionNameResolver,
    sanitizer::Sanitizer,
    special_form_expander::SpecialFormExpander,
    type_extractor::{AnonymousTypes, ClosureSignatures, TypeDefinitionExtractor, TypeExtractor},
};
use crate::{node::expr::Expr, visit::Visitor as _};

pub mod error;
pub mod import_resolver;
pub mod name_mangler;
pub mod node_renumberer;
pub mod pre_expansion_name_resolver;
pub mod sanitizer;
pub mod special_form_expander;
pub mod type_extractor;

#[derive(Debug)]
pub struct ExtractedTypes<'heap> {
    pub locals: TypeLocals<'heap>,
    pub anonymous: AnonymousTypes,
    pub signatures: ClosureSignatures<'heap>,
}

pub fn lower<'heap>(
    module_name: Symbol<'heap>,
    expr: &mut Expr<'heap>,

    env: &Environment<'heap>,
    registry: &ModuleRegistry<'heap>,
) -> (ExtractedTypes<'heap>, Vec<LoweringDiagnostic>) {
    let mut diagnostics = Vec::new();

    let mut resolver = PreExpansionNameResolver::new(registry);
    resolver.visit_expr(expr);

    let mut expander = SpecialFormExpander::new(env.heap);
    expander.visit_expr(expr);
    diagnostics.extend(
        expander
            .take_diagnostics()
            .into_iter()
            .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::Expander)),
    );

    let mut sanitizer = Sanitizer::new();
    sanitizer.visit_expr(expr);
    diagnostics.extend(
        sanitizer
            .take_diagnostics()
            .into_iter()
            .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::Sanitizer)),
    );

    let mut namespace = ModuleNamespace::new(registry);
    namespace.import_prelude();

    let mut resolver = ImportResolver::new(env.heap, namespace);
    resolver.visit_expr(expr);
    diagnostics.extend(
        resolver
            .take_diagnostics()
            .into_iter()
            .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::Resolver)),
    );

    let mut mangler = NameMangler::new(env.heap);
    mangler.visit_expr(expr);

    let mut extractor = TypeDefinitionExtractor::new(env, registry, module_name);
    extractor.visit_expr(expr);
    let (named_types, extractor_diagnostics) = extractor.finish();
    diagnostics.extend(
        extractor_diagnostics
            .into_iter()
            .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::Extractor)),
    );

    let mut renumberer = NodeRenumberer::new();
    renumberer.visit_expr(expr);

    let mut extractor = TypeExtractor::new(env, registry, &named_types);
    extractor.visit_expr(expr);
    diagnostics.extend(
        extractor
            .take_diagnostics()
            .into_iter()
            .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::Extractor)),
    );
    let (anonymous_types, closure_signatures) = extractor.into_types();

    (
        ExtractedTypes {
            locals: named_types,
            anonymous: anonymous_types,
            signatures: closure_signatures,
        },
        diagnostics,
    )
}
