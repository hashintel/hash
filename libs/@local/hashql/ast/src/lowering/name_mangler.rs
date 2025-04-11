use core::fmt::Write as _;

use foldhash::fast::RandomState;
use hashbrown::HashMap;
use hashql_core::symbol::Symbol;

use crate::{
    node::{
        expr::{LetExpr, NewTypeExpr, TypeExpr},
        path::Path,
    },
    visit::{Visitor, walk_path},
};

pub struct NameMangler {
    scope: HashMap<Symbol, Symbol, RandomState>,
    counter: HashMap<Symbol, usize, RandomState>,
}

impl NameMangler {
    #[must_use]
    pub fn new() -> Self {
        Self {
            scope: HashMap::with_hasher(RandomState::default()),
            counter: HashMap::with_hasher(RandomState::default()),
        }
    }

    fn mangle(&mut self, symbol: &mut Symbol) -> Symbol {
        let count = self.counter.entry(symbol.clone()).or_insert(0);

        // Mangled symbols in hashql are `<symbol>:<count>`, as any identifier with `:<count>` is
        // invalid. This exploits the fact that `:` is neither valid in symbol, BaseUrl nor lexical
        // identifiers at this position.
        // Lexical identifiers can't have a colon in them, symbols are expressively forbidden to
        // have a colon in them and `BaseUrl` must end with a `/`. This means that even though the
        // url can have a `:` in it, it can't have it at the end with a number.
        symbol.push(':');
        let _ = write!(symbol, "{count}");

        *count += 1;

        symbol.clone()
    }

    fn enter<T>(
        &mut self,
        symbol: Symbol,
        replace_with: Symbol,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let old = self.scope.insert(symbol.clone(), replace_with);

        let result = closure(self);

        if let Some(old) = old {
            self.scope.insert(symbol, old);
        } else {
            self.scope.remove(&symbol);
        }

        result
    }
}

impl<'heap> Visitor<'heap> for NameMangler {
    fn visit_path(&mut self, path: &mut Path<'heap>) {
        // If the first segment is a symbol, and said symbol has a renamed version, replace it. This
        // is only every the case if it isn't rooted.
        if path.rooted {
            walk_path(self, path);
            return;
        }

        let first = &mut path.segments[0];
        if let Some(replacement) = self.scope.get(&first.name.value) {
            first.name.value = replacement.clone();
        }

        walk_path(self, path);
    }

    // visit any binding form to rename it, there are the following binding forms available:
    // let (value scope)
    // type (type scope)
    // newtype (type scope)
    // use (value *or* type scope)

    // We do not need to distinguish between value and type scopes here, as we mangle the symbols of
    // everyone regardless and they should be unique across the different environments.

    fn visit_let_expr(&mut self, expr: &mut LetExpr<'heap>) {
        let original = expr.name.value.clone();
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

        self.enter(original, mangled, |this| this.visit_expr(body));
    }

    fn visit_type_expr(&mut self, expr: &mut TypeExpr<'heap>) {
        let original = expr.name.value.clone();
        let mangled = self.mangle(&mut expr.name.value);

        let TypeExpr {
            id,
            span,
            name,
            value,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);
        self.visit_type(value);

        self.enter(original, mangled, |this| this.visit_expr(body));
    }

    fn visit_newtype_expr(&mut self, expr: &mut NewTypeExpr<'heap>) {
        let original = expr.name.value.clone();
        let mangled = self.mangle(&mut expr.name.value);

        let NewTypeExpr {
            id,
            span,
            name,
            value,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);
        self.visit_type(value);

        self.enter(original, mangled, |this| this.visit_expr(body));
    }

    // TODO: use globs cannot be mangled because we don't know what it actually imports (we need
    // module environment here)
    //
    // TODO: use expressions should never be affected from mangling (at least the path shouldn't be)
    // - this means we need to skip it during mangling
}

impl Default for NameMangler {
    fn default() -> Self {
        Self::new()
    }
}
