pub mod error;
pub mod translate;

use core::mem;

use hashql_core::{
    collection::{FastHashMap, TinyVec},
    module::{ModuleRegistry, locals::LocalTypes},
    symbol::Symbol,
    r#type::{TypeId, environment::Environment, kind::generic::GenericArgument},
};

use self::{
    error::{
        TypeExtractorDiagnostic, TypeExtractorDiagnosticCategory, duplicate_newtype,
        duplicate_type_alias,
    },
    translate::{Identity, LocalVariable, Reference, TranslationUnit},
};
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
    registry: &'env ModuleRegistry<'heap>,

    module: Symbol<'heap>,

    alias: FastHashMap<Symbol<'heap>, TypeExpr<'heap>>,
    opaque: FastHashMap<Symbol<'heap>, NewTypeExpr<'heap>>,

    diagnostics: Vec<TypeExtractorDiagnostic>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
    #[must_use]
    pub fn new(
        environment: &'env Environment<'heap>,
        modules: &'env ModuleRegistry<'heap>,
        module: Symbol<'heap>,
    ) -> Self {
        Self {
            environment,
            registry: modules,

            module,

            alias: FastHashMap::default(),
            opaque: FastHashMap::default(),

            diagnostics: Vec::new(),
        }
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
            bound: _,
        } in constraints
        {
            arguments.push(GenericArgument {
                id: self.environment.counter.generic_argument.next(),
                name: name.value,
                // Constraints are populated in a second pass, after all types have been
                // provisioned
                constraint: None,
            });
        }

        arguments
    }

    fn setup_locals(
        &self,
    ) -> (
        FastHashMap<Symbol<'heap>, LocalVariable<'_, 'heap>>,
        Vec<TypeExtractorDiagnostic>,
    ) {
        // Setup the translation unit and environment
        let mut locals = FastHashMap::with_capacity_and_hasher(
            self.alias.len() + self.opaque.len(),
            foldhash::fast::RandomState::default(),
        );

        for (&name, r#type) in &self.alias {
            locals.insert(
                name,
                LocalVariable {
                    id: self.environment.types.provision(),
                    r#type: &r#type.value,
                    identity: Identity::Structural,
                    arguments: self.convert_generic_constraints(&r#type.constraints),
                },
            );
        }

        for (&name, r#type) in &self.opaque {
            locals.insert(
                name,
                LocalVariable {
                    id: self.environment.types.provision(),
                    r#type: &r#type.value,
                    identity: Identity::Nominal(
                        self.environment
                            .heap
                            .intern_symbol(&format!("{}::{}", self.module, name)),
                    ),
                    arguments: self.convert_generic_constraints(&r#type.constraints),
                },
            );
        }

        let partial = locals.clone();

        let mut unit = TranslationUnit {
            env: self.environment,
            registry: self.registry,
            diagnostics: Vec::new(),
            locals: &partial,
            bound_generics: &TinyVec::new(),
        };

        // Given that we've finalized the list of arguments, take said list of arguments and
        // initialize the bounds
        for (&name, local) in &mut locals {
            // Find the alias or opaque that corresponds to this (and it's arguments)
            let constraints = &self.alias.get(&name).map_or_else(
                || &self.opaque[&name].constraints,
                |r#type| &r#type.constraints,
            );

            debug_assert_eq!(constraints.len(), local.arguments.len());

            unit.bound_generics = &partial[&name].arguments;

            for (constraint, argument) in constraints.iter().zip(local.arguments.iter_mut()) {
                debug_assert_eq!(constraint.name.value, argument.name);

                if let Some(bound) = &constraint.bound {
                    argument.constraint =
                        Some(unit.reference(Reference::Type(bound), TinyVec::new()));
                }
            }
        }

        (locals, unit.diagnostics)
    }

    fn translate(&mut self) -> LocalTypes<'heap> {
        let (locals, diagnostics) = self.setup_locals();

        let mut unit = TranslationUnit {
            env: self.environment,
            registry: self.registry,
            diagnostics: Vec::new(),
            locals: &locals,
            bound_generics: &TinyVec::new(),
        };

        let mut output = LocalTypes::with_capacity(locals.len());

        for (&name, variable) in &locals {
            unit.bound_generics = &variable.arguments;

            output.insert(name, unit.variable(variable));
        }

        self.diagnostics.extend(diagnostics);

        let diagnostics = output.finish(self.environment);
        self.diagnostics.extend(
            diagnostics.into_vec().into_iter().map(|diagnostic| {
                diagnostic.map_category(TypeExtractorDiagnosticCategory::TypeCheck)
            }),
        );

        output
    }

    #[must_use]
    pub fn finish(mut self) -> (LocalTypes<'heap>, Vec<TypeExtractorDiagnostic>) {
        let locals = self.translate();

        (locals, self.diagnostics)
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
