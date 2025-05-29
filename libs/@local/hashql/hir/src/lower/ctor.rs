use alloc::borrow::Cow;
use core::{cmp::Ordering, convert::Infallible, mem};

use hashql_core::{
    collection::FastHashMap,
    intern::Interned,
    module::{
        ModuleRegistry, Universe,
        item::ItemKind,
        locals::{TypeDef, TypeLocals},
    },
    span::{SpanId, Spanned},
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
        kind::{
            GenericArguments, PrimitiveType, TypeKind,
            generic::{GenericArgumentReference, GenericSubstitution},
        },
    },
};
use hashql_diagnostics::{
    Diagnostic, Help, Note, Severity,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    label::Label,
};

use crate::{
    fold::{Fold, nested::Deep, walk_nested_node, walk_node},
    intern::Interner,
    node::{
        HirId, Node, PartialNode,
        kind::NodeKind,
        operation::{
            Operation, OperationKind, TypeOperation,
            r#type::{TypeConstructor, TypeOperationKind},
        },
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
    },
};

const GENERIC_ARGUMENT_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-argument-mismatch",
    name: "Incorrect number of type arguments",
};

pub type ConvertTypeConstructorDiagnostic =
    Diagnostic<ConvertTypeConstructorDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ConvertTypeConstructorDiagnosticCategory {
    GenericArgumentMismatch,
}

impl DiagnosticCategory for ConvertTypeConstructorDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("convert-type-constructor")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Convert Type Constructor")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::GenericArgumentMismatch => Some(&GENERIC_ARGUMENT_MISMATCH),
        }
    }
}

fn generic_argument_mismatch<'heap>(
    node: &Node<'heap>,
    variable: &Variable<'heap>,

    parameters: &[GenericArgumentReference],
    arguments: &[Spanned<TypeId>],
) -> ConvertTypeConstructorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ConvertTypeConstructorDiagnosticCategory::GenericArgumentMismatch,
        Severity::Error,
    );

    let expected = parameters.len();
    let actual = arguments.len();

    let missing = parameters.get(actual..).unwrap_or(&[]);
    let extraneous = arguments.get(expected..).unwrap_or(&[]);

    diagnostic.labels.push(Label::new(
        variable.span,
        format!(
            "This type constructor requires {expected} generic argument{}, but {actual} {} \
             provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        ),
    ));

    let mut order = -1;
    for missing in missing {
        diagnostic.labels.push(
            Label::new(
                node.span,
                format!("Add missing parameter `{}`", missing.name.demangle()),
            )
            .with_order(order)
            .with_color(Color::Ansi(AnsiColor::Yellow)),
        );

        order -= 1;
    }

    for &extraneous in extraneous {
        diagnostic.labels.push(
            Label::new(extraneous.span, "Remove this argument")
                .with_order(order)
                .with_color(Color::Ansi(AnsiColor::Red)),
        );

        order -= 1;
    }

    let usage = format!(
        "{}{}",
        variable.name(),
        GenericArgumentReference::display(parameters)
    );

    let help = match actual.cmp(&expected) {
        Ordering::Less => format!(
            "This type constructor requires exactly {} generic argument{}. Provide the missing \
             parameter{}: {}",
            expected,
            if expected == 1 { "" } else { "s" },
            if missing.len() == 1 { "" } else { "s" },
            usage
        ),
        Ordering::Greater => format!(
            "This type constructor accepts exactly {} generic argument{}. Remove the extra \
             parameter{}: {}",
            expected,
            if expected == 1 { "" } else { "s" },
            if extraneous.len() == 1 { "" } else { "s" },
            usage
        ),
        Ordering::Equal => format!("Correct usage: {usage}"),
    };

    diagnostic.add_help(Help::new(help));

    if !parameters.is_empty() {
        diagnostic.add_note(Note::new(
            "Generic type parameters must be provided when instantiating parameterized types. \
             Each parameter corresponds to a specific type that will be substituted throughout \
             the type definition.",
        ));
    }

    diagnostic
}

pub struct ConvertTypeConstructor<'env, 'heap> {
    interner: &'env Interner<'heap>,
    locals: &'env TypeLocals<'heap>,
    registry: &'env ModuleRegistry<'heap>,
    environment: &'env Environment<'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,
    diagnostics: Vec<ConvertTypeConstructorDiagnostic>,
    cache: FastHashMap<HirId, Node<'heap>>,
    nested: bool,
}

impl<'env, 'heap> ConvertTypeConstructor<'env, 'heap> {
    pub fn new(
        interner: &'env Interner<'heap>,
        locals: &'env TypeLocals<'heap>,
        registry: &'env ModuleRegistry<'heap>,
        environment: &'env Environment<'heap>,
    ) -> Self {
        Self {
            interner,
            locals,
            registry,
            environment,
            instantiate: InstantiateEnvironment::new(environment),
            diagnostics: Vec::new(),
            cache: FastHashMap::default(),
            nested: false,
        }
    }
}

impl<'heap> ConvertTypeConstructor<'_, 'heap> {
    fn resolve_variable(
        &self,
        variable: &Variable<'heap>,
    ) -> Option<(TypeDef<'heap>, Interned<'heap, [Spanned<TypeId>]>)> {
        match variable.kind {
            VariableKind::Local(LocalVariable {
                span: _,
                name,
                arguments,
            }) => {
                let local = self.locals.get(name.value)?;

                Some((local.value, arguments))
            }
            VariableKind::Qualified(QualifiedVariable {
                span: _,
                path,
                arguments,
            }) => {
                let item = self
                    .registry
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
    ) -> TypeId {
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

        closure
    }

    fn apply_generics(
        &mut self,
        node: &Node<'heap>,
        variable: &Variable<'heap>,
        closure_def: TypeDef<'heap>,
        generic_arguments: Interned<'heap, [Spanned<TypeId>]>,
    ) -> Option<Node<'heap>> {
        let make = |constructor| PartialNode {
            span: node.span,
            kind: NodeKind::Operation(Operation {
                span: variable.span,
                kind: OperationKind::Type(TypeOperation {
                    span: variable.span,
                    kind: TypeOperationKind::Constructor(constructor),
                }),
            }),
        };

        if generic_arguments.is_empty() {
            // We're done here, as we don't need to apply anything
            return Some(self.interner.intern_node(make(TypeConstructor {
                span: variable.span,
                closure: closure_def.id,
                arguments: closure_def.arguments,
            })));
        }

        // We need to check that the amount of generic arguments is the same as the amount of
        // generic parameters
        if generic_arguments.len() != closure_def.arguments.len() {
            self.diagnostics.push(generic_argument_mismatch(
                node,
                variable,
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

        let builder = TypeBuilder::spanned(variable.span, self.environment);
        let closure_id = builder.apply(substitutions, closure_def.id);

        // We do not need to instantiate here again, because we already had α-renaming in the
        // closure definition, which means that the closure is already unique. As the closure is
        // unused and unique, we don't need to α-rename again.
        Some(self.interner.intern_node(make(TypeConstructor {
            span: variable.span,
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

        let closure = self.build_closure(variable.span, opaque_id, generic_parameters);
        let mut closure_def = TypeDef {
            id: closure,
            arguments: generic_references,
        };
        closure_def.instantiate(&mut self.instantiate);

        self.apply_generics(node, variable, closure_def, generic_arguments)
    }
}

impl<'heap> Fold<'heap> for ConvertTypeConstructor<'_, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, Vec<ConvertTypeConstructorDiagnostic>>
    where
        T: 'heap;
    type Residual = Result<Infallible, Vec<ConvertTypeConstructorDiagnostic>>;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn fold_nested_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        self.nested = true;
        let result = walk_nested_node(self, node);
        self.nested = false;

        result
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let node_id = node.id;

        let mut node = walk_node(self, node)?;

        // Do not re-compute the node, if we've already seen it
        if let Some(&cached) = self.cache.get(&node_id) {
            node = cached;
        } else if let Some(converted) = self.convert_variable(&node) {
            self.cache.insert(node_id, converted);
            node = converted;
        }

        if !self.nested && !self.diagnostics.is_empty() {
            let diagnostics = mem::take(&mut self.diagnostics);

            return Err(diagnostics);
        }

        Ok(node)
    }
}
