use hashql_core::{
    collection::{FastHashMap, FastHashSet},
    literal::LiteralKind,
    module::{
        ModuleRegistry, Universe,
        item::{ConstructorItem, IntrinsicItem, IntrinsicValueItem, ItemKind},
        locals::TypeDef,
        universe::FastRealmsMap,
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, InferenceEnvironment, instantiate::InstantiateEnvironment},
        error::TypeCheckDiagnostic,
        inference::InferenceSolver,
        kind::generic::{GenericArgumentReference, GenericSubstitution},
    },
};

use crate::{
    node::{
        HirId, Node,
        access::{field::FieldAccess, index::IndexAccess},
        branch::Branch,
        call::Call,
        closure::{Closure, ClosureSignature},
        data::Literal,
        graph::Graph,
        input::Input,
        kind::NodeKind,
        r#let::Let,
        operation::{
            BinaryOperation, UnaryOperation,
            r#type::{TypeAssertion, TypeConstructor},
        },
        variable::{LocalVariable, QualifiedVariable},
    },
    visit::{self, Visitor},
};

pub struct Inference<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    #[expect(clippy::struct_field_names)]
    inference: InferenceEnvironment<'env, 'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    current: HirId,

    visited: FastHashSet<HirId>,
    locals: FastRealmsMap<Symbol<'heap>, TypeDef<'heap>>,
    types: FastRealmsMap<HirId, TypeId>,
    variables: FastRealmsMap<HirId, hashql_core::r#type::inference::Variable>,
}

impl<'env, 'heap> Inference<'env, 'heap> {
    pub fn new(env: &'env Environment<'heap>, registry: &'env ModuleRegistry<'heap>) -> Self {
        Self {
            env,
            registry,

            inference: InferenceEnvironment::new(env),
            instantiate: InstantiateEnvironment::new(env),

            current: HirId::PLACEHOLDER,

            visited: FastHashSet::default(),
            locals: FastRealmsMap::new(),
            types: FastRealmsMap::new(),
            variables: FastRealmsMap::new(),
        }
    }

    fn apply_substitution(
        &self,
        span: SpanId,
        def: TypeDef<'heap>,
        arguments: &[Spanned<TypeId>],
    ) -> TypeId {
        if arguments.is_empty() {
            return def.id;
        }

        let builder = TypeBuilder::spanned(span, self.env);

        // We do not check if the amount of arguments matches the amount of generic arguments, as
        // this will be done in the type checking pass later.
        let substitutions = def.arguments.iter().zip(arguments.iter()).map(
            |(&GenericArgumentReference { id: argument, .. }, &Spanned { value, .. })| {
                GenericSubstitution { argument, value }
            },
        );

        builder.apply(substitutions, def.id)
    }

    #[must_use]
    pub fn types(&self) -> &FastHashMap<HirId, TypeId> {
        &self.types[Universe::Value]
    }

    #[must_use]
    pub fn finish(mut self) -> (InferenceSolver<'env, 'heap>, Vec<TypeCheckDiagnostic>) {
        let diagnostics = self.instantiate.take_diagnostics().into_vec();
        let solver = self.inference.into_solver();

        (solver, diagnostics)
    }
}

impl<'heap> Visitor<'heap> for Inference<'_, 'heap> {
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

        let builder = TypeBuilder::spanned(literal.span, self.env);
        let id = match literal.kind {
            LiteralKind::Null => builder.null(),
            LiteralKind::Boolean(_) => builder.boolean(),
            LiteralKind::Float(_) => builder.number(),
            LiteralKind::Integer(_) => builder.integer(),
            LiteralKind::String(_) => builder.string(),
        };

        self.types.insert_unique(Universe::Value, self.current, id);
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        let mut def = self.locals[Universe::Value][&variable.name.value];
        // The generics of this type (not the type itself) is completely separate from the
        // referenced type, otherwise any generic variable in the instantiation would converge to
        // the same, which would defeat polymorphism.
        def.instantiate(&mut self.instantiate);

        let r#type = self.apply_substitution(variable.span, def, &variable.arguments);

        self.types
            .insert_unique(Universe::Value, self.current, r#type);
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

        let mut def = match item.kind {
            ItemKind::Constructor(ConstructorItem { r#type }) => r#type,
            ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem { name: _, r#type })) => {
                r#type
            }
            ItemKind::Module(_)
            | ItemKind::Type(_)
            | ItemKind::Intrinsic(IntrinsicItem::Type(_)) => {
                unreachable!("resolver should never resolve to anything other than a value");
            }
        };
        def.instantiate(&mut self.instantiate);

        let r#type = self.apply_substitution(variable.span, def, &variable.arguments);

        self.types
            .insert_unique(Universe::Value, self.current, r#type);
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

        let arguments = if let &NodeKind::Closure(Closure {
            signature:
                ClosureSignature {
                    def: TypeDef { arguments, .. },
                    ..
                },
            ..
        }) = value.kind
        {
            arguments
        } else {
            self.env.intern_generic_argument_references(&[])
        };

        // We only take over the arguments of values we know, the only ones that are left after
        // alias-replacement that are of note are closures. Due to the ambiguity, we do not support
        // arguments for any other type.
        self.locals.insert_unique(
            Universe::Value,
            name.value,
            TypeDef {
                id: value_id,
                arguments,
            },
        );

        // There are no additional constraints that we can discharge here, because we simply take on
        // the type of the value.

        self.visit_node(body);

        // Note: We purposefully do *not* remove the local after we're done, this is so that we can
        // collect them afterwards for free, without an additional traversal.
    }

    fn visit_input(&mut self, input: &'heap Input<'heap>) {
        visit::walk_input(self, input);

        // We simply take on the type of the input.
        self.types
            .insert_unique(Universe::Value, self.current, input.r#type);

        // If a default exists, we additionally need to discharge a constraint that the default is
        // `<:` to the type specified.
        if let Some(default) = &input.default {
            self.inference
                .collect_constraints(self.types[Universe::Value][&default.id], input.r#type);
        }
    }

    fn visit_type_assertion(&mut self, assertion: &'heap TypeAssertion<'heap>) {
        visit::walk_type_assertion(self, assertion);

        self.types
            .insert_unique(Universe::Value, self.current, assertion.r#type);

        // The type is the one provided, but only if it's force, otherwise we have a `<:`, meaning
        // that the type assertion must be narrower than the provided type.
        if assertion.force {
            return;
        }

        // assertion <: value
        self.inference.collect_constraints(
            assertion.r#type,
            self.types[Universe::Value][&assertion.value.id],
        );
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        // There are no additional constraints that can be discharged here, as we just reference the
        // closure given.
        visit::walk_type_constructor(self, constructor);

        self.types
            .insert_unique(Universe::Value, self.current, constructor.closure);
    }

    fn visit_binary_operation(&mut self, _: &'heap BinaryOperation<'heap>) {
        unreachable!("binary operations shouldn't be present yet");
    }

    fn visit_unary_operation(&mut self, _: &'heap UnaryOperation<'heap>) {
        unreachable!("access operations shouldn't be present yet");
    }

    fn visit_field_access(&mut self, access: &'heap FieldAccess<'heap>) {
        visit::walk_field_access(self, access);

        let variable = self.inference.add_projection(
            access.span,
            self.types[Universe::Value][&access.expr.id],
            access.field,
        );

        self.variables
            .insert_unique(Universe::Value, self.current, variable);

        self.types.insert_unique(
            Universe::Value,
            self.current,
            variable.into_type(self.env).id,
        );
    }

    fn visit_index_access(&mut self, access: &'heap IndexAccess<'heap>) {
        visit::walk_index_access(self, access);

        let variable = self.inference.add_subscript(
            access.span,
            self.types[Universe::Value][&access.expr.id],
            self.types[Universe::Value][&access.index.id],
        );

        self.variables
            .insert_unique(Universe::Value, self.current, variable);

        self.types.insert_unique(
            Universe::Value,
            self.current,
            variable.into_type(self.env).id,
        );
    }

    fn visit_call(&mut self, call: &'heap Call<'heap>) {
        visit::walk_call(self, call);

        // Make sure that we use a *fresh* instance every invocation
        // `visit_*_variable` ensure that the function is always fresh as can be
        let function = self.types[Universe::Value][&call.function.id];

        // Create a new hole for the return type, this will be the return type of this function
        let returns = self.inference.fresh_hole(call.span);
        let returns_id = returns.into_type(self.env).id;

        let builder = TypeBuilder::spanned(call.span, self.env);
        let closure = builder.closure(
            call.arguments
                .iter()
                .map(|argument| self.types[Universe::Value][&argument.value.id]),
            returns_id,
        );

        self.inference.collect_constraints(closure, function);

        self.variables
            .insert_unique(Universe::Value, self.current, returns);
        self.types
            .insert_unique(Universe::Value, self.current, returns_id);
        // We do not need to collect the closure generated, as we can always re-generate it easily
        // from the types provided when we do the type-check.
    }

    fn visit_branch(&mut self, _: &'heap Branch<'heap>) {
        unimplemented!()
    }

    fn visit_closure(
        &mut self,
        Closure {
            span,
            signature,
            body,
        }: &'heap Closure<'heap>,
    ) {
        // We cannot instantiate these for the closure, because that'd mean that they'd be invalid
        // when trying to bind locals.
        self.visit_span(*span);
        self.visit_closure_signature(signature);

        // Mark the arguments used in the closure as being unscoped, this means that they won't be
        // affected by any instantiate call (as they refer to the same variable). Having them be
        // affected by instantiate calls would break inference, as any variable would be made
        // distinct.
        let old_unscoped = self
            .instantiate
            .enter_unscoped(signature.def.arguments.iter().map(|argument| argument.id));

        let type_signature = signature.type_signature(self.env);

        // Enter the locals into the scope for the body, so that the types can participate in
        // inference
        for (param, &type_id) in signature.params.iter().zip(type_signature.params) {
            self.locals.insert_unique(
                Universe::Value,
                param.name.value,
                TypeDef {
                    id: type_id,
                    arguments: self.env.intern_generic_argument_references(&[]),
                },
            );
        }

        self.visit_node(body);

        // Remove the locals again from scope
        for param in signature.params {
            self.locals.remove(Universe::Value, &param.name.value);
        }

        // `body <: return`
        self.inference.collect_constraints(
            self.types[Universe::Value][&body.id],
            type_signature.returns,
        );

        self.instantiate.exit_unscoped(old_unscoped);

        // We do not instantiate the type of the closure itself here, for the same reason as stated
        // above.
        self.types
            .insert(Universe::Value, self.current, signature.def.id);
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unimplemented!()
    }
}
