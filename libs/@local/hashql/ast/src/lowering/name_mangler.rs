//! Name mangling for the HashQL compiler.
//!
//! This module implements a name mangling system that ensures uniqueness of identifiers
//! across different scopes during the compilation process.
//!
//! # Overview
//!
//! The name mangler traverses the AST and:
//!
//! 1. Maintains separate namespaces for value-level and type-level identifiers
//! 2. Generates unique mangled names by appending `:n` suffixes to symbols
//! 3. Tracks scoping information to properly manage name visibility
//! 4. Preserves the relationship between original and mangled names
//!
//! # Name Mangling Strategy
//!
//! Mangled symbols in HashQL follow the pattern `<symbol>:<count>`, where:
//!   - `<symbol>` is the original identifier
//!   - `:<count>` is a unique numeric suffix
//!
//! This approach exploits the fact that a colon followed by a number is invalid in:
//!   - Lexical identifiers (which follow Rust's identifier rules)
//!   - Symbols (which explicitly exclude colons)
//!   - `BaseUrl`s (which must end with a slash, not a colon)
//!
//! # Scope Management
//!
//! The mangler maintains separate namespaces for:
//!
//! - Type-level identifiers (types, newtypes)
//! - Value-level identifiers (variables, functions)
//!
//! This separation allows for shadowing between namespaces while maintaining uniqueness
//! within each namespace.

use core::fmt::Write as _;

use hashql_core::{
    collections::FastHashMap,
    heap::{self, Heap},
    module::Universe,
    symbol::Symbol,
};

use crate::{
    node::{
        expr::{ClosureExpr, Expr, LetExpr, NewTypeExpr, TypeExpr, closure::ClosureSignature},
        generic::GenericConstraint,
        path::Path,
        r#type::Type,
    },
    visit::{Visitor, walk_expr, walk_path, walk_type},
};

#[derive(Debug, Copy, Clone)]
struct Binding<'heap> {
    name: Symbol<'heap>,
    previous: Option<Symbol<'heap>>,
}

struct Universes<'heap> {
    value: FastHashMap<Symbol<'heap>, Symbol<'heap>>,
    r#type: FastHashMap<Symbol<'heap>, Symbol<'heap>>,
}

impl<'heap> Universes<'heap> {
    fn new() -> Self {
        Self {
            value: FastHashMap::default(),
            r#type: FastHashMap::default(),
        }
    }

    fn enter(
        &mut self,
        scope: Universe,
        original: Symbol<'heap>,
        mangled: Symbol<'heap>,
    ) -> Binding<'heap> {
        let residual = match scope {
            Universe::Type => self.r#type.insert(original, mangled),
            Universe::Value => self.value.insert(original, mangled),
        };

        Binding {
            name: original,
            previous: residual,
        }
    }

    fn exit(&mut self, scope: Universe, residual: Binding<'heap>) {
        if let Some(old) = residual.previous {
            match scope {
                Universe::Type => self.r#type.insert(residual.name, old),
                Universe::Value => self.value.insert(residual.name, old),
            };
        } else {
            match scope {
                Universe::Type => self.r#type.remove(&residual.name),
                Universe::Value => self.value.remove(&residual.name),
            };
        }
    }

    fn get(&self, scope: Universe, name: Symbol<'heap>) -> Option<Symbol<'heap>> {
        match scope {
            Universe::Type => self.r#type.get(&name).copied(),
            Universe::Value => self.value.get(&name).copied(),
        }
    }
}

struct MangledSignature<'heap> {
    generic_params: Vec<(Symbol<'heap>, Symbol<'heap>)>,
    inputs: Vec<(Symbol<'heap>, Symbol<'heap>)>,
}

/// Name mangler for HashQL, responsible for ensuring identifier uniqueness.
///
/// The `NameMangler` traverses the AST and transforms identifiers to guarantee uniqueness
/// across different scopes and binding forms. It works by appending unique suffixes to
/// identifiers and tracking the relationship between original and mangled names.
///
/// The mangler maintains separate namespaces for type-level and value-level identifiers. It handles
/// all binding forms in HashQL including:
///
/// - `let` expressions (value scope)
/// - `type` expressions (type scope)
/// - `newtype` expressions (both type and value scopes)
/// - Closure parameters (value scope)
/// - Generic parameters (type scope)
///
/// # Examples
///
/// Conceptual transformation (simplified):
///
/// ```text
/// let x = 1 in
/// let x = 2 in
///     x + x
/// ```
///
/// After mangling:
///
/// ```text
/// let x:0 = 1 in
/// let x:1 = 2 in
///     x:1 + x:1;
/// ```
pub struct NameMangler<'heap> {
    heap: &'heap Heap,
    universes: Universes<'heap>,
    current_universe: Universe,

    counter: FastHashMap<Symbol<'heap>, usize>,
}

impl<'heap> NameMangler<'heap> {
    /// Creates a new name mangler.
    #[must_use]
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            universes: Universes::new(),
            current_universe: Universe::Value,
            counter: FastHashMap::default(),
        }
    }

    /// Mangles a symbol by appending a unique suffix.
    ///
    /// The mangling pattern is `<symbol>:<count>` where count is a unique number
    /// for each original symbol. This exploits the fact that `:` followed by a number
    /// is invalid in regular identifiers, symbols, and `BaseUrl`s, ensuring the mangled
    /// name will not conflict with any valid user-defined identifier.
    fn mangle(&mut self, symbol: &mut Symbol<'heap>) -> Symbol<'heap> {
        let count = self.counter.entry(*symbol).or_insert(0);

        let mut mangled = symbol.as_str().to_owned();
        mangled.push(':');

        // Unwrapping here is fine, because the formatter for numbers is infallible and the
        // underlying write implementation is infallible as well.
        write!(mangled, "{count}").unwrap_or_else(|_| unreachable!());

        *count += 1;

        let mangled = self.heap.intern_symbol(&mangled);
        // Updating the symbol directly with the mangled version allows us to avoid unnecessary
        // re-assignment. When we mangle a symbol we immediately replace it. It allows allows us to
        // ensure that any mangling takes immediate effect.
        *symbol = mangled;

        mangled
    }

    /// Enters a new scope with a binding.
    ///
    /// Creates a new binding in the specified scope (type or value) that maps an original
    /// symbol to its mangled version. The binding is active during the execution of the
    /// provided closure, and is automatically removed when the closure completes.
    fn enter<T>(
        &mut self,
        universe: Universe,
        original: Symbol<'heap>,
        mangled: Symbol<'heap>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let binding = self.universes.enter(universe, original, mangled);

        let result = closure(self);

        self.universes.exit(universe, binding);

        result
    }

    /// Enters a new scope with multiple bindings.
    ///
    /// Similar to `enter` but for multiple bindings at once. Creates bindings for each
    /// (original, mangled) pair in the specified scope. All bindings are active during
    /// the execution of the provided closure and are automatically removed in reverse
    /// order when the closure completes.
    fn enter_many<T>(
        &mut self,
        universe: Universe,
        replacements: Vec<(Symbol<'heap>, Symbol<'heap>)>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let mut bindings = Vec::with_capacity(replacements.len());

        for (original, replacement) in replacements {
            bindings.push(self.universes.enter(universe, original, replacement));
        }

        let result = closure(self);

        for binding in bindings.into_iter().rev() {
            self.universes.exit(universe, binding);
        }

        result
    }

    /// Processes a closure signature and mangles its parameters.
    ///
    /// Transforms the names of generic parameters and input parameters in a closure signature
    /// by applying the mangling process to each one. The mangled parameters are then used to
    /// create appropriate scopes for processing the closure body.
    fn mangle_closure_signature(
        &mut self,
        ClosureSignature {
            id,
            span,
            generics,
            inputs,
            output,
        }: &mut ClosureSignature<'heap>,
    ) -> MangledSignature<'heap> {
        self.visit_id(id);
        self.visit_span(span);

        let mangled_generic_params: Vec<_> = generics
            .params
            .iter_mut()
            .map(|param| {
                let original = param.name.value;
                let mangled = self.mangle(&mut param.name.value);

                (original, mangled)
            })
            .collect();

        let mangled_inputs: Vec<_> = inputs
            .iter_mut()
            .map(|input| {
                let original = input.name.value;
                let mangled = self.mangle(&mut input.name.value);

                (original, mangled)
            })
            .collect();

        self.visit_generics(generics);

        self.enter_many(Universe::Type, mangled_generic_params.clone(), |this| {
            for param in inputs {
                this.visit_closure_param(param);
            }

            this.visit_type(output);
        });

        MangledSignature {
            generic_params: mangled_generic_params,
            inputs: mangled_inputs,
        }
    }

    fn mangle_constraints(
        &mut self,
        original: Symbol<'heap>,
        mangled: Symbol<'heap>,
        constraints: &mut heap::Vec<'heap, GenericConstraint<'heap>>,
    ) -> Vec<(Symbol<'heap>, Symbol<'heap>)> {
        let mangled_constraints: Vec<_> = constraints
            .iter_mut()
            .map(|constraint| {
                let original = constraint.name.value;
                let mangled = self.mangle(&mut constraint.name.value);

                (original, mangled)
            })
            .collect();

        self.enter(Universe::Type, original, mangled, |this| {
            this.enter_many(Universe::Type, mangled_constraints.clone(), |this| {
                for constraint in constraints {
                    this.visit_generic_constraint(constraint);
                }
            });
        });

        mangled_constraints
    }
}

impl<'heap> Visitor<'heap> for NameMangler<'heap> {
    fn visit_path(&mut self, path: &mut Path<'heap>) {
        // If the first segment is a symbol, and said symbol has a renamed version, replace it. This
        // is only every the case if it isn't rooted.
        if path.rooted {
            walk_path(self, path);
            return;
        }

        let first = &mut path.segments[0];
        if let Some(replacement) = self.universes.get(self.current_universe, first.name.value) {
            first.name.value = replacement;
        }

        walk_path(self, path);
    }

    // TODO: H-4377
    // The use expressions are not further mangled, as the import resolver (run before this) will
    // have replaced any import in the code with the absolute path.
    // In this stage any use statement should no longer be present.

    fn visit_let_expr(&mut self, expr: &mut LetExpr<'heap>) {
        let original = expr.name.value;
        let mangled = self.mangle(&mut expr.name.value);

        let LetExpr {
            id,
            span,
            name,
            value,
            r#type,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);
        self.visit_expr(value);

        if let Some(r#type) = r#type {
            self.visit_type(r#type);
        }

        self.enter(Universe::Value, original, mangled, |this| {
            this.visit_expr(body);
        });
    }

    fn visit_type_expr(&mut self, expr: &mut TypeExpr<'heap>) {
        let original = expr.name.value;
        let mangled = self.mangle(&mut expr.name.value);

        let TypeExpr {
            id,
            span,
            name,
            constraints,
            value,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);

        let mangled_constraints = self.mangle_constraints(original, mangled, constraints);

        self.enter(Universe::Type, original, mangled, |this| {
            this.enter_many(Universe::Type, mangled_constraints, |this| {
                this.visit_type(value);
            });

            this.visit_expr(body);
        });
    }

    fn visit_newtype_expr(&mut self, expr: &mut NewTypeExpr<'heap>) {
        let original = expr.name.value;
        let mangled = self.mangle(&mut expr.name.value);

        let NewTypeExpr {
            id,
            span,
            name,
            constraints,
            value,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);

        let mangled_constraints = self.mangle_constraints(original, mangled, constraints);

        self.enter(Universe::Type, original, mangled, |this| {
            this.enter_many(Universe::Type, mangled_constraints, |this| {
                this.visit_type(value);
            });

            // unlike types, newtypes also bring a constructor into scope
            this.enter(Universe::Value, original, mangled, |this| {
                this.visit_expr(body);
            });
        });
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        let previous = self.current_universe;
        self.current_universe = Universe::Value;
        walk_expr(self, expr);
        self.current_universe = previous;
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        let previous = self.current_universe;
        self.current_universe = Universe::Type;
        walk_type(self, r#type);
        self.current_universe = previous;
    }

    fn visit_closure_expr(&mut self, expr: &mut ClosureExpr<'heap>) {
        let ClosureExpr {
            id,
            span,
            signature,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);

        let MangledSignature {
            generic_params,
            inputs,
        } = self.mangle_closure_signature(signature);

        self.enter_many(Universe::Type, generic_params, |this| {
            this.enter_many(Universe::Value, inputs, |this| this.visit_expr(body));
        });
    }
}
