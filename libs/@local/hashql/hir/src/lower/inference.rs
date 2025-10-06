use hashql_core::{
    collection::{FastHashMap, FastHashSet, HashMapExt as _},
    intern::Interned,
    literal::LiteralKind,
    module::{
        Universe,
        item::{IntrinsicItem, IntrinsicValueItem, ItemKind},
        locals::TypeDef,
    },
    span::{SpanId, Spanned},
    r#type::{
        PartialType, TypeBuilder, TypeId,
        environment::{
            Environment, InferenceEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        inference::{Constraint, InferenceSolver, VariableCollector},
        kind::{
            PrimitiveType, TypeKind, UnionType,
            generic::{GenericArgumentReference, GenericSubstitution},
        },
        visit::Visitor as _,
    },
};

use super::error::{LoweringDiagnosticCategory, LoweringDiagnosticIssues};
use crate::{
    context::HirContext,
    node::{
        HirId, Node,
        access::{field::FieldAccess, index::IndexAccess},
        branch::r#if::If,
        call::Call,
        closure::Closure,
        data::{Dict, List, Literal, Struct, Tuple},
        graph::Graph,
        input::Input,
        r#let::{Binding, Let, VarId},
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
    pub locals: FastHashMap<VarId, Local<'heap>>,
    pub intrinsics: FastHashMap<HirId, &'static str>,
    pub types: FastHashMap<HirId, TypeId>,
}

pub struct TypeInference<'env, 'heap> {
    env: &'env Environment<'heap>,
    context: &'env HirContext<'env, 'heap>,

    inference: InferenceEnvironment<'env, 'heap>,
    collector: VariableCollector<'env, 'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    current: HirId,

    visited: FastHashSet<HirId>,
    locals: FastHashMap<VarId, Local<'heap>>,
    types: FastHashMap<HirId, TypeId>,
    arguments: FastHashMap<HirId, Interned<'heap, [GenericArgumentReference<'heap>]>>,
    intrinsics: FastHashMap<HirId, &'static str>,
}

impl<'env, 'heap> TypeInference<'env, 'heap> {
    pub fn new(env: &'env Environment<'heap>, context: &'env HirContext<'env, 'heap>) -> Self {
        Self {
            env,
            context,

            inference: InferenceEnvironment::new(env),
            collector: VariableCollector::new(env),
            instantiate: InstantiateEnvironment::new(env),

            current: HirId::PLACEHOLDER,

            visited: FastHashSet::default(),
            locals: FastHashMap::default(),
            types: FastHashMap::default(),
            arguments: FastHashMap::default(),
            intrinsics: FastHashMap::default(),
        }
    }

    fn apply_substitution(
        &mut self,
        span: SpanId,
        def: TypeDef<'heap>,
        arguments: &[Spanned<TypeId>],
    ) -> TypeId {
        // We extract only the partial type to access its kind, avoiding the overhead of
        // retrieving the full type data when we only need the kind for re-spanning.
        let kind = self.env.r#types.index_partial(def.id).kind;
        let base = self.env.intern_type(PartialType { span, kind }); // re-span the value

        if arguments.is_empty() {
            return base;
        }

        let builder = TypeBuilder::spanned(span, self.env);

        // Argument count validation is deferred to the type checking pass.
        let substitutions = def.arguments.iter().zip(arguments.iter()).map(
            |(&GenericArgumentReference { id: argument, .. }, &Spanned { value, .. })| {
                GenericSubstitution { argument, value }
            },
        );

        let type_id = builder.apply(substitutions, base);
        self.collector.visit_id(type_id);

        type_id
    }

    pub fn finish(
        mut self,
    ) -> (
        InferenceSolver<'env, 'heap>,
        TypeInferenceResidual<'heap>,
        LoweringDiagnosticIssues,
    ) {
        let variables = self.collector.take_variables();
        self.inference.add_variables(variables);

        let diagnostics = self
            .instantiate
            .take_diagnostics()
            .map_category(LoweringDiagnosticCategory::TypeChecking);
        let solver = self.inference.into_solver();

        let residual = TypeInferenceResidual {
            locals: self.locals,
            intrinsics: self.intrinsics,
            types: self.types,
        };

        (solver, residual, diagnostics)
    }
}

impl<'heap> Visitor<'heap> for TypeInference<'_, 'heap> {
    fn visit_type_id(&mut self, id: TypeId) {
        self.collector.visit_id(id);
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

        let builder = TypeBuilder::spanned(literal.span, self.env);
        let id = match literal.kind {
            LiteralKind::Null => builder.null(),
            LiteralKind::Boolean(_) => builder.boolean(),
            LiteralKind::Float(_) => builder.number(),
            LiteralKind::Integer(_) => builder.integer(),
            LiteralKind::String(_) => builder.string(),
        };

        self.types.insert_unique(self.current, id);
    }

    fn visit_tuple(&mut self, tuple: &'heap Tuple<'heap>) {
        visit::walk_tuple(self, tuple);

        let builder = TypeBuilder::spanned(tuple.span, self.env);
        let id = builder.tuple(tuple.fields.iter().map(|field| self.types[&field.id]));

        self.types.insert_unique(self.current, id);
    }

    fn visit_struct(&mut self, r#struct: &'heap Struct<'heap>) {
        visit::walk_struct(self, r#struct);

        let builder = TypeBuilder::spanned(r#struct.span, self.env);
        let id = builder.r#struct(
            r#struct
                .fields
                .iter()
                .map(|field| (field.name.value, self.types[&field.value.id])),
        );

        self.types.insert_unique(self.current, id);
    }

    fn visit_list(&mut self, list: &'heap List<'heap>) {
        visit::walk_list(self, list);

        // List is covariant over the elements. There are two ways to handle this:
        // 1. Create a union of all the element types
        // 2. Create a hole and then fill in lower bound obligations for it
        // Internally both will result in the same type, but the implementation details differ.
        // Choosing the second option allows for more accuracy in type inference in edge cases.
        // In particular it helps us to choose a type for empty lists.
        let inner = self.inference.fresh_hole(list.span);
        self.inference.add_variables([inner]);

        for element in list.elements {
            self.inference.add_constraint(Constraint::LowerBound {
                variable: inner,
                bound: self.types[&element.id],
            });
        }

        let builder = TypeBuilder::spanned(list.span, self.env);
        let id = builder.list(inner.into_type(self.env).id);
        self.types.insert_unique(self.current, id);
    }

    fn visit_dict(&mut self, dict: &'heap Dict<'heap>) {
        visit::walk_dict(self, dict);

        // Dicts are invariant over their key and covariant over their value.
        let key = self.inference.fresh_hole(dict.span);
        let value = self.inference.fresh_hole(dict.span);
        self.inference.add_variables([key, value]);

        for field in dict.fields {
            self.inference.add_constraint(Constraint::Equals {
                variable: key,
                r#type: self.types[&field.key.id],
            });

            self.inference.add_constraint(Constraint::LowerBound {
                variable: value,
                bound: self.types[&field.value.id],
            });
        }

        let builder = TypeBuilder::spanned(dict.span, self.env);
        let id = builder.dict(key.into_type(self.env).id, value.into_type(self.env).id);
        self.types.insert_unique(self.current, id);
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        visit::walk_local_variable(self, variable);

        let Local {
            r#type: mut def,
            intrinsic,
        } = self.locals[&variable.id.value];
        // We must instantiate fresh generics for this type reference to preserve polymorphism.
        // Reusing the same generic variables would cause all instantiations to converge,
        // breaking polymorphic behavior.
        def.instantiate(&mut self.instantiate);

        let r#type = self.apply_substitution(variable.span, def, &variable.arguments);

        self.types.insert_unique(self.current, r#type);

        if let Some(intrinsic) = intrinsic {
            self.intrinsics.insert_unique(self.current, intrinsic);
        }
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

        self.types.insert_unique(self.current, r#type);
        self.arguments.insert_unique(self.current, def.arguments);
        self.intrinsics.insert_unique(self.current, intrinsic);
    }

    fn visit_binding(&mut self, binding: &'heap Binding<'heap>) {
        visit::walk_binding(self, binding);
        let Binding { binder, value } = binding;

        // We simply take the type of the value
        let value_type = self.types[&value.id];

        let arguments = self
            .arguments
            .get(&value.id)
            .copied()
            .unwrap_or_else(|| self.env.intern_generic_argument_references(&[]));

        // We do not propagate the arguments to the let binding node itself, because the let
        // expression evaluates to its body, not the binding. Propagating arguments would
        // incorrectly suggest that the let binding itself accepts arguments, when in reality
        // the let expression simply binds a value to a name and then evaluates the body.
        // The arguments properly belong to the value being bound, not the binding construct.

        let intrinsic = self.intrinsics.get(&value.id).copied();

        // We only preserve arguments for known value types. After alias replacement, only
        // closures retain meaningful arguments. Other types have ambiguous argument semantics,
        // so we don't support arguments for them.
        self.locals.insert_unique(
            binder.id,
            Local {
                r#type: TypeDef {
                    id: value_type,
                    arguments,
                },
                intrinsic,
            },
        );
    }

    fn visit_let(&mut self, r#let: &'heap Let<'heap>) {
        // No additional type constraints are generated here since we directly adopt
        // the body's type without transformation.
        visit::walk_let(self, r#let);
        let Let {
            span: _,
            bindings: _,
            body,
        } = r#let;

        // Note: We intentionally leave locals in scope after visiting the body to avoid
        // requiring an additional traversal for collection during the type checking phase.

        // The let expression's type is determined by its body, not the bound value
        self.types.insert_unique(self.current, self.types[&body.id]);
    }

    fn visit_input(&mut self, input: &'heap Input<'heap>) {
        visit::walk_input(self, input);

        // We simply take on the type of the input.
        self.types.insert_unique(self.current, input.r#type);

        // If a default exists, we additionally need to discharge a constraint that the default is
        // `<:` to the type specified.
        if let Some(default) = &input.default {
            self.inference.collect_constraints(
                Variance::Covariant,
                self.types[&default.id],
                input.r#type,
            );
        }
    }

    fn visit_type_assertion(&mut self, assertion: &'heap TypeAssertion<'heap>) {
        visit::walk_type_assertion(self, assertion);

        self.types.insert_unique(self.current, assertion.r#type);

        // The type is the one provided, but only if it's force, otherwise we have a `<:`, meaning
        // that the type assertion must be narrower than the provided type.
        if assertion.force {
            return;
        }

        // value <: assertion
        self.inference.collect_constraints(
            Variance::Covariant,
            self.types[&assertion.value.id],
            assertion.r#type,
        );
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        // There are no additional constraints that can be discharged here, as we just reference the
        // closure given.
        visit::walk_type_constructor(self, constructor);

        self.types.insert_unique(self.current, constructor.closure);
        self.arguments
            .insert_unique(self.current, constructor.arguments);
    }

    fn visit_binary_operation(&mut self, _: &'heap BinaryOperation<'heap>) {
        unreachable!("binary operations shouldn't be present yet");
    }

    fn visit_unary_operation(&mut self, _: &'heap UnaryOperation<'heap>) {
        unreachable!("access operations shouldn't be present yet");
    }

    fn visit_field_access(&mut self, access: &'heap FieldAccess<'heap>) {
        visit::walk_field_access(self, access);

        let variable =
            self.inference
                .add_projection(access.span, self.types[&access.expr.id], access.field);

        self.types
            .insert_unique(self.current, variable.into_type(self.env).id);
    }

    fn visit_index_access(&mut self, access: &'heap IndexAccess<'heap>) {
        visit::walk_index_access(self, access);

        let variable = self.inference.add_subscript(
            access.span,
            self.types[&access.expr.id],
            self.types[&access.index.id],
        );

        self.types
            .insert_unique(self.current, variable.into_type(self.env).id);
    }

    fn visit_call(&mut self, call: &'heap Call<'heap>) {
        visit::walk_call(self, call);

        // Make sure that we use a *fresh* instance every invocation
        // `visit_*_variable` ensure that the function is always fresh as can be
        let function = self.types[&call.function.id];

        // Create a new hole for the return type, this will be the return type of this function
        let returns = self.inference.fresh_hole(call.span);
        let returns_id = returns.into_type(self.env).id;

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
        self.inference
            .collect_constraints(Variance::Covariant, function, closure);

        self.types.insert_unique(self.current, returns_id);

        // We do not need to collect the closure generated, as we can always re-generate it easily
        // from the types provided when we do the type-check.
    }

    fn visit_if(&mut self, r#if: &'heap If<'heap>) {
        visit::walk_if(self, r#if);

        let test = self.types[&r#if.test.id];
        let then = self.types[&r#if.then.id];
        let r#else = self.types[&r#if.r#else.id];

        // The output is the union of the then and else branches
        let output = self.env.intern_type(PartialType {
            span: r#if.span,
            kind: self.env.intern_kind(TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&[then, r#else]),
            })),
        });

        self.types.insert_unique(self.current, output);

        let test_expected = self.env.intern_type(PartialType {
            span: r#if.test.span,
            kind: self
                .env
                .intern_kind(TypeKind::Primitive(PrimitiveType::Boolean)),
        });

        // test <: Boolean
        self.inference
            .collect_constraints(Variance::Covariant, test, test_expected);
    }

    fn visit_closure(
        &mut self,
        Closure {
            span,
            signature,
            body,
        }: &'heap Closure<'heap>,
    ) {
        // We skip instantiation for closure parameters to ensure they remain valid
        // for local binding within the closure scope.
        self.visit_span(*span);
        self.visit_closure_signature(signature);

        // Mark closure arguments as unscoped to prevent them from being affected by instantiation.
        // This preserves variable identity within the closure - if instantiation modified them,
        // each reference would become distinct, breaking type inference.
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
                param.name.id,
                Local {
                    r#type: TypeDef {
                        id: type_id,
                        arguments: self.env.intern_generic_argument_references(&[]),
                    },
                    intrinsic: None,
                },
            );
        }

        // The parameter types inferred here may not be valid in the broader type checking
        // context, which is why type checking is performed as a separate phase.
        self.visit_node(body);

        // Note: Locals remain in scope for use during the subsequent type checking phase.

        // `body <: return`
        self.inference.collect_constraints(
            Variance::Covariant,
            self.types[&body.id],
            type_signature.returns,
        );

        self.instantiate.exit_unscoped(old_unscoped);

        // Create a completely separate instantiation of the closure's definition to decouple any
        // inference steps of the body from the closure's definition.
        let mut def = signature.def;
        def.instantiate(&mut self.instantiate);

        self.types.insert(self.current, def.id);
        self.arguments.insert(self.current, def.arguments);
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unreachable!("graph operations shouldn't be present yet");
    }
}
