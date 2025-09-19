//! HashQL AST lowering and transformation pipeline.
//!
//! This module provides the core lowering functionality that transforms parsed HashQL AST nodes
//! into a form suitable for type checking and code generation in the HIR. The lowering process
//! applies multiple transformation passes including name resolution, special form expansion,
//! sanitization, import resolution, name mangling, type extraction, and node renumbering.
//!
//! The lowering pipeline ensures that:
//! - All names are properly resolved and scoped
//! - Special forms and macros are expanded
//! - Code is sanitized for safety and correctness
//! - Type information is extracted and preserved
//! - Nodes are uniquely numbered for analysis
//!
//! # Pipeline Overview
//!
//! The [`lower`] function orchestrates the complete transformation pipeline:
//!
//! 1. **Pre-expansion name resolution** - Resolves names before macro expansion
//! 2. **Special form expansion** - Expands macros and special language constructs
//! 3. **Sanitization** - Applies safety and correctness transformations
//! 4. **Import resolution** - Resolves module imports and builds namespace
//! 5. **Name mangling** - Applies name mangling for code generation
//! 6. **Type definition extraction** - Extracts named type definitions
//! 7. **Node renumbering** - Assigns unique identifiers to AST nodes
//! 8. **Type extraction** - Extracts anonymous types and closure signatures
//!
//! # Examples
//!
//! ```rust
//! use hashql_ast::lowering::lower;
//! use hashql_core::{
//!     r#type::environment::Environment,
//!     module::ModuleRegistry,
//!     symbol::Symbol,
//! };
//!
//! # fn example(env: &Environment, registry: &ModuleRegistry, mut expr: hashql_ast::node::expr::Expr) {
//! let module_name = Symbol::intern("my_module");
//! let result = lower(module_name, &mut expr, env, registry);
//!
//! match result.into_result() {
//!     Ok(extracted_types) => {
//!         // Use extracted type information for analysis
//!         println!("Extracted {} local types", extracted_types.locals.len());
//!     }
//!     Err(diagnostics) => {
//!         // Handle lowering errors
//!         eprintln!("Lowering failed with {} errors", diagnostics.len());
//!     }
//! }
//! # }
//! ```

use hashql_core::{
    module::{ModuleRegistry, locals::TypeLocals, namespace::ModuleNamespace},
    span::SpanId,
    symbol::Symbol,
    r#type::environment::Environment,
};
use hashql_diagnostics::{DiagnosticIssues, Status, StatusExt as _};

use self::{
    error::LoweringDiagnosticCategory,
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

/// Type information extracted during the lowering process.
///
/// This structure contains all the type-related information that is discovered and extracted
/// during the AST lowering pipeline. It includes locally defined types, anonymous types
/// (such as tuple types or array types), and closure signatures.
///
/// The extracted types are used by subsequent compilation phases for type checking,
/// inference, and code generation.
#[derive(Debug)]
pub struct ExtractedTypes<'heap> {
    /// Named type definitions local to the current module.
    ///
    /// These are types that have been explicitly defined in the source code with names,
    /// such as struct definitions, enum definitions, and type aliases.
    pub locals: TypeLocals<'heap>,

    /// Anonymous types discovered during lowering.
    ///
    /// These include types that don't have explicit names in the source code but are
    /// constructed from type expressions, such as tuple types, array types, function
    /// types, and generic instantiations.
    pub anonymous: AnonymousTypes,

    /// Closure signatures extracted from closure expressions.
    ///
    /// Contains type signature information for all closure expressions found in the
    /// AST, including parameter types, return types, and capture information.
    pub signatures: ClosureSignatures<'heap>,
}

/// Performs the complete AST lowering transformation pipeline.
///
/// This function orchestrates all the transformation passes required to convert a parsed HashQL AST
/// into a form suitable for type checking and code generation. The lowering process is destructive
/// - it modifies the provided AST in place while extracting type information and collecting
/// diagnostics.
///
/// The function applies transformations in a specific order to ensure correctness:
/// each pass may depend on the results of previous passes, and the order is carefully
/// designed to handle dependencies between different kinds of analysis and transformation.
///
/// # Arguments
///
/// * `module_name` - The symbolic name of the module being lowered, used for type resolution.
/// * `expr` - The root expression of the AST to be lowered (modified in place).
/// * `env` - The type environment containing heap allocation and type system context.
/// * `registry` - Registry of available modules for import and name resolution.
///
/// Returns a [`Status`] containing either the extracted type information on success, or diagnostic
/// issues if the lowering process encounters errors. Even on success, the status may
/// contain warnings or other non-fatal diagnostics.
///
/// # Examples
///
/// ```rust
/// use hashql_ast::lowering::lower;
/// use hashql_core::{
///     r#type::environment::Environment,
///     module::ModuleRegistry,
///     symbol::Symbol,
/// };
///
/// # fn example(env: &Environment, registry: &ModuleRegistry, mut expr: hashql_ast::node::expr::Expr) {
/// let module_name = Symbol::intern("my_module");
/// let result = lower(module_name, &mut expr, env, registry);
///
/// // Check for successful lowering
/// if result.is_success() {
///     let types = result.value();
///     println!("Successfully lowered module with {} local types",
///              types.locals.len());
/// }
///
/// // Handle any diagnostics (errors or warnings)
/// for diagnostic in result.diagnostics() {
///     eprintln!("Diagnostic: {:?}", diagnostic);
/// }
/// # }
/// ```
///
/// # Errors
///
/// The function collects diagnostics from each transformation pass and returns them
/// as part of the [`Status`]. Possible error categories include:
///
/// - [`LoweringDiagnosticCategory::Expander`] - Errors during special form expansion
/// - [`LoweringDiagnosticCategory::Sanitizer`] - Errors during code sanitization
/// - [`LoweringDiagnosticCategory::Resolver`] - Errors during import resolution
/// - [`LoweringDiagnosticCategory::Extractor`] - Errors during type extraction
pub fn lower<'heap>(
    module_name: Symbol<'heap>,
    expr: &mut Expr<'heap>,
    env: &Environment<'heap>,
    registry: &ModuleRegistry<'heap>,
) -> Status<ExtractedTypes<'heap>, LoweringDiagnosticCategory, SpanId> {
    let mut diagnostics = DiagnosticIssues::new();

    let mut resolver = PreExpansionNameResolver::new(registry);
    resolver.visit_expr(expr);

    let mut expander = SpecialFormExpander::new(env.heap);
    expander.visit_expr(expr);
    diagnostics.append(
        &mut expander
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::Expander),
    );

    let mut sanitizer = Sanitizer::new();
    sanitizer.visit_expr(expr);
    diagnostics.append(
        &mut sanitizer
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::Sanitizer),
    );

    let mut namespace = ModuleNamespace::new(registry);
    namespace.import_prelude();

    let mut resolver = ImportResolver::new(env.heap, namespace);
    resolver.visit_expr(expr);
    diagnostics.append(
        &mut resolver
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::Resolver),
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
