mod access;
mod r#as;
mod error;
mod r#fn;
mod r#if;
mod index;
mod input;
mod r#let;
mod newtype;
mod r#type;
mod r#use;

use hashql_core::{
    heap::{self, BumpAllocator},
    module::{
        self, Reference, Universe,
        item::{IntrinsicItem, Item},
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
    node::{self, id::NodeId},
    visit::{self, Visitor},
};

enum BindingKind<'heap> {
    Local(Universe),
    Remote(Item<'heap>),
}

impl<'heap> From<Item<'heap>> for BindingKind<'heap> {
    fn from(v: Item<'heap>) -> Self {
        Self::Remote(v)
    }
}

impl<'heap> From<Universe> for BindingKind<'heap> {
    fn from(v: Universe) -> Self {
        Self::Local(v)
    }
}

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

// What does the expander do?
// The expander does the following:
// 1. it resolves imports
// 2. once resolved, it expands special forms
pub struct Expander<'env, 'heap, S> {
    heap: &'heap heap::Heap,
    scratch: S,

    namespace: ModuleNamespace<'env, 'heap>,
    current_universe: Universe,
    diagnostics: ExpanderDiagnosticIssues,

    current_item: Option<module::item::Item<'heap>>,
    trampoline: Option<node::expr::Expr<'heap>>,
}

impl<'env, 'heap, S> Expander<'env, 'heap, S> {
    pub const fn new(namespace: ModuleNamespace<'env, 'heap>, scratch: S) -> Self {
        Self {
            heap: namespace.registry().heap,
            namespace,
            scratch,
            current_universe: Universe::Value,
            diagnostics: ExpanderDiagnosticIssues::new(),
            current_item: None,
            trampoline: None,
        }
    }

    fn visit(&mut self, expr: &mut node::expr::Expr<'heap>) -> Option<module::item::Item<'heap>>
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

    fn with_universe<T>(&mut self, universe: Universe, closure: impl FnOnce(&mut Self) -> T) -> T {
        let prev_universe = self.current_universe;
        self.current_universe = universe;
        let result = closure(self);
        self.current_universe = prev_universe;
        result
    }

    fn bind<T>(
        &mut self,
        variable: Symbol<'heap>,
        kind: impl Into<BindingKind<'heap>>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        self.bind_many([(variable, kind)], closure)
    }

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

    fn bind_many<T, K>(
        &mut self,
        variables: impl IntoIterator<Item = (Symbol<'heap>, K)>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T
    where
        K: Into<BindingKind<'heap>>,
    {
        // The inline is here, because this is a hot path, this is just desugaring of the underlying
        // iterator, make it explicit so that it indeed inlines the call
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
    fn visit_path(&mut self, path: &mut node::path::Path<'heap>) {
        self.current_item = None;
        visit::walk_path(self, path);

        let [modules @ .., _] = &*path.segments else {
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

        self.current_item = Some(item);

        let absolute_path = item.absolute_path_rev(self.namespace.registry());
        if absolute_path.len() < path.segments.len() {
            self.diagnostics.push(error::absolute_path_mismatch(
                path.span,
                path.segments.len(),
                absolute_path.len(),
            ));
            self.trampoline = Some(node::expr::Expr::dummy());
            return;
        }

        // We must pad the segments with placeholders so that the path segments match the absolute
        // path
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
                arguments: heap::Vec::new_in(self.namespace.registry().heap),
            },
            padding,
        ));
        path.segments.rotate_right(padding);

        for (segment, name) in path.segments.iter_mut().rev().zip(absolute_path) {
            segment.name.value = name;
        }

        path.rooted = true;
    }

    fn visit_call_expr(&mut self, expr: &mut node::expr::CallExpr<'heap>) {
        let item = self.visit(&mut expr.function);

        if let Some(Item {
            kind: module::item::ItemKind::Intrinsic(IntrinsicItem::Value(value)),
            ..
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
        visit::walk_call_expr(self, expr);
    }

    fn visit_expr(&mut self, expr: &mut node::expr::Expr<'heap>) {
        self.visit(expr);
    }
}
