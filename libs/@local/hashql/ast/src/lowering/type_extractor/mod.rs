pub mod error;

use core::mem;

use hashql_core::{
    collection::FastHashMap,
    intern::Provisioned,
    symbol::Symbol,
    r#type::{
        PartialType, TypeId,
        environment::Environment,
        kind::{Infer, TypeKind},
    },
};

use self::error::{TypeExtractorDiagnostic, duplicate_newtype, duplicate_type_alias};
use crate::{
    node::{
        self,
        expr::{Expr, ExprKind, NewTypeExpr, TypeExpr},
        r#type::Type,
    },
    visit::{Visitor, walk_expr},
};

pub struct TypeEnvironment<'heap> {
    pub alias: FastHashMap<Symbol<'heap>, TypeId>,
    pub opaque: FastHashMap<Symbol<'heap>, TypeId>,
}

struct ProvisionedTypeEnvironment<'heap> {
    alias: FastHashMap<Symbol<'heap>, Provisioned<TypeId>>,
    opaque: FastHashMap<Symbol<'heap>, Provisioned<TypeId>>,
}

pub struct TypeExtractor<'env, 'heap> {
    environment: &'env Environment<'heap>,

    alias: FastHashMap<Symbol<'heap>, TypeExpr<'heap>>,
    opaque: FastHashMap<Symbol<'heap>, NewTypeExpr<'heap>>,

    diagnostics: Vec<TypeExtractorDiagnostic>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
    #[must_use]
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,

            alias: FastHashMap::default(),
            opaque: FastHashMap::default(),

            diagnostics: Vec::new(),
        }
    }

    fn convert_type(
        &mut self,
        id: Provisioned<TypeId>,
        r#type: Type<'heap>,
        provisioned: &ProvisionedTypeEnvironment<'heap>,
    ) {
        // for generics we basically need to collect all the generics, and then until we hit a path
        // that is the generics, then ofc for generics on the path itself, it's imperative that said
        // the arguments are mapped to those as well, in a sense we need a type visitor?
        let kind = match r#type.kind {
            node::r#type::TypeKind::Infer => {
                let hole = self.environment.counter.hole.next();

                TypeKind::Infer(Infer { hole })
            }
            node::r#type::TypeKind::Path(path) => todo!(),
            node::r#type::TypeKind::Tuple(tuple_type) => {
                todo!()
            }
            node::r#type::TypeKind::Struct(struct_type) => todo!(),
            node::r#type::TypeKind::Union(union_type) => todo!(),
            node::r#type::TypeKind::Intersection(intersection_type) => todo!(),
        };
    }
}

impl<'heap> Visitor<'heap> for TypeExtractor<'_, 'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        if !matches!(expr.kind, ExprKind::Type(_) | ExprKind::NewType(_)) {
            walk_expr(self, expr);
            return;
        }

        let body = match mem::replace(&mut expr.kind, ExprKind::Dummy) {
            ExprKind::Type(mut expr) => {
                let name = expr.name.value;
                let span = expr.span;

                let body = mem::replace(&mut *expr.body, Expr::dummy());

                if let Err(error) = self.alias.try_insert(name, expr) {
                    let diagnostic = duplicate_type_alias(error.entry.get().span, span, name);
                    self.diagnostics.push(diagnostic);
                }

                body
            }
            ExprKind::NewType(mut expr) => {
                let name = expr.name.value;
                let span = expr.span;

                let body = mem::replace(&mut *expr.body, Expr::dummy());

                if let Err(error) = self.opaque.try_insert(name, expr) {
                    let diagnostic = duplicate_newtype(error.entry.get().span, span, name);
                    self.diagnostics.push(diagnostic);
                }

                body
            }
            _ => unreachable!(),
        };

        *expr = body;
        self.visit_expr(expr);
    }
}
