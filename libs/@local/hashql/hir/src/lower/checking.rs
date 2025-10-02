use core::fmt::Display;

use hashql_core::{
    collection::{FastHashMap, FastHashSet, HashMapExt as _},
    module::{
        ModuleRegistry, Universe,
        item::{IntrinsicItem, IntrinsicValueItem, ItemKind},
        universe::Entry,
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        PartialType, TypeBuilder, TypeId,
        environment::{
            AnalysisEnvironment, Environment, LatticeEnvironment, SimplifyEnvironment, Variance,
        },
        error::TypeCheckDiagnosticIssues,
        kind::{PrimitiveType, TypeKind, generic::GenericArgumentReference},
    },
};
use hashql_diagnostics::DiagnosticIssues;

use super::{
    error::{
        GenericArgumentContext, LoweringDiagnosticCategory, LoweringDiagnosticIssues,
        LoweringDiagnosticStatus, type_mismatch_if,
    },
    inference::{Local, TypeInferenceResidual},
};
use crate::{
    lower::error::generic_argument_mismatch,
    node::{
        HirId, Node,
        access::{field::FieldAccess, index::IndexAccess},
        branch::r#if::If,
        call::Call,
        closure::Closure,
        data::{Literal, Tuple},
        graph::Graph,
        input::Input,
        r#let::Let,
        operation::{
            BinaryOperation, UnaryOperation,
            r#type::{TypeAssertion, TypeConstructor},
        },
        variable::{LocalVariable, QualifiedVariable},
    },
    visit::{self, Visitor},
};

pub struct TypeCheckingResidual<'heap> {
    pub types: FastHashMap<HirId, TypeId>,
    pub inputs: FastHashMap<Symbol<'heap>, TypeId>,
    pub intrinsics: FastHashMap<HirId, &'static str>,
}

pub struct TypeChecking<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    locals: FastHashMap<Symbol<'heap>, Local<'heap>>,
    inference: FastHashMap<HirId, TypeId>,
    intrinsics: FastHashMap<HirId, &'static str>,

    lattice: LatticeEnvironment<'env, 'heap>,
    analysis: AnalysisEnvironment<'env, 'heap>,
    simplify: SimplifyEnvironment<'env, 'heap>,

    current: HirId,
    visited: FastHashSet<HirId>,
    diagnostics: LoweringDiagnosticIssues,
    analysis_diagnostics: TypeCheckDiagnosticIssues,

    types: FastHashMap<HirId, TypeId>,
    inputs: FastHashMap<Symbol<'heap>, TypeId>,
    simplified: FastHashMap<TypeId, TypeId>,
}

impl<'env, 'heap> TypeChecking<'env, 'heap> {
    pub fn new(
        env: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,

        TypeInferenceResidual {
            locals,
            types: inference,
            intrinsics,
        }: TypeInferenceResidual<'heap>,
    ) -> Self {
        let mut analysis = AnalysisEnvironment::new(env);
        analysis.with_diagnostics();

        Self {
            env,
            registry,

            locals,
            inference,
            intrinsics,

            lattice: LatticeEnvironment::new(env),
            analysis,
            simplify: SimplifyEnvironment::new(env),

            current: HirId::PLACEHOLDER,
            visited: FastHashSet::default(),
            diagnostics: DiagnosticIssues::new(),
            analysis_diagnostics: DiagnosticIssues::new(),

            types: FastHashMap::default(),
            inputs: FastHashMap::default(),
            simplified: FastHashMap::default(),
        }
    }

    fn simplified_type(&mut self, id: TypeId) -> TypeId {
        match self.simplified.entry(id) {
            Entry::Occupied(occupied) => *occupied.get(),
            Entry::Vacant(vacant) => *vacant.insert(self.simplify.simplify(id)),
        }
    }

    fn inferred_type(&mut self, id: HirId) -> TypeId {
        self.simplify.simplify(self.inference[&id])
    }

    fn transfer_type(&mut self, id: HirId) {
        let inferred = self.inferred_type(id);

        self.types.insert_unique(id, inferred);
    }

    fn verify_arity(
        &mut self,
        node_span: SpanId,

        variable_span: SpanId,
        variable_name: impl Display,

        parameters: &[GenericArgumentReference<'heap>],
        arguments: &[Spanned<TypeId>],
    ) {
        if arguments.is_empty() {
            // Fully inferred, which is fine
            return;
        }

        if parameters.len() == arguments.len() {
            return;
        }

        self.diagnostics.push(generic_argument_mismatch(
            GenericArgumentContext::Closure,
            node_span,
            variable_span,
            variable_name,
            parameters,
            arguments,
        ));
    }

    fn verify_subtype(&mut self, subtype: TypeId, supertype: TypeId) {
        // We're not directly interested in the result, as we initialize the analysis environment
        // with diagnostics, in that case, if verification fails we'll have a diagnostic telling us
        // why. We just use the return type to ensure that said diagnostics have been emitted and we
        // don't silently swallow an error.
        let compatible = self
            .analysis
            .is_subtype_of(Variance::Covariant, subtype, supertype);

        if compatible {
            self.analysis.clear_diagnostics();
        } else {
            debug_assert_ne!(
                self.analysis.fatal_diagnostics(),
                0,
                "subtype verification should've contributed to the amount of fatal diagnostics"
            );

            self.analysis
                .merge_diagnostics_into(&mut self.analysis_diagnostics);
        }
    }

    fn is_subtype(&mut self, subtype: TypeId, supertype: TypeId) -> bool {
        self.analysis.with_diagnostics_disabled(|analysis| {
            analysis.is_subtype_of(Variance::Covariant, subtype, supertype)
        })
    }

    /// Finalizes the type checking process and returns the collected results.
    ///
    /// # Errors
    ///
    /// This method consolidates all diagnostics from the various type checking environments
    /// (lattice, simplify, analysis) and packages the inferred types, input types, and
    /// intrinsic mappings into a [`TypeCheckingResidual`] for use by subsequent compilation phases.
    pub fn finish(mut self) -> LoweringDiagnosticStatus<TypeCheckingResidual<'heap>> {
        self.analysis_diagnostics
            .append(&mut self.lattice.take_diagnostics());

        if let Some(mut simplify) = self.simplify.take_diagnostics() {
            self.analysis_diagnostics.append(&mut simplify);
        }

        if let Some(mut analysis) = self.analysis.take_diagnostics() {
            self.analysis_diagnostics.append(&mut analysis);
        }

        self.diagnostics.append(
            &mut self
                .analysis_diagnostics
                .map_category(LoweringDiagnosticCategory::TypeChecking),
        );

        let residual = TypeCheckingResidual {
            types: self.types,
            inputs: self.inputs,
            intrinsics: self.intrinsics,
        };

        self.diagnostics.into_status(residual)
    }
}

impl<'heap> Visitor<'heap> for TypeChecking<'_, 'heap> {
    fn visit_type_id(&mut self, id: TypeId) {
        self.simplified_type(id);
    }

    fn visit_node(&mut self, node: &Node<'heap>) {
        if !self.visited.insert(node.id) {
            return;
        }

        let previous = self.current;
        self.current = node.id;

        visit::walk_node(self, node);

        self.current = previous;
    }

    fn visit_literal(&mut self, literal: &'heap Literal<'heap>) {
        visit::walk_literal(self, literal);
        self.transfer_type(self.current);
    }

    fn visit_tuple(&mut self, tuple: &'heap Tuple<'heap>) {
        visit::walk_tuple(self, tuple);
        self.transfer_type(self.current);
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        let generic_arguments = self.locals[&variable.name.value].r#type.arguments;
        self.verify_arity(
            variable.span,
            variable.name.span,
            variable.name(),
            &generic_arguments,
            &variable.arguments,
        );

        self.transfer_type(self.current);
    }

    fn visit_qualified_variable(&mut self, variable: &'heap QualifiedVariable<'heap>) {
        visit::walk_qualified_variable(self, variable);

        let item = self
            .registry
            .lookup(
                variable.path.0.iter().map(|ident| ident.value),
                Universe::Value,
            )
            .unwrap_or_else(|| unreachable!("import resolver should've caught this issue"));

        let def = match item.kind {
            ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem { name: _, r#type })) => {
                r#type
            }
            ItemKind::Constructor(_)
            | ItemKind::Module(_)
            | ItemKind::Type(_)
            | ItemKind::Intrinsic(IntrinsicItem::Type(_)) => {
                unreachable!()
            }
        };
        self.verify_arity(
            variable.span,
            variable.path.0.last().expect("should be non-empty").span,
            variable.name(),
            &def.arguments,
            &variable.arguments,
        );

        self.transfer_type(self.current);
    }

    fn visit_let(
        &mut self,
        Let {
            span,
            name,
            value,
            body,
        }: &'heap Let<'heap>,
    ) {
        self.visit_span(*span);

        self.visit_ident(name);
        self.visit_node(value);

        self.visit_node(body);

        // We simply take the type of the body
        let body_id = self.types[&body.id];
        self.types.insert_unique(self.current, body_id);
    }

    fn visit_input(&mut self, input: &'heap Input<'heap>) {
        visit::walk_input(self, input);

        let inferred = self.inferred_type(self.current);
        self.types.insert_unique(self.current, inferred);

        if let Some(default) = &input.default {
            self.verify_subtype(self.types[&default.id], inferred);
        }

        // Register the input type
        match self.inputs.entry(input.name.value) {
            Entry::Occupied(mut occupied) => {
                // In case that the input already exists, we need to find the greatest lower bound
                // (GLB), in case that we have: `input(a, Integer)` and `input(a, Number)`. The only
                // acceptable input for `a` is logically `Integer`, as it is both a `Number` and a
                // `Integer`.
                let existing_id = *occupied.get();
                let new_id = self.lattice.meet(existing_id, inferred);
                occupied.insert(new_id);
            }
            Entry::Vacant(vacant) => {
                vacant.insert(inferred);
            }
        }
    }

    fn visit_type_assertion(&mut self, assertion: &'heap TypeAssertion<'heap>) {
        visit::walk_type_assertion(self, assertion);

        let inferred = self.inferred_type(self.current);
        self.types.insert_unique(self.current, inferred);

        // We do not need to check if the type is actually the correct one
        if assertion.force {
            return;
        }

        let simplified_assertion = self.simplified_type(assertion.r#type);

        // value <: assertion
        self.verify_subtype(self.types[&assertion.value.id], simplified_assertion);
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        visit::walk_type_constructor(self, constructor);

        self.transfer_type(self.current);
    }

    fn visit_binary_operation(&mut self, _: &'heap BinaryOperation<'heap>) {
        unreachable!("binary operations shouldn't be present yet");
    }

    fn visit_unary_operation(&mut self, _: &'heap UnaryOperation<'heap>) {
        unreachable!("access operations shouldn't be present yet");
    }

    fn visit_field_access(&mut self, access: &'heap FieldAccess<'heap>) {
        visit::walk_field_access(self, access);

        self.transfer_type(self.current);
    }

    fn visit_index_access(&mut self, access: &'heap IndexAccess<'heap>) {
        visit::walk_index_access(self, access);

        self.transfer_type(self.current);
    }

    fn visit_call(&mut self, call: &'heap Call<'heap>) {
        visit::walk_call(self, call);

        let returns_id = self.inferred_type(self.current);

        let builder = TypeBuilder::spanned(call.span, self.env);
        let closure = builder.closure(
            call.arguments
                .iter()
                .map(|argument| self.types[&argument.value.id]),
            returns_id,
        );

        // At a call-site we must prove `F <: C`, where
        // - F is the declared type of the callee, and
        // - C is the closure type we synthesise from the actual arguments: `(T₁, …, Tₙ) -> ρ` with
        //   `ρ` being a fresh hole for the return value.
        //
        // Passing `F` as the *subtype* (left) and `C` as the *supertype* (right)
        // produces the desired constraints:
        // - contravariant parameters: `Tᵢ <: Pᵢ`
        // - covariant return value: `R <: ρ`
        //
        // For closure literals we invert the direction and collect `C <: F`
        self.verify_subtype(self.types[&call.function.id], closure);

        self.types.insert_unique(self.current, returns_id);
    }

    fn visit_if(&mut self, r#if: &'heap If<'heap>) {
        visit::walk_if(self, r#if);

        // the test expression must evaluate to a boolean
        let is_test_boolean = self.is_subtype(
            self.types[&r#if.test.id],
            self.env.intern_type(PartialType {
                span: r#if.test.span,
                kind: self
                    .env
                    .intern_kind(TypeKind::Primitive(PrimitiveType::Boolean)),
            }),
        );
        if !is_test_boolean {
            self.diagnostics.push(type_mismatch_if(
                self.env,
                self.env.r#type(self.types[&r#if.test.id]),
            ));
        }

        self.transfer_type(self.current);
    }

    fn visit_closure(&mut self, closure: &'heap Closure<'heap>) {
        visit::walk_closure(self, closure);

        let inferred = self.inferred_type(self.current);

        // `body <: return`
        // We need to compare with the actual signature, not the inferred type, as we use the actual
        // signature in conjunction with skolem variables to ensure type safety at the invocation
        // site. The inferred type is an instantiated version that is separate from the actual
        // signature, with the actual signature being used to typecheck the closure body. The
        // inferred type might've been used as a call site and therefore have different variable
        // constraints associated with it, unrelated to the function body.
        let closure_type = closure.signature.type_signature(&self.lattice);
        let returns = self.simplify.simplify(closure_type.returns);
        self.verify_subtype(self.types[&closure.body.id], returns);

        self.types.insert_unique(self.current, inferred);
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unreachable!("graph operations shouldn't be present yet");
    }
}
