use hashql_core::{
    collections::{FastHashMap, FastHashSet, HashMapExt as _},
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
    value::Primitive,
};

use super::error::{LoweringDiagnosticCategory, LoweringDiagnosticIssues};
use crate::{
    context::HirContext,
    node::{
        HirIdMap, HirIdSet, HirPtr, Node,
        access::{FieldAccess, IndexAccess},
        branch::If,
        call::Call,
        closure::{Closure, extract_signature, extract_signature_generic},
        data::{Dict, List, Struct, Tuple},
        graph::Graph,
        input::Input,
        r#let::{Binding, Let, VarIdMap},
        operation::{BinaryOperation, TypeAssertion, TypeConstructor, UnaryOperation},
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable},
    },
    visit::{self, Visitor},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Local<'heap> {
    pub r#type: TypeDef<'heap>,
    pub intrinsic: Option<&'static str>,
}

// We do not persist the types into the `HirMap` *yet* as we haven't yet verified if they are
// correct.
pub struct TypeInferenceResidual<'heap> {
    pub locals: VarIdMap<Local<'heap>>,
    pub intrinsics: HirIdMap<&'static str>,
}

pub struct TypeInference<'ctx, 'env, 'hir, 'heap> {
    env: &'env Environment<'heap>,
    context: &'ctx mut HirContext<'hir, 'heap>,

    inference: InferenceEnvironment<'env, 'heap>,
    collector: VariableCollector<'env, 'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    current: HirPtr,

    visited: HirIdSet,
    locals: VarIdMap<Local<'heap>>,
    intrinsics: HirIdMap<&'static str>,
}

impl<'ctx, 'env, 'hir, 'heap> TypeInference<'ctx, 'env, 'hir, 'heap> {
    pub fn new(env: &'env Environment<'heap>, context: &'ctx mut HirContext<'hir, 'heap>) -> Self {
        Self {
            env,
            context,

            inference: InferenceEnvironment::new(env),
            collector: VariableCollector::new(env),
            instantiate: InstantiateEnvironment::new(env),

            current: HirPtr::PLACEHOLDER,

            visited: FastHashSet::default(),
            locals: FastHashMap::default(),
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
        };

        (solver, residual, diagnostics)
    }
}

impl<'heap> Visitor<'heap> for TypeInference<'_, '_, '_, 'heap> {
    fn visit_type_id(&mut self, id: TypeId) {
        self.collector.visit_id(id);
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

    fn visit_primitive(&mut self, literal: &'heap Primitive<'heap>) {
        let builder = TypeBuilder::spanned(self.current.span, self.env);
        let id = match literal {
            Primitive::Null => builder.null(),
            Primitive::Boolean(_) => builder.boolean(),
            Primitive::Float(_) => builder.number(),
            Primitive::Integer(_) => builder.integer(),
            Primitive::String(_) => builder.string(),
        };

        self.context.map.insert_type_id(self.current.id, id);
    }

    fn visit_tuple(&mut self, tuple: &'heap Tuple<'heap>) {
        visit::walk_tuple(self, tuple);

        let builder = TypeBuilder::spanned(self.current.span, self.env);
        let id = builder.tuple(
            tuple
                .fields
                .iter()
                .map(|field| self.context.map.type_id(field.id)),
        );

        self.context.map.insert_type_id(self.current.id, id);
    }

    fn visit_struct(&mut self, r#struct: &'heap Struct<'heap>) {
        visit::walk_struct(self, r#struct);

        let builder = TypeBuilder::spanned(self.current.span, self.env);
        let id = builder.r#struct(
            r#struct
                .fields
                .iter()
                .map(|field| (field.name.value, self.context.map.type_id(field.value.id))),
        );

        self.context.map.insert_type_id(self.current.id, id);
    }

    fn visit_list(&mut self, list: &'heap List<'heap>) {
        visit::walk_list(self, list);

        // List is covariant over the elements. There are two ways to handle this:
        // 1. Create a union of all the element types
        // 2. Create a hole and then fill in lower bound obligations for it
        // Internally both will result in the same type, but the implementation details differ.
        // Choosing the second option allows for more accuracy in type inference in edge cases.
        // In particular it helps us to choose a type for empty lists.
        let inner = self.inference.fresh_hole(self.current.span);
        self.inference.add_variables([inner]);

        for element in list.elements {
            self.inference.add_constraint(Constraint::LowerBound {
                variable: inner,
                bound: self.context.map.type_id(element.id),
            });
        }

        let builder = TypeBuilder::spanned(self.current.span, self.env);
        let id = builder.list(inner.into_type(self.env).id);
        self.context.map.insert_type_id(self.current.id, id);
    }

    fn visit_dict(&mut self, dict: &'heap Dict<'heap>) {
        visit::walk_dict(self, dict);

        // Dicts are invariant over their key and covariant over their value.
        let key = self.inference.fresh_hole(self.current.span);
        let value = self.inference.fresh_hole(self.current.span);
        self.inference.add_variables([key, value]);

        for field in dict.fields {
            self.inference.add_constraint(Constraint::Equals {
                variable: key,
                r#type: self.context.map.type_id(field.key.id),
            });

            self.inference.add_constraint(Constraint::LowerBound {
                variable: value,
                bound: self.context.map.type_id(field.value.id),
            });
        }

        let builder = TypeBuilder::spanned(self.current.span, self.env);
        let id = builder.dict(key.into_type(self.env).id, value.into_type(self.env).id);
        self.context.map.insert_type_id(self.current.id, id);
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

        let r#type = self.apply_substitution(self.current.span, def, &variable.arguments);

        self.context.map.insert_type_id(self.current.id, r#type);

        if let Some(intrinsic) = intrinsic {
            self.intrinsics.insert_unique(self.current.id, intrinsic);
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

        def.id = self.apply_substitution(self.current.span, def, &variable.arguments);

        self.context.map.insert_type_def(self.current.id, def);
        self.intrinsics.insert_unique(self.current.id, intrinsic);
    }

    fn visit_binding(&mut self, binding: &'heap Binding<'heap>) {
        visit::walk_binding(self, binding);
        let Binding {
            span: _,
            binder,
            value,
        } = binding;

        // We simply take the type of the value
        let value_type = self.context.map.type_id(value.id);

        let arguments = self
            .context
            .map
            .get_type_arguments(value.id)
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
        let Let { bindings: _, body } = r#let;

        // Note: We intentionally leave locals in scope after visiting the body to avoid
        // requiring an additional traversal for collection during the type checking phase.

        // The let expression's type is determined by its body, not the bound value
        self.context
            .map
            .insert_type_id(self.current.id, self.context.map.type_id(body.id));
    }

    fn visit_input(&mut self, input: &'heap Input<'heap>) {
        visit::walk_input(self, input);

        // We simply take on the type of the input.
        self.context
            .map
            .insert_type_id(self.current.id, input.r#type);

        // If a default exists, we additionally need to discharge a constraint that the default is
        // `<:` to the type specified.
        if let Some(default) = &input.default {
            self.inference.collect_constraints(
                Variance::Covariant,
                self.context.map.type_id(default.id),
                input.r#type,
            );
        }
    }

    fn visit_type_assertion(&mut self, assertion: &'heap TypeAssertion<'heap>) {
        visit::walk_type_assertion(self, assertion);

        self.context
            .map
            .insert_type_id(self.current.id, assertion.r#type);

        // The type is the one provided, but only if it's force, otherwise we have a `<:`, meaning
        // that the type assertion must be narrower than the provided type.
        if assertion.force {
            return;
        }

        // value <: assertion
        self.inference.collect_constraints(
            Variance::Covariant,
            self.context.map.type_id(assertion.value.id),
            assertion.r#type,
        );
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        // There are no additional constraints that can be discharged here, as we just reference the
        // closure given.
        visit::walk_type_constructor(self, constructor);

        // Unlike functions this is done in the `ctor` step, so no transfer needs to happen here.,
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
            self.current.span,
            self.context.map.type_id(access.expr.id),
            access.field,
        );

        self.context
            .map
            .insert_type_id(self.current.id, variable.into_type(self.env).id);
    }

    fn visit_index_access(&mut self, access: &'heap IndexAccess<'heap>) {
        visit::walk_index_access(self, access);

        let variable = self.inference.add_subscript(
            self.current.span,
            self.context.map.type_id(access.expr.id),
            self.context.map.type_id(access.index.id),
        );

        self.context
            .map
            .insert_type_id(self.current.id, variable.into_type(self.env).id);
    }

    fn visit_call(&mut self, call: &'heap Call<'heap>) {
        visit::walk_call(self, call);

        // Make sure that we use a *fresh* instance every invocation
        // `visit_*_variable` ensure that the function is always fresh as can be
        let function = self.context.map.type_id(call.function.id);

        // Create a new hole for the return type, this will be the return type of this function
        let returns = self.inference.fresh_hole(self.current.span);
        let returns_id = returns.into_type(self.env).id;

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
        self.inference
            .collect_constraints(Variance::Covariant, function, closure);

        self.context.map.insert_type_id(self.current.id, returns_id);

        // We do not need to collect the closure generated, as we can always re-generate it easily
        // from the types provided when we do the type-check.
    }

    fn visit_if(&mut self, r#if: &'heap If<'heap>) {
        visit::walk_if(self, r#if);

        let test = self.context.map.type_id(r#if.test.id);
        let then = self.context.map.type_id(r#if.then.id);
        let r#else = self.context.map.type_id(r#if.r#else.id);

        // The output is the union of the then and else branches
        let output = self.env.intern_type(PartialType {
            span: self.current.span,
            kind: self.env.intern_kind(TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&[then, r#else]),
            })),
        });

        self.context.map.insert_type_id(self.current.id, output);

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

    fn visit_closure(&mut self, Closure { signature, body }: &'heap Closure<'heap>) {
        // We skip instantiation for closure parameters to ensure they remain valid
        // for local binding within the closure scope.
        self.visit_closure_signature(signature);

        let def = self.context.map.type_def(self.current.id);

        // Mark closure arguments as unscoped to prevent them from being affected by instantiation.
        // This preserves variable identity within the closure - if instantiation modified them,
        // each reference would become distinct, breaking type inference.
        let old_unscoped = self
            .instantiate
            .enter_unscoped(def.arguments.iter().map(|argument| argument.id));

        let type_signature = extract_signature(def.id, self.env);
        let type_generic = extract_signature_generic(def.id, self.env);

        // Collect generic argument constraints, so that they can aid during type inference.
        if let Some(generic) = type_generic {
            generic.collect_argument_constraints(self.current.span, &mut self.inference, true);
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
        self.visit_node(*body);

        // Note: Locals remain in scope for use during the subsequent type checking phase.

        // `body <: return`
        self.inference.collect_constraints(
            Variance::Covariant,
            self.context.map.type_id(body.id),
            type_signature.returns,
        );

        self.instantiate.exit_unscoped(old_unscoped);

        // Create a completely separate instantiation of the closure's definition to decouple any
        // inference steps of the body from the closure's definition.
        let mut def = def.clone();
        def.instantiate(&mut self.instantiate);

        self.context.map.insert_type_def(self.current.id, def);
    }

    fn visit_thunk(&mut self, _: &'heap Thunk<'heap>) {
        unreachable!("thunk operations shouldn't be present yet");
    }

    fn visit_graph(&mut self, _: &'heap Graph<'heap>) {
        unreachable!("graph operations shouldn't be present yet");
    }
}
