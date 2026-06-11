use alloc::borrow::Cow;
use core::mem;

use hashql_core::{
    collections::{FastHashMap, TinyVec, fast_hash_map_with_capacity},
    module::{
        ModuleRegistry,
        locals::{Local, Locals, TypeLocals},
    },
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::Environment,
        kind::generic::{GenericArgumentMap, GenericArgumentReference},
    },
};
use hashql_diagnostics::DiagnosticIssues;

use super::{
    contractive::is_contractive,
    error::{
        TypeExtractorDiagnosticCategory, TypeExtractorDiagnosticIssues, duplicate_newtype,
        duplicate_type_alias, non_contractive_recursive_type,
    },
    translate::{Identity, LocalVariable, Reference, SpannedGenericArguments, TranslationUnit},
};
use crate::{
    node::{
        expr::{Expr, ExprKind, NewTypeExpr, TypeExpr},
        generic::GenericConstraint,
    },
    visit::{Visitor, walk_expr},
};

type LocalState<'env, 'heap> = (
    FastHashMap<Symbol<'heap>, LocalVariable<'env, 'heap>>,
    GenericArgumentMap<Option<TypeId>>,
    TypeExtractorDiagnosticIssues,
);

pub struct TypeDefinitionExtractor<'env, 'heap> {
    environment: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    module: Symbol<'heap>,

    alias: Vec<(Symbol<'heap>, TypeExpr<'heap>)>,
    opaque: Vec<(Symbol<'heap>, NewTypeExpr<'heap>)>,

    diagnostics: TypeExtractorDiagnosticIssues,
}

impl<'env, 'heap> TypeDefinitionExtractor<'env, 'heap> {
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

            diagnostics: DiagnosticIssues::new(),
        }
    }

    fn convert_generic_constraints(
        &self,
        constraints: &[GenericConstraint<'heap>],
    ) -> SpannedGenericArguments<'heap> {
        let mut arguments = TinyVec::with_capacity(constraints.len());
        let mut spans = TinyVec::with_capacity(constraints.len());

        for GenericConstraint {
            id: _,
            span,
            name,
            bound: _,
        } in constraints
        {
            arguments.push(GenericArgumentReference {
                id: self.environment.counter.generic_argument.next(),
                name: name.value,
                // Constraints are populated in a second pass, after all types have been
                // provisioned
            });

            spans.push(*span);
        }

        SpannedGenericArguments::from_parts(arguments, spans)
    }

    fn setup_locals(&self) -> LocalState<'_, 'heap> {
        let mut diagnostics = DiagnosticIssues::new();

        // Setup the translation unit and environment
        let mut locals = FastHashMap::with_capacity_and_hasher(
            self.alias.len() + self.opaque.len(),
            foldhash::fast::RandomState::default(),
        );
        let mut allocated_generic_constraints = 0;

        // This could be easier if we were to use a `FastHashMap` for the alias and opaque
        // respectively. The problem with that approach is that we're losing any kind of information
        // about the order of the types.
        for (name, expr) in &self.alias {
            let arguments = self.convert_generic_constraints(&expr.constraints);
            allocated_generic_constraints += arguments.len();

            // We need to defer evaluation of duplicates here, where we actually into a type.
            if let Err(error) = locals.try_insert(
                *name,
                LocalVariable {
                    id: self.environment.types.provision(),
                    name: expr.name,
                    r#type: &expr.value,
                    identity: Identity::Structural,
                    arguments,
                },
            ) {
                let diagnostic =
                    duplicate_type_alias(error.entry.get().r#type.span, expr.span, *name);
                diagnostics.push(diagnostic);
            }
        }

        for (name, expr) in &self.opaque {
            let arguments = self.convert_generic_constraints(&expr.constraints);
            allocated_generic_constraints += arguments.len();

            if let Err(error) = locals.try_insert(
                *name,
                LocalVariable {
                    id: self.environment.types.provision(),
                    name: expr.name,
                    r#type: &expr.value,
                    identity: Identity::Nominal(
                        self.environment
                            .heap
                            .intern_symbol(&format!("{}::{}", self.module, name)),
                    ),
                    arguments,
                },
            ) {
                let diagnostic = duplicate_newtype(error.entry.get().r#type.span, expr.span, *name);
                diagnostics.push(diagnostic);
            }
        }

        let mut constraints = fast_hash_map_with_capacity(allocated_generic_constraints);

        let mut unit = TranslationUnit {
            env: self.environment,
            registry: self.registry,
            diagnostics,
            locals: &locals,
            bound_generics: Cow::Owned(SpannedGenericArguments::empty()),
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
        for (name, def_constraints) in alias_iter.chain(opaque_iter) {
            let local = locals.get(&name).unwrap_or_else(|| {
                unreachable!(
                    "Invariant violated: Expected key '{name}' to exist in the 'locals' HashMap, \
                     but it was not found. This indicates a bug in the type extraction logic.",
                )
            });

            debug_assert_eq!(def_constraints.len(), local.arguments.len());

            unit.bound_generics = Cow::Borrowed(&locals[&name].arguments);

            for (constraint, argument) in def_constraints.iter().zip(local.arguments.iter()) {
                debug_assert_eq!(constraint.name.value, argument.name);

                let bound = constraint
                    .bound
                    .as_ref()
                    .map(|bound| unit.reference(Reference::Type(bound)));

                constraints.insert(argument.id, bound);
            }
        }

        let diagnostics = unit.diagnostics;

        (locals, constraints, diagnostics)
    }

    fn translate(&mut self) -> TypeLocals<'heap> {
        let (variables, constraints, mut diagnostics) = self.setup_locals();

        let mut unit = TranslationUnit {
            env: self.environment,
            registry: self.registry,
            diagnostics: DiagnosticIssues::new(),
            locals: &variables,

            bound_generics: Cow::Owned(SpannedGenericArguments::empty()),
        };

        let mut locals = Locals::with_capacity(variables.len());

        // We need to keep the iteration order consistent
        for name in self
            .alias
            .iter()
            .map(|&(name, _)| name)
            .chain(self.opaque.iter().map(|&(name, _)| name))
        {
            let variable = &variables[&name];

            unit.bound_generics = Cow::Borrowed(&variable.arguments);

            locals.insert(Local {
                name,
                value: unit.variable(variable, &constraints),
            });
        }

        // check if all variables are contractive (this needs to happen *after* to ensure that
        // references are resolved)
        for local in locals.iter() {
            let variable = &variables[&local.name];
            let partial = self.environment.types.index_partial(local.value.id);

            if let Err(span) = is_contractive(self.environment, partial.kind) {
                diagnostics.push(non_contractive_recursive_type(
                    variable.name.span,
                    span,
                    local.name,
                ));
            }
        }

        self.diagnostics.extend(unit.diagnostics);
        self.diagnostics.extend(diagnostics);

        let diagnostics = locals.finish(self.environment);
        self.diagnostics.extend(
            diagnostics.into_vec().into_iter().map(|diagnostic| {
                diagnostic.map_category(TypeExtractorDiagnosticCategory::TypeCheck)
            }),
        );

        locals
    }

    pub fn finish(mut self) -> (TypeLocals<'heap>, TypeExtractorDiagnosticIssues) {
        let locals = self.translate();

        (locals, self.diagnostics)
    }
}

impl<'heap> Visitor<'heap> for TypeDefinitionExtractor<'_, 'heap> {
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
            ExprKind::Call(_)
            | ExprKind::Struct(_)
            | ExprKind::Dict(_)
            | ExprKind::Tuple(_)
            | ExprKind::List(_)
            | ExprKind::Literal(_)
            | ExprKind::Path(_)
            | ExprKind::Let(_)
            | ExprKind::Use(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::As(_)
            | ExprKind::Underscore
            | ExprKind::Dummy => unreachable!(),
        };

        *expr = body;
        self.visit_expr(expr);
    }
}
