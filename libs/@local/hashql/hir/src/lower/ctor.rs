use core::convert::Infallible;

use hashql_core::{
    collection::FastHashMap,
    intern::Interned,
    module::{
        Universe,
        item::ItemKind,
        locals::{TypeDef, TypeLocals},
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
        kind::{GenericArguments, PrimitiveType, TypeKind, generic::GenericSubstitution},
    },
};

use super::error::{GenericArgumentContext, LoweringDiagnosticIssues, generic_argument_mismatch};
use crate::{
    context::HirContext,
    fold::{Fold, nested::Deep, walk_node},
    intern::Interner,
    node::{
        HirId, Node, PartialNode,
        kind::NodeKind,
        operation::{Operation, TypeConstructor, TypeOperation},
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
};

pub struct ConvertTypeConstructor<'env, 'heap, 'diag> {
    context: &'env HirContext<'env, 'heap>,

    locals: &'env TypeLocals<'heap>,
    environment: &'env Environment<'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    current_span: SpanId,
    cache: FastHashMap<HirId, Node<'heap>>,

    diagnostics: &'diag mut LoweringDiagnosticIssues,
}

impl<'env, 'heap, 'diag> ConvertTypeConstructor<'env, 'heap, 'diag> {
    pub fn new(
        context: &'env HirContext<'env, 'heap>,
        locals: &'env TypeLocals<'heap>,
        environment: &'env Environment<'heap>,
        diagnostics: &'diag mut LoweringDiagnosticIssues,
    ) -> Self {
        Self {
            context,

            locals,
            environment,
            instantiate: InstantiateEnvironment::new(environment),

            current_span: SpanId::SYNTHETIC,
            cache: FastHashMap::default(),

            diagnostics,
        }
    }
}

impl<'heap> ConvertTypeConstructor<'_, 'heap, '_> {
    fn resolve_variable(
        &self,
        variable: &Variable<'heap>,
    ) -> Option<(TypeDef<'heap>, Interned<'heap, [Spanned<TypeId>]>)> {
        match *variable {
            Variable::Local(LocalVariable { id, arguments }) => {
                let name = self.context.symbols.binder.get(id.value)?;
                let local = self.locals.get(name)?;

                Some((local.value, arguments))
            }
            Variable::Qualified(QualifiedVariable { path, arguments }) => {
                let item = self
                    .context
                    .modules
                    .lookup(path.0.iter().map(|ident| ident.value), Universe::Value)?;

                let ItemKind::Constructor(constructor) = item.kind else {
                    return None;
                };

                Some((constructor.r#type, arguments))
            }
        }
    }

    fn build_closure(
        &self,
        span: SpanId,
        opaque_id: TypeId,
        generics: GenericArguments<'heap>,
    ) -> (Symbol<'heap>, TypeId) {
        let opaque = self
            .environment
            .r#type(opaque_id)
            .kind
            .opaque()
            .expect("constructor type should be opaque");

        let repr_id = opaque.repr;
        let repr = self.environment.r#type(repr_id);

        let is_null = *repr.kind == TypeKind::Primitive(PrimitiveType::Null);

        let builder = TypeBuilder::spanned(span, self.environment);

        // Create a closure, with the following
        // <generics>(repr?) -> opaque
        // Null types are implemented in a special way, so that they don't take any parameter. The
        // reason for this is to allow for marker types, that don't require a value (such as `None`)
        // in an ergonomic way.
        let params = if is_null {
            &[] as &[TypeId]
        } else {
            &[repr_id]
        };

        let mut closure = builder.closure(params.iter().copied(), opaque_id);
        if !generics.is_empty() {
            // apply the generics
            closure = builder.generic(generics, closure);
        }

        (opaque.name, closure)
    }

    fn apply_generics(
        &mut self,
        node: &Node<'heap>,
        variable: &Variable<'heap>,
        closure_def: TypeDef<'heap>,
        name: Symbol<'heap>,
        generic_arguments: Interned<'heap, [Spanned<TypeId>]>,
    ) -> Option<Node<'heap>> {
        let make = |constructor| PartialNode {
            span: node.span,
            kind: NodeKind::Operation(Operation::Type(TypeOperation::Constructor(constructor))),
        };

        if generic_arguments.is_empty() {
            // We're done here, as we don't need to apply anything
            return Some(self.context.interner.intern_node(make(TypeConstructor {
                name,
                closure: closure_def.id,
                arguments: closure_def.arguments,
            })));
        }

        // We need to check that the amount of generic arguments is the same as the amount of
        // generic parameters
        if generic_arguments.len() != closure_def.arguments.len() {
            self.diagnostics.push(generic_argument_mismatch(
                GenericArgumentContext::TypeConstructor,
                node.span,
                self.current_span,
                variable.name(&self.context.symbols),
                &closure_def.arguments,
                &generic_arguments,
            ));

            return None;
        }

        let substitutions = closure_def
            .arguments
            .iter()
            .zip(generic_arguments.iter())
            .map(
                |(reference, &Spanned { value: apply, .. })| GenericSubstitution {
                    argument: reference.id,
                    value: apply,
                },
            );

        let builder = TypeBuilder::spanned(self.current_span, self.environment);
        let closure_id = builder.apply(substitutions, closure_def.id);

        // We do not need to instantiate here again, because we already had α-renaming in the
        // closure definition, which means that the closure is already unique. As the closure is
        // unused and unique, we don't need to α-rename again.
        Some(self.context.interner.intern_node(make(TypeConstructor {
            name,
            closure: closure_id,
            arguments: self.environment.intern_generic_argument_references(&[]),
        })))
    }

    fn convert_variable(&mut self, node: &Node<'heap>) -> Option<Node<'heap>> {
        let NodeKind::Variable(variable) = node.kind else {
            return None;
        };

        let (
            TypeDef {
                id: mut opaque_id,
                arguments: generic_references,
            },
            generic_arguments,
        ) = self.resolve_variable(variable)?;

        // If the arguments aren't empty, this is a generic, therefore "peel" the generics off to
        // get the actual type, and then re-apply the generics around the closure
        let mut generic_parameters = GenericArguments::empty();
        if !generic_references.is_empty() {
            let generic = self
                .environment
                .r#type(opaque_id)
                .kind
                .generic()
                .expect("opaque type with generics should be generic");

            generic_parameters = generic.arguments;
            opaque_id = generic.base;
        }

        let (name, closure) = self.build_closure(self.current_span, opaque_id, generic_parameters);
        let mut closure_def = TypeDef {
            id: closure,
            arguments: generic_references,
        };
        closure_def.instantiate(&mut self.instantiate);

        self.apply_generics(node, variable, closure_def, name, generic_arguments)
    }
}

impl<'heap> Fold<'heap> for ConvertTypeConstructor<'_, 'heap, '_> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let node_id = node.id;

        let previous = self.current_span;
        self.current_span = node.span;

        let mut node = walk_node(self, node)?;

        // Do not re-compute the node, if we've already seen it
        if let Some(&cached) = self.cache.get(&node_id) {
            node = cached;
        } else if let Some(converted) = self.convert_variable(&node) {
            self.cache.insert(node_id, converted);
            node = converted;
        } else {
            // Node cannot be converted, use the original node as-is
        }

        self.current_span = previous;

        Ok(node)
    }
}
