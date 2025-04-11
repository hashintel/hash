use core::fmt::Write as _;

use foldhash::fast::RandomState;
use hashbrown::HashMap;
use hashql_core::symbol::Symbol;

use crate::{
    node::{
        expr::{ClosureExpr, Expr, LetExpr, NewTypeExpr, TypeExpr, closure::ClosureSignature},
        path::Path,
        r#type::Type,
    },
    visit::{Visitor, walk_expr, walk_path, walk_type},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum Scope {
    Type,
    Value,
}

struct Residual {
    name: Symbol,
    value: Option<Symbol>,
}

struct Scopes {
    value: HashMap<Symbol, Symbol, RandomState>,
    r#type: HashMap<Symbol, Symbol, RandomState>,
}

impl Scopes {
    fn new() -> Self {
        Self {
            value: HashMap::with_hasher(RandomState::default()),
            r#type: HashMap::with_hasher(RandomState::default()),
        }
    }

    fn enter(&mut self, scope: Scope, original: Symbol, mangled: Symbol) -> Residual {
        let residual = match scope {
            Scope::Type => self.r#type.insert(original.clone(), mangled),
            Scope::Value => self.value.insert(original.clone(), mangled),
        };

        Residual {
            name: original,
            value: residual,
        }
    }

    fn exit(&mut self, scope: Scope, residual: Residual) {
        if let Some(old) = residual.value {
            match scope {
                Scope::Type => self.r#type.insert(residual.name, old),
                Scope::Value => self.value.insert(residual.name, old),
            };
        } else {
            match scope {
                Scope::Type => self.r#type.remove(&residual.name),
                Scope::Value => self.value.remove(&residual.name),
            };
        }
    }

    fn get(&self, scope: Scope, name: &Symbol) -> Option<Symbol> {
        match scope {
            Scope::Type => self.r#type.get(name).cloned(),
            Scope::Value => self.value.get(name).cloned(),
        }
    }
}

struct MangledClosureSignature {
    generic_params: Vec<(Symbol, Symbol)>,
    inputs: Vec<(Symbol, Symbol)>,
}

pub struct NameMangler {
    scopes: Scopes,
    current_scope: Scope,

    counter: HashMap<Symbol, usize, RandomState>,
}

impl NameMangler {
    #[must_use]
    pub fn new() -> Self {
        Self {
            scopes: Scopes::new(),
            current_scope: Scope::Value,
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
        scope: Scope,
        original: Symbol,
        mangled: Symbol,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let residual = self.scopes.enter(scope, original, mangled);

        let result = closure(self);

        self.scopes.exit(scope, residual);

        result
    }

    fn enter_many<T>(
        &mut self,
        scope: Scope,
        replacements: Vec<(Symbol, Symbol)>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let mut residuals = Vec::with_capacity(replacements.len());

        for (original, replacement) in replacements {
            residuals.push(self.scopes.enter(scope, original, replacement));
        }

        let result = closure(self);

        for residual in residuals.into_iter().rev() {
            self.scopes.exit(scope, residual);
        }

        result
    }

    fn mangle_closure_signature(
        &mut self,
        ClosureSignature {
            id,
            span,
            generics,
            inputs,
            output,
        }: &mut ClosureSignature<'_>,
    ) -> MangledClosureSignature {
        self.visit_id(id);
        self.visit_span(span);

        let mangled_generic_params: Vec<_> = generics
            .params
            .iter_mut()
            .map(|param| {
                let original = param.name.value.clone();
                let mangled = self.mangle(&mut param.name.value);

                (original, mangled)
            })
            .collect();

        let mangled_inputs: Vec<_> = inputs
            .iter_mut()
            .map(|input| {
                let original = input.name.value.clone();
                let mangled = self.mangle(&mut input.name.value);

                (original, mangled)
            })
            .collect();

        self.visit_generics(generics);

        self.enter_many(Scope::Type, mangled_generic_params.clone(), |this| {
            for param in inputs {
                this.visit_closure_param(param);
            }

            this.visit_type(output);
        });

        MangledClosureSignature {
            generic_params: mangled_generic_params,
            inputs: mangled_inputs,
        }
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
        if let Some(replacement) = self.scopes.get(self.current_scope, &first.name.value) {
            first.name.value = replacement;
        }

        walk_path(self, path);
    }

    // visit any binding form to rename it, there are the following binding forms available:
    // let (value scope)
    // type (type scope)
    // newtype (type scope)
    // fn (type *and* value scope)
    // use (value *or* type scope)
    //
    // TODO: H-4377
    // The use expressions are not further mangled, as the import resolver (run before this) will
    // have replaced any import in the code with the absolute path.
    // In this stage any use statement should no longer be present.

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

        self.enter(Scope::Value, original, mangled, |this| {
            this.visit_expr(body);
        });
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

        self.enter(Scope::Type, original, mangled, |this| this.visit_expr(body));
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

        self.enter(Scope::Type, original, mangled, |this| this.visit_expr(body));
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        let previous = self.current_scope;
        self.current_scope = Scope::Value;
        walk_expr(self, expr);
        self.current_scope = previous;
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        let previous = self.current_scope;
        self.current_scope = Scope::Type;
        walk_type(self, r#type);
        self.current_scope = previous;
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

        let MangledClosureSignature {
            generic_params,
            inputs,
        } = self.mangle_closure_signature(signature);

        self.enter_many(Scope::Type, generic_params, |this| {
            this.enter_many(Scope::Value, inputs, |this| this.visit_expr(body));
        });
    }
}

impl Default for NameMangler {
    fn default() -> Self {
        Self::new()
    }
}
