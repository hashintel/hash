//! Name resolution for the HashQL Abstract Syntax Tree.
//!
//! This module provides functionality for resolving identifiers in the AST to their fully
//! qualified paths. It handles path resolution, scoping rules, and special form detection
//! for constructs like `let`, `type`, and `newtype`.
//!
//! # Overview
//!
//! Name resolution is a critical part of the HashQL compilation pipeline, converting:
//!
//! - Unqualified identifiers (`map`) to absolute paths (`::graph::body::map`)
//! - Operators (`+`) to their function equivalents (`::core::math::add`)
//! - Special forms to their kernel representations (`let` to `::kernel::special_form::let`)
//!
//! The resolver also manages scoping rules to ensure that bindings from `let`, `type`, and
//! `newtype` expressions only apply within their respective bodies.
//!
//! # Architecture
//!
//! The name resolver works as a visitor pattern implementation that traverses the AST and:
//!
//! 1. Maintains a mapping of identifiers to their absolute paths
//! 2. Applies transformations to convert relative paths to absolute ones
//! 3. Recognizes special forms and establishes proper scoping for bindings
//! 4. Preserves source location information during transformations
//!
//! # Examples
//!
//! Input AST:
//! ```json
//! ["let", "x", "10", ["+", "x", "5"]]
//! ```
//!
//! After name resolution:
//! ```json
//! ["::kernel::special_form::let", "x", "10", ["::core::math::add", "10", "5"]]
//! ```
//!
//! # Special Forms
//!
//! The resolver recognizes and properly processes several special forms:
//!
//! - **let**: Binds a value to a name within a scope
//!   - `let/3`: `[let, name, value, body]`
//!   - `let/4`: `[let, name, type, value, body]`
//!
//! - **type**: Defines a type alias within a scope
//!   - `type/3`: `[type, name, underlying_type, body]`
//!
//! - **newtype**: Defines a new nominal type based on an existing type
//!   - `newtype/3`: `[newtype, name, underlying_type, body]`
//!
//! # Path Resolution Behavior
//!
//! When processing paths, the resolver follows these rules:
//!
//! 1. Absolute paths (starting with `::`) remain unchanged
//! 2. Unrooted paths are checked against the current name mapping
//! 3. If the first segment matches an entry in the mapping, it's replaced with the absolute path
//! 4. Generic arguments are preserved during path resolution
//! 5. Source location information is maintained for error reporting
//!
//! # Selective Tree Resolution and Scope Separation
//!
//! The name resolver intentionally processes only specific parts of the AST:
//!
//! 1. We only resolve the function name.
//! 2. For `let` expressions, only the value of the binding is resolved.
//!
//! This selective approach is intentionally conservative and critical because:
//!
//! - It prepares the AST specifically for special form expansion, which only takes the function
//!   name into account.
//! - It maintains a strict separation between value and type scopes, which don't share the same
//!   identifier resolutions.
//! - The function called can only ever be a value, never a type, so we ensure consistent handling.
//!
//! By deliberately restricting name resolution to only the necessary parts of the tree, the
//! resolver prevents scope contamination and ensures correct expansion in subsequent compilation
//! phases. This conservative approach to resolution helps avoid unintended transformations that
//! could lead to subtle errors in later processing stages.
//!
//! # Scoping Rules
//!
//! The resolver enforces lexical scoping rules:
//!
//! 1. Bindings only apply within their defined scope (body of let/type/newtype expressions)
//! 2. Inner bindings shadow outer bindings with the same name
//! 3. Original bindings are restored when exiting a scope
//! 4. Built-in names can be shadowed by local bindings
use core::mem;

use hashql_core::{
    collections::FastHashMap,
    heap::{CollectIn as _, Heap},
    module::{
        ModuleRegistry, Reference, Universe,
        item::{IntrinsicItem, IntrinsicValueItem, ItemKind},
        namespace::{ModuleNamespace, ResolutionMode, ResolveOptions},
    },
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

use crate::{
    node::{
        expr::{CallExpr, ExprKind},
        id::NodeId,
        path::{Path, PathSegment},
    },
    visit::{Visitor, walk_call_expr, walk_path},
};

/// Resolves name aliases in the HashQL AST, converting identifiers to their absolute path
/// representation.
///
/// The `NameResolver` performs several key functions during AST processing:
///
/// 1. Path Resolution: Converts unrooted paths (like `map`) to their absolute forms (like
///    `::graph::body::map`)
/// 2. Special Form Handling: Recognizes and processes special forms like `let`, `type`, and
///    `newtype`, but does **not** transform them yet.
/// 3. Scope Management: Maintains proper lexical scoping of bindings within expressions
/// 4. Selective Value-Scope Resolution: Only resolves specific parts of the AST (binding values and
///    function identifiers) to maintain strict separation between value and type scopes
///
/// # Example
///
/// The name resolver converts expressions like:
/// ```json
/// ["let", "x", "10", ["+", "x", "5"]]
/// ```
///
/// Into their resolved forms:
/// ```json
/// [
///     "::kernel::special_form::let",
///     "x",
///     "10",
///     ["::core::math::add", "10", "5"],
/// ]
/// ```
///
/// Note that the identifier `x` in the binding position (first argument) is preserved exactly as
/// written, while its use in the body expression is resolved according to the current scope.
pub struct PreExpansionNameResolver<'env, 'heap> {
    alias: FastHashMap<Symbol<'heap>, Option<Path<'heap>>>,

    namespace: ModuleNamespace<'env, 'heap>,
    namespace_cache: FastHashMap<Symbol<'heap>, Path<'heap>>,

    resolve: bool,
    heap: &'heap Heap,
}

impl<'env, 'heap> PreExpansionNameResolver<'env, 'heap> {
    /// Creates a new `NameResolver` with an empty mapping.
    pub fn new(registry: &'env ModuleRegistry<'heap>) -> Self {
        let mut namespace = ModuleNamespace::new(registry);
        namespace.import_prelude();

        Self {
            alias: FastHashMap::default(),
            namespace,
            namespace_cache: FastHashMap::default(),
            resolve: false,
            heap: registry.heap,
        }
    }

    fn walk_call(
        &mut self,
        expr: &mut CallExpr<'heap>,
        to: Ident<'heap>,
        mut from: Option<Path<'heap>>,
    ) {
        // We now need to call_expr, but it's important that we don't apply the mapping
        // indiscriminately but instead we do so selectively on only on the last argument, as that
        // is the body of the expression.

        let CallExpr {
            id,
            span,
            // We don't need to visit the function, as we've already visited it
            function: _,
            arguments,
            // We've checked beforehand that there are no labeled arguments, therefore it's
            // pointless to visit them
            labeled_arguments: _,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);

        let len = arguments.len();

        // While our call to `visit_argument` simply delegates to `visit_expr`, it's still important
        // to call it, as to not break any contracts down the line.
        for (index, argument) in arguments.iter_mut().enumerate() {
            if index == 0 {
                // The first argument is the identifier, which we shouldn't normalize
            } else if index == len - 1 {
                let old = if let Some(from) = from.take() {
                    self.alias.insert(to.value, Some(from))
                } else {
                    // Explicitly unset the alias
                    self.alias.insert(to.value, None)
                };

                self.visit_argument(argument);

                if let Some(old) = old {
                    self.alias.insert(to.value, old);
                } else {
                    // The binding hasn't existed before, therefore restoration = deletion
                    self.alias.remove(&to.value);
                }
            } else {
                self.visit_argument(argument);
            }
        }
    }

    /// Looks up the absolute path for a given symbol name.
    ///
    /// It checks the local alias map first, then the namespace cache, and finally
    /// the module namespace (for intrinsics) if necessary. Caches namespace lookups.
    fn lookup(&mut self, name: Symbol<'heap>) -> Option<Path<'heap>> {
        if let Some(replacement) = self.alias.get(&name) {
            return replacement.clone();
        }

        // Check first if the cache has a version that's already been resolved
        if let Some(path) = self.namespace_cache.get(&name) {
            return Some(path.clone());
        }

        // This is very conservative, in *theory* we should take a look at the whole path and use
        // that as import, but as we're only interested in special-forms, which are only imported as
        // name, we can safely just use the name.
        let reference = self
            .namespace
            .resolve(
                [name],
                ResolveOptions {
                    mode: ResolutionMode::Relative,
                    universe: Universe::Value,
                },
            )
            .ok()?;

        let Reference::Item(import) = reference else {
            return None;
        };

        // We're only interested in intrinsics
        let ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem {
            name: path,
            r#type: _,
        })) = import.kind
        else {
            return None;
        };

        // The name is a fully qualified path, that we need to convert into a path
        let (rooted, path) = path
            .strip_prefix("::")
            .map_or((false, path), |path| (true, path));

        let segments = path
            .split("::")
            .map(|name| PathSegment {
                id: NodeId::PLACEHOLDER,
                span: SpanId::SYNTHETIC,
                name: Ident {
                    span: SpanId::SYNTHETIC,
                    value: self.heap.intern_symbol(name),
                    kind: IdentKind::Lexical,
                },
                arguments: Vec::new_in(self.heap),
            })
            .collect_in(self.heap);

        let path = Path {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            rooted,
            segments,
        };

        self.namespace_cache.insert(name, path.clone());

        Some(path)
    }
}

impl<'heap> Visitor<'heap> for PreExpansionNameResolver<'_, 'heap> {
    fn visit_path(&mut self, path: &mut Path<'heap>) {
        if !self.resolve {
            walk_path(self, path);
            return;
        }

        if path.rooted {
            walk_path(self, path);
            return;
        }

        // Check if the first segment exists, and if said segment exists in our mapping
        let Some(segment) = path.segments.first_mut() else {
            walk_path(self, path);
            return;
        };

        // The mapping can either exist in the registry, or our alias mapping

        let Some(replacement) = self.lookup(segment.name.value) else {
            walk_path(self, path);
            return;
        };

        let mut arguments = Some(mem::replace(&mut segment.arguments, Vec::new_in(self.heap)));

        let span = segment.span;

        path.rooted = replacement.rooted;

        let replacement_len = replacement.segments.len();

        // Replace the segment with the aliased value
        path.segments.splice(
            0..1,
            replacement
                .segments
                .into_iter()
                .enumerate()
                .map(|(index, mut segment)| {
                    // Make sure that we inherit the span from the original segment
                    segment.span = span;

                    // Take the arguments if we're at the last segment, as converting from
                    // `a<T>` to `math<T>::add<T>` wouldn't be a valid transformation.
                    if index == replacement_len - 1 {
                        segment.arguments = arguments.take().unwrap_or_else(|| unreachable!());
                    }

                    segment
                }),
        );

        walk_path(self, path);
    }

    fn visit_call_expr(&mut self, expr: &mut CallExpr<'heap>) {
        // Look for expressions that is pre-expansion and *looks* like a let expressions

        // Special forms don't support labeled arguments
        if !expr.labeled_arguments.is_empty() {
            walk_call_expr(self, expr);
            return;
        }

        // Check if the argument is a path that can be an ident
        let ExprKind::Path(function) = &mut expr.function.kind else {
            walk_call_expr(self, expr);
            return;
        };

        // First resolve the path
        // In theory as we're accessing the path here, we'd need to call `visit_id` and `visit_span`
        // as well, but as we don't actually implement these methods, and they're no-op we're free
        // to omit those calls.
        self.resolve = true;
        self.visit_path(function);
        self.resolve = false;

        // `let` supports two forms: `let/3` and `let/4` (w/ or w/o type assertion)
        if expr.arguments.len() != 3 && expr.arguments.len() != 4 {
            walk_call_expr(self, expr);
            return;
        }

        // Check if said path is equivalent to the let special form
        if !function.matches_absolute_path(["kernel", "special_form", "let"]) {
            walk_call_expr(self, expr);
            return;
        }

        let arguments_length = expr.arguments.len();

        // we know this is a let expression, now we just need to make sure that both the first and
        // second-to-last argument are identifiers
        // let to: <type> = from in <body>
        let [to, from] = expr
            .arguments
            .get_disjoint_mut([0, arguments_length - 2])
            .expect("length has been verified beforehand");

        let ExprKind::Path(to) = &mut to.value.kind else {
            walk_call_expr(self, expr);
            return;
        };

        // We do **not** resolve the `to` path, as it is supposed to be an identifier
        let Some(to) = to.as_ident().copied() else {
            walk_call_expr(self, expr);
            return;
        };

        let ExprKind::Path(from) = &mut from.value.kind else {
            // While it isn't a path and therefore not an alias, this is still a valid assignment,
            // therefore we need to actually *remove* the mapping for the duration of the call.

            self.walk_call(expr, to, None);
            return;
        };

        // Check that the path itself is not generic, if it is, there is no safe way to create an
        // alias
        if from
            .segments
            .iter()
            .any(|segment| !segment.arguments.is_empty())
        {
            walk_call_expr(self, expr);
            return;
        }

        // We have a new mapping from path to type
        self.resolve = true;
        self.visit_path(from);
        self.resolve = false;
        let from = Some(from.clone());

        self.walk_call(expr, to, from);
    }
}
