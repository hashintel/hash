use hashql_core::{
    collection::{FastHashMap, FastHashSet},
    intern::Interned,
    literal::LiteralKind,
    module::{
        ModuleRegistry, Universe,
        item::{IntrinsicItem, IntrinsicValueItem, ItemKind},
        locals::TypeDef,
        universe::FastRealmsMap,
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        PartialType, TypeBuilder, TypeId,
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
        closure::Closure,
        data::Literal,
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Local<'heap> {
    pub r#type: TypeDef<'heap>,
    pub intrinsic: Option<&'static str>,
}

pub struct TypeInferenceResidual<'heap> {
    pub locals: FastHashMap<Symbol<'heap>, Local<'heap>>,
    pub intrinsics: FastHashMap<HirId, &'static str>,
    pub types: FastHashMap<HirId, TypeId>,
}

pub struct TypeInference<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    inference: InferenceEnvironment<'env, 'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    current: HirId,

    visited: FastHashSet<HirId>,
    locals: FastRealmsMap<Symbol<'heap>, Local<'heap>>,
    types: FastRealmsMap<HirId, TypeId>,
    arguments: FastRealmsMap<HirId, Interned<'heap, [GenericArgumentReference<'heap>]>>,
    intrinsics: FastRealmsMap<HirId, &'static str>,
}

impl<'env, 'heap> TypeInference<'env, 'heap> {
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
            arguments: FastRealmsMap::new(),
            intrinsics: FastRealmsMap::new(),
        }
    }

    fn apply_substitution(
        &self,
        span: SpanId,
        def: TypeDef<'heap>,
        arguments: &[Spanned<TypeId>],
    ) -> TypeId {
        // We're taking the partial here, instead of the full type, as we just need access to
        // the interned kind.
        let kind = self.env.r#types.index_partial(def.id).kind;
        let base = self.env.intern_type(PartialType { span, kind }); // re-span the value

        if arguments.is_empty() {
            return base;
        }

        let builder = TypeBuilder::spanned(span, self.env);

        // We do not check if the amount of arguments matches the amount of generic arguments, as
        // this will be done in the type checking pass later.
        let substitutions = def.arguments.iter().zip(arguments.iter()).map(
            |(&GenericArgumentReference { id: argument, .. }, &Spanned { value, .. })| {
                GenericSubstitution { argument, value }
            },
        );

        builder.apply(substitutions, base)
    }

    #[must_use]
    pub fn finish(
        mut self,
    ) -> (
        InferenceSolver<'env, 'heap>,
        TypeInferenceResidual<'heap>,
        Vec<TypeCheckDiagnostic>,
    ) {
        let diagnostics = self.instantiate.take_diagnostics().into_vec();
        let solver = self.inference.into_solver();

        let locals = core::mem::take(&mut self.locals[Universe::Value]);
        let types = core::mem::take(&mut self.types[Universe::Value]);
        let intrinsics = core::mem::take(&mut self.intrinsics[Universe::Value]);

        let residual = TypeInferenceResidual {
            locals,
            intrinsics,
            types,
        };

        (solver, residual, diagnostics)
    }
}

impl<'heap> Visitor<'heap> for TypeInference<'_, 'heap> {
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

        let Local {
            r#type: mut def,
            intrinsic,
        } = self.locals[Universe::Value][&variable.name.value];
        // The generics of this type (not the type itself) is completely separate from the
        // referenced type, otherwise any generic variable in the instantiation would converge to
        // the same, which would defeat polymorphism.
        def.instantiate(&mut self.instantiate);

        let r#type = self.apply_substitution(variable.span, def, &variable.arguments);

        self.types
            .insert_unique(Universe::Value, self.current, r#type);

        if let Some(intrinsic) = intrinsic {
            self.intrinsics
                .insert_unique(Universe::Value, self.current, intrinsic);
        }
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

        let (intrinsic, mut def) = match item.kind {
            ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem { name, r#type })) => {
                (name, r#type)
            }
            ItemKind::Constructor(_) => {
                unreachable!("constructors should've been specialized prior to this point");
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
        self.arguments
            .insert_unique(Universe::Value, self.current, def.arguments);
        self.intrinsics
            .insert_unique(Universe::Value, self.current, intrinsic);
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
        let value_type = self.types[Universe::Value][&value.id];

        let arguments = self
            .arguments
            .get(Universe::Value, &value.id)
            .copied()
            .unwrap_or_else(|| self.env.intern_generic_argument_references(&[]));

        // We do not propagate the arguments to the let binding node itself, because the let
        // expression evaluates to its body, not the binding. Propagating arguments would
        // incorrectly suggest that the let binding itself accepts arguments, when in reality
        // the let expression simply binds a value to a name and then evaluates the body.
        // The arguments properly belong to the value being bound, not the binding construct.

        let intrinsic = self.intrinsics.get(Universe::Value, &value.id).copied();

        // We only take over the arguments of values we know, the only ones that are left after
        // alias-replacement that are of note are closures. Due to the ambiguity, we do not support
        // arguments for any other type.
        self.locals.insert_unique(
            Universe::Value,
            name.value,
            Local {
                r#type: TypeDef {
                    id: value_type,
                    arguments,
                },
                intrinsic,
            },
        );

        // There are no additional constraints that we can discharge here, because we simply take on
        // the type of the value.

        self.visit_node(body);

        // Note: We purposefully do *not* remove the local after we're done, this is so that we can
        // collect them afterwards for free, without an additional traversal.

        // The type of the let expression is not that of the value, but rather that of the body
        self.types.insert_unique(
            Universe::Value,
            self.current,
            self.types[Universe::Value][&body.id],
        );
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

        // value <: assertion
        self.inference.collect_constraints(
            self.types[Universe::Value][&assertion.value.id],
            assertion.r#type,
        );
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        // There are no additional constraints that can be discharged here, as we just reference the
        // closure given.
        visit::walk_type_constructor(self, constructor);

        self.types
            .insert_unique(Universe::Value, self.current, constructor.closure);
        self.arguments
            .insert_unique(Universe::Value, self.current, constructor.arguments);
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
        self.inference.collect_constraints(function, closure);

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
        let type_generic = signature.type_generic(self.env);

        // Collect generic argument constraints, so that they can aid during type inference.
        if let Some(generic) = type_generic {
            generic.collect_argument_constraints(*span, &mut self.inference, true);
        }

        // Enter the locals into the scope for the body, so that the types can participate in
        // inference
        for (param, &type_id) in signature.params.iter().zip(type_signature.params) {
            self.locals.insert_unique(
                Universe::Value,
                param.name.value,
                Local {
                    r#type: TypeDef {
                        id: type_id,
                        arguments: self.env.intern_generic_argument_references(&[]),
                    },
                    intrinsic: None,
                },
            );
        }

        // Note that the types produced here - the inferred types of the parameters - might be
        // invalid in the context of type checking, which is why it is a separate step.
        self.visit_node(body);

        // Note: We do not remove the locals again from scope, to allow us to use them in the type
        // checking phase.

        // `body <: return`
        self.inference.collect_constraints(
            self.types[Universe::Value][&body.id],
            type_signature.returns,
        );

        self.instantiate.exit_unscoped(old_unscoped);

        // Create a completely separate instantiation of the closure's definition to decouple any
        // inference steps of the body from the closure's definition.
        let mut def = signature.def;
        def.instantiate(&mut self.instantiate);

        self.types.insert(Universe::Value, self.current, def.id);
        self.arguments
            .insert(Universe::Value, self.current, def.arguments);
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unreachable!("graph operations shouldn't be present yet");
    }
}
