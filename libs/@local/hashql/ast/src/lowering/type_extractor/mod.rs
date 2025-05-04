pub mod error;

use core::mem;

use hashql_core::{collection::FastHashMap, symbol::Symbol};

use self::error::TypeExtractorDiagnostic;
use crate::{
    node::expr::{Expr, ExprKind, NewTypeExpr, TypeExpr},
    visit::{Visitor, walk_expr},
};

pub struct TypeExtractor<'heap> {
    alias: FastHashMap<Symbol<'heap>, TypeExpr<'heap>>,
    opaque: FastHashMap<Symbol<'heap>, NewTypeExpr<'heap>>,

    diagnostics: Vec<TypeExtractorDiagnostic>,
}

impl TypeExtractor<'_> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            alias: FastHashMap::default(),
            opaque: FastHashMap::default(),

            diagnostics: Vec::new(),
        }
    }
}

impl<'heap> Visitor<'heap> for TypeExtractor<'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        if !matches!(expr.kind, ExprKind::Type(_) | ExprKind::NewType(_)) {
            walk_expr(self, expr);
            return;
        }

        let body = match mem::replace(&mut expr.kind, ExprKind::Dummy) {
            ExprKind::Type(mut expr) => {
                let body = mem::replace(&mut *expr.body, Expr::dummy());

                if let Err(error) = self.alias.try_insert(expr.name.value, expr) {
                    todo!("record diagnostic");
                }

                body
            }
            ExprKind::NewType(mut expr) => {
                let body = mem::replace(&mut *expr.body, Expr::dummy());

                if let Err(error) = self.opaque.try_insert(expr.name.value, expr) {
                    todo!("record diagnostic");
                }

                body
            }
            _ => unreachable!(),
        };

        *expr = body;
        self.visit_expr(expr);
    }
}

impl Default for TypeExtractor<'_> {
    fn default() -> Self {
        Self::new()
    }
}
