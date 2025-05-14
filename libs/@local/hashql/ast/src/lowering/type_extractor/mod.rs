pub mod error;
pub mod translate;

use core::mem;

use hashql_core::{
    collection::{FastHashMap, TinyVec},
    module::{
        ModuleRegistry,
        locals::{LocalTypeDef, LocalTypes},
    },
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

    alias: Vec<(Symbol<'heap>, TypeExpr<'heap>)>,
    opaque: Vec<(Symbol<'heap>, NewTypeExpr<'heap>)>,

    diagnostics: Vec<TypeExtractorDiagnostic>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
    #[must_use]
    pub const fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
        module: Symbol<'heap>,
    ) -> Self {
        Self {
            environment,
            registry,

            module,

            alias: Vec::new(),
            opaque: Vec::new(),

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
        let mut diagnostics = Vec::new();

        // Setup the translation unit and environment
        let mut locals = FastHashMap::with_capacity_and_hasher(
            self.alias.len() + self.opaque.len(),
            foldhash::fast::RandomState::default(),
        );

        // This could be easier if we were to use a `FastHashMap` for the alias and opaque
        // respectively. The problem with that approach is that we're losing any kind of information
        // about the order of the types.
        for (name, expr) in &self.alias {
            // We need to defer evaluation of duplicates here, where we actually into a type.
            if let Err(error) = locals.try_insert(
                *name,
                LocalVariable {
                    id: self.environment.types.provision(),
                    r#type: &expr.value,
                    identity: Identity::Structural,
                    arguments: self.convert_generic_constraints(&expr.constraints),
                },
            ) {
                let diagnostic =
                    duplicate_type_alias(error.entry.get().r#type.span, expr.span, *name);
                diagnostics.push(diagnostic);
            }
        }

        for (name, expr) in &self.opaque {
            if let Err(error) = locals.try_insert(
                *name,
                LocalVariable {
                    id: self.environment.types.provision(),
                    r#type: &expr.value,
                    identity: Identity::Nominal(
                        self.environment
                            .heap
                            .intern_symbol(&format!("{}::{}", self.module, name)),
                    ),
                    arguments: self.convert_generic_constraints(&expr.constraints),
                },
            ) {
                let diagnostic = duplicate_newtype(error.entry.get().r#type.span, expr.span, *name);
                diagnostics.push(diagnostic);
            }
        }

        let partial = locals.clone();

        let mut unit = TranslationUnit {
            env: self.environment,
            registry: self.registry,
            diagnostics,
            locals: &partial,
            bound_generics: &TinyVec::new(),
        };

        let alias_iter = self
            .alias
            .iter()
            .map(|(name, expr)| (*name, &expr.constraints));

        let opaque_iter = self
            .opaque
            .iter()
            .map(|(name, expr)| (*name, &expr.constraints));

        // Given that we've finalized the list of arguments, take said list of arguments and
        // initialize the bounds
        for (name, constraints) in alias_iter.chain(opaque_iter) {
            let local = locals.get_mut(&name).unwrap_or_else(|| {
                unreachable!(
                    "Invariant violated: Expected key '{name}' to exist in the 'locals' HashMap, \
                     but it was not found. This indicates a bug in the type extraction logic.",
                )
            });

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

        // We need to keep the iteration order consistent
        for name in self
            .alias
            .iter()
            .map(|&(name, _)| name)
            .chain(self.opaque.iter().map(|&(name, _)| name))
        {
            let variable = &locals[&name];

            unit.bound_generics = &variable.arguments;

            output.insert(LocalTypeDef {
                id: unit.variable(variable),
                name,
            });
        }

        self.diagnostics.extend(unit.diagnostics);
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

                let body = mem::replace(&mut *expr.body, Expr::dummy());

                self.alias.push((name, expr));

                body
            }
            ExprKind::NewType(mut expr) => {
                let name = expr.name.value;

                let body = mem::replace(&mut *expr.body, Expr::dummy());

                self.opaque.push((name, expr));

                body
            }
            _ => unreachable!(),
        };

        *expr = body;
        self.visit_expr(expr);
    }
}
