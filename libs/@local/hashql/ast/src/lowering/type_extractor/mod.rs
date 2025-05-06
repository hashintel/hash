pub mod error;
pub mod translate;

use core::mem;

use hashql_core::{
    collection::{FastHashMap, TinyVec},
    module::ModuleRegistry,
    symbol::Symbol,
    r#type::{TypeId, environment::Environment, kind::generic::GenericArgument},
};

use self::error::{TypeExtractorDiagnostic, duplicate_newtype, duplicate_type_alias};
use crate::{
    node::{
        expr::{Expr, ExprKind, NewTypeExpr, TypeExpr},
        generic::GenericConstraint,
    },
    visit::{Visitor, walk_expr},
};

pub struct TypeEnvironment<'heap> {
    pub alias: FastHashMap<Symbol<'heap>, TypeId>,
    pub opaque: FastHashMap<Symbol<'heap>, TypeId>,
}

pub struct TypeExtractor<'env, 'heap> {
    environment: &'env Environment<'heap>,
    modules: &'env ModuleRegistry<'heap>,

    alias: FastHashMap<Symbol<'heap>, TypeExpr<'heap>>,
    opaque: FastHashMap<Symbol<'heap>, NewTypeExpr<'heap>>,

    diagnostics: Vec<TypeExtractorDiagnostic>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
    #[must_use]
    pub fn new(
        environment: &'env Environment<'heap>,
        modules: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            environment,
            modules,

            alias: FastHashMap::default(),
            opaque: FastHashMap::default(),

            diagnostics: Vec::new(),
        }
    }

    fn provision(&self) -> ProvisionedTypeEnvironment<'heap> {
        let mut provisioned = ProvisionedTypeEnvironment {
            alias: FastHashMap::with_capacity_and_hasher(
                self.alias.len(),
                foldhash::fast::RandomState::default(),
            ),
            opaque: FastHashMap::with_capacity_and_hasher(
                self.opaque.len(),
                foldhash::fast::RandomState::default(),
            ),
        };

        for &name in self.alias.keys() {
            provisioned
                .alias
                .insert(name, self.environment.types.provision());
        }

        for &name in self.opaque.keys() {
            provisioned
                .opaque
                .insert(name, self.environment.types.provision());
        }

        provisioned
    }

    fn convert_generic_constraints(
        &self,
        constraints: &[GenericConstraint<'heap>],
    ) -> TinyVec<GenericArgument<'heap>> {
        let mut arguments = TinyVec::with_capacity(constraints.len());

        for GenericConstraint {
            id: _,
            span: _,
            name,
            bound,
        } in constraints
        {
            arguments.push(GenericArgument {
                id: self.environment.counter.generic_argument.next(),
                name: name.value,
                // TODO: these must be populated *after* the we got all the types in the generics
                // map
                constraint: None,
            });
        }

        arguments
    }

    fn generics(&self) -> Generics<'heap> {
        let mut generics = Generics {
            alias: FastHashMap::with_capacity_and_hasher(
                self.alias.len(),
                foldhash::fast::RandomState::default(),
            ),
            opaque: FastHashMap::with_capacity_and_hasher(
                self.opaque.len(),
                foldhash::fast::RandomState::default(),
            ),
        };

        for (&name, expr) in &self.alias {
            generics
                .alias
                .insert(name, self.convert_generic_constraints(&expr.constraints));
        }

        for (&name, expr) in &self.opaque {
            generics
                .opaque
                .insert(name, self.convert_generic_constraints(&expr.constraints));
        }

        generics
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
