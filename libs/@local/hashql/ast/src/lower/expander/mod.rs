//! Combined name resolution and special form expansion pass.
//!
//! The expander walks the AST top-down, resolving every path against a
//! [`ModuleNamespace`] and rewriting it to its absolute form. When a call
//! expression targets a special form (like `let`, `fn`, or `use`), the
//! expander lowers it into the corresponding typed AST node in the same
//! traversal.

mod access;
mod r#as;
pub mod error;
mod r#fn;
mod r#if;
mod index;
mod input;
mod r#let;
mod newtype;
mod r#type;
mod r#use;

use core::mem;

use hashql_core::{
    heap::{self, BumpAllocator},
    module::{
        self, Reference, Universe,
        item::{IntrinsicItem, IntrinsicTypeItem, Item, ItemKind},
        namespace::{ModuleNamespace, ResolutionMode, ResolveOptions},
    },
    symbol::{Ident, Symbol, sym},
};

use self::{
    access::lower_access, r#as::lower_as, error::ExpanderDiagnosticIssues, r#fn::lower_fn,
    r#if::lower_if, index::lower_index, input::lower_input, r#let::lower_let,
    newtype::lower_newtype, r#type::lower_type, r#use::lower_use,
};
use crate::{
    node::{self, expr::CallExpr, id::NodeId},
    visit::{self, Visitor},
};

/// Whether a binding introduced during expansion is a local (opaque) or
/// an alias for a resolved registry item.
#[derive(Debug)]
enum BindingKind<'heap> {
    /// A binding with no identity beyond its name and universe
    /// (e.g., a `let` binding or function parameter).
    Local(Universe),
    /// An alias for a known registry item, preserving its identity through
    /// rebinding (e.g., a `use` import).
    Remote(Item<'heap>),
}

impl<'heap> From<Item<'heap>> for BindingKind<'heap> {
    fn from(value: Item<'heap>) -> Self {
        Self::Remote(value)
    }
}

impl From<Universe> for BindingKind<'_> {
    fn from(value: Universe) -> Self {
        Self::Local(value)
    }
}

/// Handle for registering bindings without exposing the full namespace.
///
/// Passed into the `register` closure of [`Expander::bind_many_with`] so
/// that the closure can declare bindings while the caller retains a
/// separate mutable reference to its own data.
struct Binder<'ns, 'env, 'heap> {
    namespace: &'ns mut ModuleNamespace<'env, 'heap>,
}

impl<'heap> Binder<'_, '_, 'heap> {
    fn bind(&mut self, symbol: Symbol<'heap>, kind: impl Into<BindingKind<'heap>>) {
        match kind.into() {
            BindingKind::Local(universe) => self.namespace.local(symbol, universe),
            BindingKind::Remote(item) => self.namespace.alias(symbol, item),
        }
    }
}

#[derive(Debug, Copy, Clone)]
struct CurrentItem<'heap> {
    item: module::item::Item<'heap>,
    has_arguments: bool,
}

/// Combined name resolution and special form expansion visitor.
///
/// Resolves every path in the AST against the module namespace, rewrites
/// paths to their absolute form, and lowers special form calls (e.g., `let`,
/// `fn`, `use`) into typed AST nodes. Errors that prevent resolution produce
/// dummy expression placeholders so that later diagnostics can be
/// suppressed for cascading failures.
pub struct Expander<'env, 'heap, S> {
    heap: &'heap heap::Heap,
    scratch: S,

    namespace: ModuleNamespace<'env, 'heap>,
    current_universe: Universe,
    diagnostics: ExpanderDiagnosticIssues,

    current_item: Option<CurrentItem<'heap>>,
    trampoline: Option<node::expr::Expr<'heap>>,
    special_form_module: module::ModuleId,
}

impl<'env, 'heap, S> Expander<'env, 'heap, S> {
    /// Creates a new [`Expander`] with the given namespace and scratch space.
    ///
    /// # Panics
    ///
    /// Panics if the standard library does not contain the kernel module.
    pub fn new(mut namespace: ModuleNamespace<'env, 'heap>, scratch: S) -> Self {
        // First we need to find the special form module, this is used during resolution to forbid
        // the use of generics attached to them.
        let kernel_module = namespace
            .registry()
            .find_by_name(sym::kernel)
            .unwrap_or_else(|| {
                namespace.import_prelude();

                namespace
                    .registry()
                    .find_by_name(sym::kernel)
                    .expect("prelude should have been loaded and include the kernel")
            });

        let Some(&Item {
            kind: ItemKind::Module(special_form_module),
            ..
        }) = kernel_module
            .items
            .iter()
            .find(|item| item.name == sym::special_form)
        else {
            unreachable!("kernel module should always contain the special form module");
        };

        Self {
            heap: namespace.registry().heap,
            namespace,
            scratch,
            current_universe: Universe::Value,
            diagnostics: ExpanderDiagnosticIssues::new(),
            current_item: None,
            trampoline: None,
            special_form_module,
        }
    }

    pub fn take_diagnostics(&mut self) -> ExpanderDiagnosticIssues {
        mem::take(&mut self.diagnostics)
    }

    /// Walks `expr`, applying resolution and expansion, and returns the
    /// resolved [`Item`] if the expression was a path that resolved to one.
    ///
    /// Returns `None` when the expression resolved to a local binding,
    /// was not a path, or resolution failed (in which case the expression
    /// is replaced with a dummy expression).
    fn visit(&mut self, expr: &mut node::expr::Expr<'heap>) -> Option<CurrentItem<'heap>>
    where
        S: BumpAllocator,
    {
        let prev_current_item = self.current_item.take();
        visit::walk_expr(self, expr);

        if let Some(trampoline) = self.trampoline.take() {
            *expr = trampoline;
        }

        let current_item = self.current_item.take();
        self.current_item = prev_current_item;

        current_item
    }

    /// Runs `closure` with the resolution universe temporarily set to
    /// `universe`, restoring the previous universe afterwards.
    fn with_universe<T>(&mut self, universe: Universe, closure: impl FnOnce(&mut Self) -> T) -> T {
        let prev_universe = self.current_universe;
        self.current_universe = universe;
        let result = closure(self);
        self.current_universe = prev_universe;
        result
    }

    /// Introduces a single binding for the duration of `closure`, then
    /// rolls back the namespace.
    fn bind<T>(
        &mut self,
        variable: Symbol<'heap>,
        kind: impl Into<BindingKind<'heap>>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        self.bind_many([(variable, kind)], closure)
    }

    /// Introduces bindings derived from `value` and then runs `closure`
    /// with both `&mut Self` and `&mut U` available.
    ///
    /// `register` inspects `value` (shared) and pushes bindings through
    /// the [`Binder`]. Once it returns, `closure` receives full mutable
    /// access to both the expander and `value`. The namespace is rolled
    /// back after `closure` completes.
    ///
    /// This two-closure design exists because Rust closures cannot return
    /// iterators that borrow from their arguments. The push-style
    /// `register` avoids that limitation without dynamic dispatch.
    fn bind_many_with<T, U>(
        &mut self,
        mut value: U,
        register: impl FnOnce(&U, &mut Binder<'_, '_, 'heap>),
        closure: impl FnOnce(&mut Self, &mut U) -> T,
    ) -> (U, T) {
        let snapshot = self.namespace.snapshot();

        let mut binder = Binder {
            namespace: &mut self.namespace,
        };
        register(&value, &mut binder);

        let result = closure(self, &mut value);

        self.namespace.rollback_to(snapshot);

        (value, result)
    }

    /// Introduces all `variables` as bindings for the duration of `closure`,
    /// then rolls back the namespace.
    fn bind_many<T, K>(
        &mut self,
        variables: impl IntoIterator<Item = (Symbol<'heap>, K)>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T
    where
        K: Into<BindingKind<'heap>>,
    {
        // The inline is here, because this is a hot path, this is just desugaring of the
        // underlying iterator, make it explicit so that it indeed inlines the call
        let ((), result) = self.bind_many_with(
            (),
            #[inline]
            |(), binder| {
                for (variable, kind) in variables {
                    binder.bind(variable, kind);
                }
            },
            #[inline]
            |this, ()| closure(this),
        );

        result
    }
}

impl<'heap, S> Visitor<'heap> for Expander<'_, 'heap, S>
where
    S: BumpAllocator,
{
    #[expect(
        clippy::too_many_lines,
        reason = "actual algorithm is straightforward, error reporting is what balloons it"
    )]
    fn visit_path(&mut self, path: &mut node::path::Path<'heap>) {
        visit::walk_path(self, path);
        self.current_item = None;

        let [modules @ .., ident] = &*path.segments else {
            self.diagnostics.push(error::empty_path(path.span));
            self.trampoline = Some(node::expr::Expr::dummy());

            return;
        };

        // We don't support generics except for the *last* segment
        if let Some(diagnostic) = error::generic_arguments_in_module(modules) {
            self.diagnostics.push(diagnostic);
            self.trampoline = Some(node::expr::Expr::dummy());

            return;
        }

        let reference = self.namespace.resolve(
            path.segments.iter().map(|segment| segment.name.value),
            ResolveOptions {
                universe: self.current_universe,
                mode: if path.rooted {
                    ResolutionMode::Absolute
                } else {
                    ResolutionMode::Relative
                },
            },
        );

        let reference = match reference {
            Ok(reference) => reference,
            Err(error) => {
                self.diagnostics.push(error::from_resolution_error(
                    path,
                    &self.namespace,
                    self.current_universe,
                    error,
                ));
                self.trampoline = Some(node::expr::Expr::dummy());

                return;
            }
        };

        let item = match reference {
            Reference::Binding(_) => {
                debug_assert_eq!(
                    path.segments.len(),
                    1,
                    "a binding should always only have a single segment"
                );

                return;
            }
            Reference::Item(item) => item,
        };

        self.current_item = Some(CurrentItem {
            item,
            has_arguments: !ident.arguments.is_empty(),
        });

        // Make sure that the intrinsic special forms do not have arguments attached to them.
        match item.kind {
            ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem { name }))
                if let Some(const_name) = name.as_constant()
                    && matches!(
                        const_name,
                        sym::path::Union::CONST | sym::path::Intersection::CONST
                    )
                    && !ident.arguments.is_empty() =>
            {
                self.diagnostics
                    .push(error::intrinsic_generic_arguments(ident));
                self.trampoline = Some(node::expr::Expr::dummy());

                return;
            }
            ItemKind::Intrinsic(IntrinsicItem::Value(_))
                if !ident.arguments.is_empty() && item.module == self.special_form_module =>
            {
                self.diagnostics
                    .push(error::intrinsic_generic_arguments(ident));
                self.trampoline = Some(node::expr::Expr::dummy());

                return;
            }
            ItemKind::Module(_)
            | ItemKind::Type(_)
            | ItemKind::Constructor(_)
            | ItemKind::Intrinsic(_) => {}
        }

        let absolute_path = item.absolute_path_rev(self.namespace.registry());

        if absolute_path.len() >= path.segments.len() {
            // The canonical path is longer (or equal): pad with placeholder segments,
            // rotate the originals into position, then fill in the canonical names.
            let padding = absolute_path.len() - path.segments.len();
            let padding_span = path.segments[0].span;

            path.segments.extend(core::iter::repeat_n(
                node::path::PathSegment {
                    id: NodeId::PLACEHOLDER,
                    span: padding_span,
                    name: Ident {
                        span: padding_span,
                        value: sym::dummy,
                        kind: hashql_core::symbol::IdentKind::Lexical,
                    },
                    arguments: heap::Vec::new_in(self.heap),
                },
                padding,
            ));
            path.segments.rotate_right(padding);
        } else {
            // The canonical path is shorter (re-export through a longer path):
            // truncate the extra leading segments.
            let excess = path.segments.len() - absolute_path.len();
            path.segments.rotate_left(excess);
            path.segments.truncate(absolute_path.len());
        }

        for (segment, name) in path.segments.iter_mut().rev().zip(absolute_path) {
            segment.name.value = name;
        }

        path.rooted = true;
    }

    fn visit_call_expr(&mut self, expr: &mut node::expr::CallExpr<'heap>) {
        let item = self.visit(&mut expr.function);

        if let Some(CurrentItem {
            item:
                Item {
                    kind: module::item::ItemKind::Intrinsic(IntrinsicItem::Value(value)),
                    ..
                },
            has_arguments: _, // We ignore it so that we can continue to lower here
        }) = item
            && let Some(constant) = value.name.as_constant()
        {
            match constant {
                sym::path::r#if::CONST => {
                    self.trampoline = Some(lower_if(self, expr));
                    return;
                }
                sym::path::r#as::CONST => {
                    self.trampoline = Some(lower_as(self, expr));
                    return;
                }
                sym::path::r#let::CONST => {
                    self.trampoline = Some(lower_let(self, expr));
                    return;
                }
                sym::path::r#type::CONST => {
                    self.trampoline = Some(lower_type(self, expr));
                    return;
                }
                sym::path::newtype::CONST => {
                    self.trampoline = Some(lower_newtype(self, expr));
                    return;
                }
                sym::path::r#use::CONST => {
                    self.trampoline = Some(lower_use(self, expr));
                    return;
                }
                sym::path::r#fn::CONST => {
                    self.trampoline = Some(lower_fn(self, expr));
                    return;
                }
                sym::path::input::CONST => {
                    self.trampoline = Some(lower_input(self, expr));
                    return;
                }
                sym::path::index::CONST => {
                    self.trampoline = Some(lower_index(self, expr));
                    return;
                }
                sym::path::access::CONST => {
                    self.trampoline = Some(lower_access(self, expr));
                    return;
                }
                _ => {}
            }
        }

        // We haven't encountered a special-form, meaning that we can treat this as a regular call
        // expression
        let CallExpr {
            id: _,
            span: _,
            function: _, // we already visited the function
            arguments,
            labeled_arguments,
        } = expr;

        for argument in arguments {
            self.visit_argument(argument);
        }
        for labeled_argument in labeled_arguments {
            self.visit_labeled_argument(labeled_argument);
        }
    }

    fn visit_expr(&mut self, expr: &mut node::expr::Expr<'heap>) {
        self.visit(expr);
    }

    fn visit_type(&mut self, r#type: &mut node::r#type::Type<'heap>) {
        self.with_universe(Universe::Type, |this| {
            visit::walk_type(this, &mut *r#type);
        });
    }
}
