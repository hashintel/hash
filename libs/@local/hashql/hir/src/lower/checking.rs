use core::fmt::Display;

use hashql_core::{
    collection::{FastHashMap, FastHashSet},
    module::{
        ModuleRegistry, Universe,
        item::{IntrinsicItem, IntrinsicValueItem, ItemKind},
        locals::TypeDef,
        universe::{Entry, FastRealmsMap},
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        TypeBuilder, TypeId,
        environment::{AnalysisEnvironment, Environment, LatticeEnvironment, SimplifyEnvironment},
        kind::generic::GenericArgumentReference,
    },
};

use super::error::LoweringDiagnostic;
use crate::{
    lower::error::generic_argument_mismatch,
    node::{
        HirId, Node,
        access::{field::FieldAccess, index::IndexAccess},
        branch::Branch,
        call::Call,
        closure::{Closure, extract_signature},
        data::{Data, Literal},
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

pub struct TypeChecking<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    locals: FastHashMap<Symbol<'heap>, TypeDef<'heap>>,
    inference: FastHashMap<HirId, TypeId>,

    lattice: LatticeEnvironment<'env, 'heap>,
    analysis: AnalysisEnvironment<'env, 'heap>,
    simplify: SimplifyEnvironment<'env, 'heap>,

    current: HirId,
    visited: FastHashSet<HirId>,
    diagnostics: Vec<LoweringDiagnostic>,

    types: FastRealmsMap<HirId, TypeId>,
    inputs: FastRealmsMap<Symbol<'heap>, TypeId>,
    simplified: FastHashMap<TypeId, TypeId>,
}

impl<'env, 'heap> TypeChecking<'env, 'heap> {
    pub fn new(
        env: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,

        locals: FastHashMap<Symbol<'heap>, TypeDef<'heap>>,
        types: FastHashMap<HirId, TypeId>,
    ) -> Self {
        let inference = types;

        Self {
            env,
            registry,

            locals,
            inference,

            lattice: LatticeEnvironment::new(env),
            analysis: AnalysisEnvironment::new(env),
            simplify: SimplifyEnvironment::new(env),

            current: HirId::PLACEHOLDER,
            visited: FastHashSet::default(),
            diagnostics: Vec::new(),

            types: FastRealmsMap::new(),
            inputs: FastRealmsMap::new(),
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

        self.types.insert_unique(Universe::Value, id, inferred);
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
            node_span,
            variable_span,
            variable_name,
            parameters,
            arguments,
        ));
    }

    fn verify_subtype(&mut self, subtype: TypeId, supertype: TypeId) {
        let fatal = self.analysis.fatal_diagnostics();

        // We're not directly interested in the result, as we initialize the analysis environment
        // with diagnostics, in that case, if verification fails we'll have a diagnostic telling us
        // why. We just use the return type to ensure that said diagnostics have been emitted and we
        // don't silently swallow an error.
        let compatible = self.analysis.is_subtype_of(subtype, supertype);

        if !compatible {
            debug_assert_ne!(
                fatal,
                self.analysis.fatal_diagnostics(),
                "subtype verification should've contributed to the amount of fatal diagnostics"
            );
        }
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

    fn visit_data(&mut self, data: &'heap Data<'heap>) {
        visit::walk_data(self, data);
    }

    fn visit_literal(&mut self, literal: &'heap Literal<'heap>) {
        visit::walk_literal(self, literal);
        self.transfer_type(self.current);
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        let generic_arguments = self.locals[&variable.name.value].arguments;
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

        // We simply take the type of the value
        let value_id = self.types[Universe::Value][&value.id];
        self.types
            .insert_unique(Universe::Value, self.current, value_id);

        self.visit_node(body);
    }

    fn visit_input(&mut self, input: &'heap Input<'heap>) {
        visit::walk_input(self, input);

        let inferred = self.inferred_type(self.current);
        self.types
            .insert_unique(Universe::Value, self.current, inferred);

        if let Some(default) = &input.default {
            self.verify_subtype(self.types[Universe::Value][&default.id], inferred);
        }

        // Register the input type
        match self.inputs.entry(Universe::Value, input.name.value) {
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
        self.types
            .insert_unique(Universe::Value, self.current, inferred);

        // We do not need to check if the type is actually the correct one
        if assertion.force {
            return;
        }

        let simplified_assertion = self.simplified_type(assertion.r#type);

        // value <: assertion
        self.verify_subtype(
            self.types[Universe::Value][&assertion.value.id],
            simplified_assertion,
        );
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
                .map(|argument| self.types[Universe::Value][&argument.value.id]),
            returns_id,
        );

        self.verify_subtype(closure, self.types[Universe::Value][&call.function.id]);

        self.types
            .insert_unique(Universe::Value, self.current, returns_id);
    }

    fn visit_branch(&mut self, _: &'heap Branch<'heap>) {
        unimplemented!()
    }

    fn visit_closure(&mut self, closure: &'heap Closure<'heap>) {
        visit::walk_closure(self, closure);

        let inferred = self.inferred_type(self.current);

        // `body <: return`
        let closure_type = extract_signature(inferred, self.env);
        self.verify_subtype(
            self.types[Universe::Value][&closure.body.id],
            closure_type.returns,
        );

        self.types
            .insert_unique(Universe::Value, self.current, inferred);
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unreachable!("graph operations shouldn't be present yet");
    }
}
