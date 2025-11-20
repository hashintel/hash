use core::fmt::Display;

use hashql_core::{
    collections::{FastHashMap, FastHashSet},
    module::{
        Universe,
        item::{IntrinsicItem, IntrinsicValueItem, ItemKind},
        universe::Entry,
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        PartialType, TypeBuilder, TypeId, TypeIdMap,
        environment::{
            AnalysisEnvironment, Environment, LatticeEnvironment, SimplifyEnvironment, Variance,
        },
        error::TypeCheckDiagnosticIssues,
        kind::{PrimitiveType, TypeKind, generic::GenericArgumentReference},
    },
    value::Primitive,
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
    context::HirContext,
    lower::error::generic_argument_mismatch,
    node::{
        HirId, HirIdMap, HirIdSet, HirPtr, Node,
        access::{FieldAccess, IndexAccess},
        branch::If,
        call::Call,
        closure::{Closure, extract_signature},
        data::{Dict, List, Struct, Tuple},
        graph::Graph,
        r#let::{Let, VarIdMap},
        operation::{
            BinaryOperation, InputOp, InputOperation, TypeAssertion, TypeConstructor,
            UnaryOperation,
        },
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable},
    },
    visit::{self, Visitor},
};

pub struct TypeCheckingResidual<'heap> {
    pub inputs: FastHashMap<Symbol<'heap>, TypeId>,
    pub intrinsics: HirIdMap<&'static str>,
}

pub struct TypeChecking<'ctx, 'env, 'hir, 'heap> {
    env: &'env Environment<'heap>,
    context: &'ctx mut HirContext<'hir, 'heap>,

    locals: VarIdMap<Local<'heap>>,
    intrinsics: HirIdMap<&'static str>,
    closures: HirIdMap<TypeId>,

    lattice: LatticeEnvironment<'env, 'heap>,
    analysis: AnalysisEnvironment<'env, 'heap>,
    simplify: SimplifyEnvironment<'env, 'heap>,

    current: HirPtr,
    visited: HirIdSet,
    diagnostics: LoweringDiagnosticIssues,
    analysis_diagnostics: TypeCheckDiagnosticIssues,

    inputs: FastHashMap<Symbol<'heap>, TypeId>,
    simplified: TypeIdMap<TypeId>,
}

impl<'ctx, 'env, 'hir, 'heap> TypeChecking<'ctx, 'env, 'hir, 'heap> {
    pub fn new(
        env: &'env Environment<'heap>,
        context: &'ctx mut HirContext<'hir, 'heap>,

        TypeInferenceResidual {
            locals,
            intrinsics,
            closures,
        }: TypeInferenceResidual<'heap>,
    ) -> Self {
        let mut analysis = AnalysisEnvironment::new(env);
        analysis.with_diagnostics();

        Self {
            env,
            context,

            locals,
            intrinsics,
            closures,

            lattice: LatticeEnvironment::new(env),
            analysis,
            simplify: SimplifyEnvironment::new(env),

            current: HirPtr::PLACEHOLDER,
            visited: FastHashSet::default(),
            diagnostics: DiagnosticIssues::new(),
            analysis_diagnostics: DiagnosticIssues::new(),

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
        let type_id = self.context.map.type_id(id);

        self.simplified_type(type_id)
    }

    fn transfer_type(&mut self, id: HirId) {
        let inferred = self.inferred_type(id);

        self.context.map.insert_type_id(id, inferred);
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
            inputs: self.inputs,
            intrinsics: self.intrinsics,
        };

        self.diagnostics.into_status(residual)
    }
}

impl<'heap> Visitor<'heap> for TypeChecking<'_, '_, '_, 'heap> {
    fn visit_type_id(&mut self, id: TypeId) {
        self.simplified_type(id);
    }

    fn visit_node(&mut self, node: Node<'heap>) {
        if !self.visited.insert(node.id) {
            return;
        }

        let previous = self.current;
        self.current = node.ptr();

        visit::walk_node(self, node);

        self.current = previous;
    }

    fn visit_primitive(&mut self, _: &'heap Primitive<'heap>) {
        self.transfer_type(self.current.id);
    }

    fn visit_tuple(&mut self, tuple: &'heap Tuple<'heap>) {
        visit::walk_tuple(self, tuple);
        self.transfer_type(self.current.id);
    }

    fn visit_struct(&mut self, r#struct: &'heap Struct<'heap>) {
        visit::walk_struct(self, r#struct);
        self.transfer_type(self.current.id);
    }

    fn visit_list(&mut self, list: &'heap List<'heap>) {
        visit::walk_list(self, list);
        self.transfer_type(self.current.id);
    }

    fn visit_dict(&mut self, dict: &'heap Dict<'heap>) {
        visit::walk_dict(self, dict);
        self.transfer_type(self.current.id);
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        let generic_arguments = self.locals[&variable.id.value].r#type.arguments;
        self.verify_arity(
            self.current.span,
            variable.id.span,
            variable.name(&self.context.symbols),
            &generic_arguments,
            &variable.arguments,
        );

        self.transfer_type(self.current.id);
    }

    fn visit_qualified_variable(&mut self, variable: &'heap QualifiedVariable<'heap>) {
        visit::walk_qualified_variable(self, variable);

        let item = self
            .context
            .modules
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
            self.current.span,
            variable.path.0.last().expect("should be non-empty").span,
            variable.name(),
            &def.arguments,
            &variable.arguments,
        );

        self.transfer_type(self.current.id);
    }

    fn visit_let(&mut self, r#let: &'heap Let<'heap>) {
        visit::walk_let(self, r#let);
        let Let { bindings: _, body } = r#let;

        // We simply take the type of the body
        let body_id = self.context.map.type_id(body.id);
        self.context.map.insert_type_id(self.current.id, body_id);
    }

    fn visit_type_assertion(&mut self, assertion: &'heap TypeAssertion<'heap>) {
        visit::walk_type_assertion(self, assertion);

        let inferred = self.inferred_type(self.current.id);
        self.context.map.insert_type_id(self.current.id, inferred);

        // We do not need to check if the type is actually the correct one
        if assertion.force {
            return;
        }

        let simplified_assertion = self.simplified_type(assertion.r#type);

        // value <: assertion
        self.verify_subtype(
            self.context.map.type_id(assertion.value.id),
            simplified_assertion,
        );
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        visit::walk_type_constructor(self, constructor);

        self.transfer_type(self.current.id);
    }

    fn visit_binary_operation(&mut self, _: &'heap BinaryOperation<'heap>) {
        unreachable!("binary operations shouldn't be present yet");
    }

    fn visit_unary_operation(&mut self, _: &'heap UnaryOperation<'heap>) {
        unreachable!("access operations shouldn't be present yet");
    }

    fn visit_input_operation(&mut self, operation: &'heap InputOperation<'heap>) {
        self.transfer_type(self.current.id); // We just need to transfer the (simplified) type of the current input

        // Additionally we need to register the input (if it's a load instruction)
        if operation.op.value == InputOp::Exists {
            return; // nothing more that needs to be done
        }

        let inferred = self.context.map.type_id(self.current.id);

        match self.inputs.entry(operation.name.value) {
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

    fn visit_field_access(&mut self, access: &'heap FieldAccess<'heap>) {
        visit::walk_field_access(self, access);

        self.transfer_type(self.current.id);
    }

    fn visit_index_access(&mut self, access: &'heap IndexAccess<'heap>) {
        visit::walk_index_access(self, access);

        self.transfer_type(self.current.id);
    }

    fn visit_call(&mut self, call: &'heap Call<'heap>) {
        visit::walk_call(self, call);

        let returns_id = self.inferred_type(self.current.id);

        let builder = TypeBuilder::spanned(self.current.span, self.env);
        let closure = builder.closure(
            call.arguments
                .iter()
                .map(|argument| self.context.map.type_id(argument.value.id)),
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
        self.verify_subtype(self.context.map.type_id(call.function.id), closure);

        self.context.map.insert_type_id(self.current.id, returns_id);
    }

    fn visit_if(&mut self, r#if: &'heap If<'heap>) {
        visit::walk_if(self, r#if);

        // The test expression must evaluate to a boolean
        let is_test_boolean = self.is_subtype(
            self.context.map.type_id(r#if.test.id),
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
                self.env.r#type(self.context.map.type_id(r#if.test.id)),
            ));
        }

        self.transfer_type(self.current.id);
    }

    fn visit_closure(&mut self, closure: &'heap Closure<'heap>) {
        visit::walk_closure(self, closure);

        let inferred = self.inferred_type(self.current.id);

        // `body <: return`
        // We need to compare with the actual signature, not the inferred type, as we use the actual
        // signature in conjunction with skolem variables to ensure type safety at the invocation
        // site. The inferred type is an instantiated version that is separate from the actual
        // signature, with the actual signature being used to typecheck the closure body. The
        // inferred type might've been used as a call site and therefore have different variable
        // constraints associated with it, unrelated to the function body.
        let closure_type = extract_signature(self.closures[&self.current.id], &self.lattice);
        let returns = self.simplify.simplify(closure_type.returns);
        self.verify_subtype(self.context.map.type_id(closure.body.id), returns);

        self.context.map.insert_type_id(self.current.id, inferred);
        self.context.map.insert_monomorphized_type_id(
            self.current.id,
            self.simplify.simplify(self.closures[&self.current.id]),
        );
    }

    fn visit_thunk(&mut self, _: &'heap Thunk<'heap>) {
        unreachable!("thunk operations shouldn't be present yet");
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unreachable!("graph operations shouldn't be present yet");
    }
}
