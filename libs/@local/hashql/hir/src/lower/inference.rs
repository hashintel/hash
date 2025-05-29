use core::any::Any;

use hashql_core::{
    collection::FastHashMap,
    literal::LiteralKind,
    module::{
        ModuleRegistry, Universe,
        item::{ConstructorItem, IntrinsicItem, IntrinsicValueItem, ItemKind},
        locals::TypeDef,
        universe::FastRealmsMap,
    },
    span::{SpanId, Spanned},
    symbol::{Ident, Symbol},
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, InferenceEnvironment, instantiate::InstantiateEnvironment},
        kind::generic::{GenericArgumentReference, GenericSubstitution},
    },
};

use crate::{
    node::{
        HirId, Node,
        access::{Access, field::FieldAccess, index::IndexAccess},
        branch::Branch,
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{Data, Literal},
        graph::Graph,
        input::Input,
        r#let::Let,
        operation::{
            BinaryOperation, Operation, TypeOperation, UnaryOperation,
            r#type::{TypeAssertion, TypeConstructor},
        },
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
    path::QualifiedPath,
    visit::{self, Visitor},
};

pub struct Inference<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    inference: InferenceEnvironment<'env, 'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    current: HirId,

    locals: FastRealmsMap<Symbol<'heap>, TypeDef<'heap>>,
    types: FastRealmsMap<HirId, TypeId>,
    variables: FastRealmsMap<HirId, hashql_core::r#type::inference::Variable>,
}

impl<'heap> Inference<'_, 'heap> {
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
}

impl<'heap> Visitor<'heap> for Inference<'_, 'heap> {
    fn visit_node(&mut self, node: &'heap Node<'heap>) {
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

    fn visit_variable(&mut self, variable: &'heap Variable<'heap>) {
        visit::walk_variable(self, variable);
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

        let Some(item) = self.registry.lookup(
            variable.path.0.iter().map(|ident| ident.value),
            Universe::Value,
        ) else {
            // This should be caught in the AST.
            panic!("either issue diagnostic or panic");
        };

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

        // There are no additional constraints that we can discharge here, because we simply take on
        // the type of the value.

        self.visit_node(body);
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

    fn visit_operation(&mut self, operation: &'heap Operation<'heap>) {
        visit::walk_operation(self, operation);
    }

    fn visit_type_operation(&mut self, operation: &'heap TypeOperation<'heap>) {
        visit::walk_type_operation(self, operation);
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

    fn visit_access(&mut self, access: &'heap Access<'heap>) {
        visit::walk_access(self, access);
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
    }

    fn visit_call_argument(&mut self, argument: &'heap CallArgument<'heap>) {
        visit::walk_call_argument(self, argument);
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
        self.visit_span(*span);
        self.visit_closure_signature(signature);

        // TODO: peel of the return type
        // `body <: return`

        // TODO: for the duration of the closure we need to also add the locals to the environment
        let returns = signature.returns(self.env);

        // TODO: alpha-renaming will error out here every time, because we don't have the generics
        // in scope. How can we solve this? The problem is that fundamentally we would need
        // to discharge on the whole body, but we're still collecting there.

        // TODO: take the return type of the signature, dispatch a `<:` to the return type and body
        // actually not a problem! The problem is with `lookup_scope` it might not be an error. Hmmm
        // idk.
        // The body has the variables in scope, and therefore also the variables, but those
        // variables shouldn't be instantiated, which is fine because we have the environment, but
        // means that any instantiate diagnostic is wrongfully emitted, even tho it shouldn't be.
        // We'd need something like a: `arguments_in_scope`

        self.visit_node(body);
    }

    fn visit_closure_signature(&mut self, signature: &'heap ClosureSignature<'heap>) {
        visit::walk_closure_signature(self, signature);
    }

    fn visit_closure_param(&mut self, param: &'heap ClosureParam<'heap>) {
        visit::walk_closure_param(self, param);
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unimplemented!()
    }
}
