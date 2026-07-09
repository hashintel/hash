//! AST lowering pipeline.
//!
//! Transforms a parsed HashQL AST into a form suitable for HIR construction
//! by running a sequence of passes that modify the tree in place.
//!
//! # Pipeline
//!
//! The [`lower`] function runs these passes in order:
//!
//! 1. [`Expander`] resolves names, expands special forms, and resolves imports in a single top-down
//!    traversal.
//! 2. [`Sanitizer`] validates the expanded tree (e.g. rejects bare special form references that
//!    survived expansion).
//! 3. [`NameMangler`] rewrites user-facing names into internal mangled forms.
//! 4. [`TypeDefinitionExtractor`] collects named type definitions.
//! 5. [`NodeRenumberer`] assigns unique IDs to every AST node.
//! 6. [`TypeExtractor`] collects anonymous types and closure signatures.
//!
//! Each pass may emit diagnostics. The pipeline continues through all passes
//! and returns the union of all diagnostics, so the user sees every error at
//! once rather than one pass at a time.
//!
//! [`Expander`]: expander::Expander
//! [`Sanitizer`]: sanitizer::Sanitizer
//! [`NameMangler`]: name_mangler::NameMangler
//! [`TypeDefinitionExtractor`]: type_extractor::TypeDefinitionExtractor
//! [`NodeRenumberer`]: node_renumberer::NodeRenumberer
//! [`TypeExtractor`]: type_extractor::TypeExtractor

use hashql_core::{
    heap::ResetAllocator,
    module::{ModuleRegistry, locals::TypeLocals, namespace::ModuleNamespace},
    span::SpanId,
    symbol::Symbol,
    r#type::environment::Environment,
};
use hashql_diagnostics::{DiagnosticIssues, Status, StatusExt as _};

use self::{
    error::LoweringDiagnosticCategory,
    expander::Expander,
    name_mangler::NameMangler,
    node_renumberer::NodeRenumberer,
    sanitizer::Sanitizer,
    type_extractor::{AnonymousTypes, ClosureSignatures, TypeDefinitionExtractor, TypeExtractor},
};
use crate::{node::expr::Expr, visit::Visitor as _};

pub mod error;
pub mod expander;
pub mod name_mangler;
pub mod node_renumberer;
pub mod sanitizer;
pub mod type_extractor;

/// Type information collected by the lowering pipeline.
#[derive(Debug)]
pub struct ExtractedTypes<'heap> {
    /// Named type definitions local to the current module.
    pub locals: TypeLocals<'heap>,

    /// Anonymous types from type expressions (tuples, unions, generics, etc.).
    pub anonymous: AnonymousTypes,

    /// Closure signatures from closure expressions.
    pub signatures: ClosureSignatures<'heap>,
}

/// Runs the full lowering pipeline on `expr`, modifying it in place.
///
/// Returns the collected [`ExtractedTypes`] on success. All passes run
/// regardless of earlier errors so that the returned diagnostics cover
/// the entire tree.
///
/// # Errors
///
/// Returns a [`Status`] containing diagnostics from any pass that failed:
///
/// - [`LoweringDiagnosticCategory::Expander`]: name resolution, special form expansion, or import
///   resolution errors.
/// - [`LoweringDiagnosticCategory::Sanitizer`]: invalid AST constructs that survived expansion.
/// - [`LoweringDiagnosticCategory::Extractor`]: type extraction errors.
pub fn lower<'heap, S>(
    module_name: Symbol<'heap>,
    expr: &mut Expr<'heap>,
    env: &Environment<'heap>,
    registry: &ModuleRegistry<'heap>,
    mut scratch: S,
) -> Status<ExtractedTypes<'heap>, LoweringDiagnosticCategory, SpanId>
where
    S: ResetAllocator,
{
    let mut diagnostics = DiagnosticIssues::new();

    let mut namespace = ModuleNamespace::new(registry);
    namespace.import_prelude();

    let mut expander = Expander::new(namespace, &mut scratch);
    expander.visit_expr(expr);
    diagnostics.append(
        &mut expander
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::Expander),
    );
    scratch.reset();

    let mut sanitizer = Sanitizer::new();
    sanitizer.visit_expr(expr);
    diagnostics.append(
        &mut sanitizer
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::Sanitizer),
    );

    let mut mangler = NameMangler::new(env.heap);
    mangler.visit_expr(expr);

    let mut extractor = TypeDefinitionExtractor::new(env, registry, module_name);
    extractor.visit_expr(expr);
    let (named_types, extractor_diagnostics) = extractor.finish();
    diagnostics
        .append(&mut extractor_diagnostics.map_category(LoweringDiagnosticCategory::Extractor));

    let mut renumberer = NodeRenumberer::new();
    renumberer.visit_expr(expr);

    let mut extractor = TypeExtractor::new(env, registry, &named_types);
    extractor.visit_expr(expr);
    diagnostics.append(
        &mut extractor
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::Extractor),
    );
    let (anonymous_types, closure_signatures) = extractor.into_types();

    let types = ExtractedTypes {
        locals: named_types,
        anonymous: anonymous_types,
        signatures: closure_signatures,
    };

    let mut result = Status::success(types);
    result.append_diagnostics(&mut diagnostics);
    result
}
