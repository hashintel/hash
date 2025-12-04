//! Type translation module that converts AST type nodes into the core type system.
//!
//! This module handles the translation from abstract tree type representations
//! to the lower-level type system used by the compiler for type checking and inference.
//! It maintains context about local variables, generics, and handles path resolution through
//! the module registry to support both local and global type references.

use alloc::borrow::Cow;

use hashql_core::{
    collections::{FastHashMap, FastHashSet, SmallVec, TinyVec, fast_hash_set_with_capacity},
    intern::Provisioned,
    module::{
        ModuleRegistry, Universe,
        item::{IntrinsicItem, IntrinsicTypeItem, Item, ItemKind},
        locals::{TypeDef, TypeLocals},
    },
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, TypeId,
        environment::Environment,
        kind::{
            Apply, ClosureType, Generic, Infer, IntersectionType, IntrinsicType, OpaqueType, Param,
            StructType, TupleType, TypeKind, UnionType,
            generic::{GenericArgumentMap, GenericArgumentReference, GenericSubstitution},
            intrinsic::{DictType, ListType},
            r#struct::StructField,
        },
    },
};

use super::error::{
    TypeExtractorDiagnosticIssues, duplicate_struct_fields, generic_constraint_not_allowed,
    invalid_resolved_item, resolution_error, unknown_intrinsic_type, unused_generic_parameter,
};
use crate::{
    lowering::type_extractor::error::{
        generic_parameter_mismatch, intrinsic_parameter_count_mismatch, unbound_type_variable,
    },
    node::{
        self,
        expr::closure::ClosureSignature,
        generic::GenericConstraint,
        path::{Path, PathSegmentArgument},
        r#type::visit::{TypeVisitor, walk_generic_constraint, walk_path},
    },
};

struct GenericArgumentVisitor<'env, 'heap> {
    scope: &'env [GenericArgumentReference<'heap>],
    used: FastHashSet<GenericArgumentReference<'heap>>,
}

impl<'env, 'heap> GenericArgumentVisitor<'env, 'heap> {
    fn new(scope: &'env [GenericArgumentReference<'heap>]) -> Self {
        Self {
            scope,
            used: fast_hash_set_with_capacity(scope.len()),
        }
    }
}

impl<'heap> TypeVisitor<'heap> for GenericArgumentVisitor<'_, 'heap> {
    fn visit_generic_constraint(&mut self, generic_constraint: &GenericConstraint<'heap>) {
        walk_generic_constraint(self, generic_constraint);

        // generic constraints without a bound act as local variables
        if generic_constraint.bound.is_none() {
            // This is a variable, check if we're using this one
            if let Some(&argument) = self
                .scope
                .iter()
                .find(|argument| argument.name == generic_constraint.name.value)
            {
                self.used.insert(argument);
            }
        }
    }

    fn visit_path(&mut self, path: &Path<'heap>) {
        walk_path(self, path);

        // If the path is an ident, it can act as a generic argument
        if let Some((ident, _)) = path.as_generic_ident()
            && let Some(&argument) = self
                .scope
                .iter()
                .find(|argument| argument.name == ident.value)
        {
            self.used.insert(argument);
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum VariableReference<'env, 'heap> {
    Local(Ident<'heap>),
    Global(&'env Path<'heap>),
}

impl VariableReference<'_, '_> {
    pub(crate) const fn span(&self) -> SpanId {
        match self {
            Self::Local(ident) => ident.span,
            Self::Global(path) => path.span,
        }
    }
}

/// Represents a reference to either a type variable or a type node.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Reference<'ty, 'heap> {
    Variable(Ident<'heap>),
    Type(&'ty node::r#type::Type<'heap>),
}

impl Reference<'_, '_> {
    const fn span(&self) -> SpanId {
        match self {
            Self::Variable(ident) => ident.span,
            Self::Type(r#type) => r#type.span,
        }
    }
}

/// Specifies whether a type has structural or nominal identity.
///
/// Types in the system can have either structural identity (compared by their structure)
/// or nominal identity (compared by their name), which affects type checking.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Identity<'heap> {
    Structural,
    Nominal(Symbol<'heap>),
}

/// Structure of Arrays (`SoA`) of spanned generic arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SpannedGenericArguments<'heap> {
    value: TinyVec<GenericArgumentReference<'heap>>,
    spans: TinyVec<SpanId>,
}

impl<'heap> SpannedGenericArguments<'heap> {
    pub(crate) const fn empty() -> Self {
        Self {
            value: TinyVec::new(),
            spans: TinyVec::new(),
        }
    }

    pub(crate) fn from_parts(
        value: TinyVec<GenericArgumentReference<'heap>>,
        spans: TinyVec<SpanId>,
    ) -> Self {
        debug_assert_eq!(value.len(), spans.len());

        Self { value, spans }
    }

    pub(crate) const fn len(&self) -> usize {
        self.value.len()
    }

    const fn is_empty(&self) -> bool {
        self.value.is_empty()
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = &GenericArgumentReference<'heap>> {
        self.value.iter()
    }

    fn iter_spanned(&self) -> impl Iterator<Item = (GenericArgumentReference<'heap>, SpanId)> {
        self.value.iter().copied().zip(self.spans.iter().copied())
    }
}

impl<'heap> FromIterator<(GenericArgumentReference<'heap>, SpanId)>
    for SpannedGenericArguments<'heap>
{
    fn from_iter<T: IntoIterator<Item = (GenericArgumentReference<'heap>, SpanId)>>(
        iter: T,
    ) -> Self {
        let (value, spans) = iter.into_iter().collect();

        Self { value, spans }
    }
}

/// Represents a local type variable with its associated type information.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalVariable<'ty, 'heap> {
    pub id: Provisioned<TypeId>,
    pub name: Ident<'heap>,
    pub r#type: &'ty node::r#type::Type<'heap>,
    pub identity: Identity<'heap>,

    pub arguments: SpannedGenericArguments<'heap>,
}

pub(crate) trait LocalVariableResolver<'heap> {
    type GenericArgument: Into<GenericArgumentReference<'heap>> + Copy;

    fn find_by_ident(&self, ident: Ident<'heap>) -> Option<(TypeId, &[Self::GenericArgument])>;
    fn names(&self) -> impl IntoIterator<Item = Symbol<'heap>> + Clone;
}

impl<'heap> LocalVariableResolver<'heap> for FastHashMap<Symbol<'heap>, LocalVariable<'_, 'heap>> {
    type GenericArgument = GenericArgumentReference<'heap>;

    fn find_by_ident(&self, ident: Ident<'heap>) -> Option<(TypeId, &[Self::GenericArgument])> {
        let variable = self.get(&ident.value)?;

        Some((variable.id.value(), &variable.arguments.value))
    }

    fn names(&self) -> impl IntoIterator<Item = Symbol<'heap>> + Clone {
        self.keys().copied()
    }
}

impl<'heap> LocalVariableResolver<'heap> for TypeLocals<'heap> {
    type GenericArgument = GenericArgumentReference<'heap>;

    fn find_by_ident(&self, ident: Ident<'heap>) -> Option<(TypeId, &[Self::GenericArgument])> {
        let def = self.get(ident.value)?;

        Some((def.value.id, &def.value.arguments))
    }

    fn names(&self) -> impl IntoIterator<Item = Symbol<'heap>> + Clone {
        self.names()
    }
}

/// Main context for type translation operations.
///
/// The translation unit maintains all the context needed for translating AST type
/// nodes into the core type system, including environment, registry access,
/// and tracking of local variables and bound generic parameters.
pub(crate) struct TranslationUnit<'env, 'heap, L> {
    pub env: &'env Environment<'heap>,
    pub registry: &'env ModuleRegistry<'heap>,
    pub diagnostics: TypeExtractorDiagnosticIssues,

    pub locals: &'env L,

    pub bound_generics: Cow<'env, SpannedGenericArguments<'heap>>,
}

impl<'env, 'heap, L> TranslationUnit<'env, 'heap, L>
where
    L: LocalVariableResolver<'heap>,
{
    /// Creates a nominal (named) type with its underlying representation.
    ///
    /// Nominal types are identified by their name rather than structure, but still have an
    /// underlying representation.
    fn nominal(&mut self, name: Symbol<'heap>, repr: Reference<'_, 'heap>) -> TypeKind<'heap> {
        let repr = self.reference(repr);

        let kind = OpaqueType { name, repr };

        TypeKind::Opaque(kind)
    }

    /// Looks up a local identifier to find its associated type and generic arguments.
    ///
    /// This method first checks if the identifier refers to a bound generic parameter, and if so,
    /// creates a parameter reference. Otherwise, it looks for a local variable with that name and
    /// returns its type ID and generic arguments.
    fn find_local(&self, ident: Ident<'heap>) -> Option<(TypeId, &'env [L::GenericArgument])> {
        // Look through the generics, and see if there are any generics, that have a fitting name
        if let Some(&generic) = self
            .bound_generics
            .iter()
            .find(|generic| generic.name == ident.value)
        {
            let param = self.env.intern_type(PartialType {
                span: ident.span,
                kind: self.env.intern_kind(TypeKind::Param(Param {
                    argument: generic.id,
                })),
            });

            // A generic does not have any arguments that can be slotted into
            return Some((param, &[]));
        }

        self.locals.find_by_ident(ident)
    }

    /// Converts a path segment argument into a type reference.
    ///
    /// Path segment arguments can be either concrete type arguments or generic constraints. This
    /// method converts both forms into a uniform Reference type for further processing.
    fn convert_path_segment_argument<'arg>(
        &mut self,
        parameter: &'arg PathSegmentArgument<'heap>,
    ) -> Option<Reference<'arg, 'heap>> {
        match parameter {
            node::path::PathSegmentArgument::Argument(generic_argument) => {
                Some(Reference::Type(&generic_argument.r#type))
            }
            node::path::PathSegmentArgument::Constraint(generic_constraint) => {
                if generic_constraint.bound.is_some() {
                    self.diagnostics.push(generic_constraint_not_allowed(
                        generic_constraint.span,
                        parameter.span(),
                        generic_constraint.name.value,
                    ));

                    return None;
                }

                Some(Reference::Variable(generic_constraint.name))
            }
        }
    }

    /// Applies generic arguments to a base type.
    ///
    /// This creates a type application by substituting concrete types for the generic parameters of
    /// the base type. It maps the provided parameters to the expected arguments and creates the
    /// appropriate substitutions.
    fn apply_reference<T>(
        &mut self,
        variable: &VariableReference<'_, 'heap>,
        base: TypeId,
        parameters: &[T],
        arguments: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap>
    where
        T: Into<GenericArgumentReference<'heap>> + Copy,
    {
        if arguments.len() != parameters.len() {
            self.diagnostics
                .push(generic_parameter_mismatch(variable, parameters, arguments));

            return TypeKind::Never;
        }

        let mut substitutions = TinyVec::with_capacity(arguments.len());

        let mut error = false;
        for (&parameter, argument) in parameters.iter().zip(arguments.iter()) {
            let parameter = parameter.into();
            let Some(reference) = self.convert_path_segment_argument(argument) else {
                error = true;
                continue;
            };

            let value = self.reference(reference);

            substitutions.push(GenericSubstitution {
                argument: parameter.id,
                value,
            });
        }

        if error {
            return TypeKind::Never;
        }

        TypeKind::Apply(Apply {
            base,
            substitutions: self.env.intern_generic_substitutions(&mut substitutions),
        })
    }

    /// Resolves a reference to a local variable or generic parameter.
    ///
    /// This handles local identifiers by finding their corresponding type and applying any generic
    /// parameters provided at the reference site.
    fn local_reference(
        &mut self,
        ident: Ident<'heap>,
        parameters: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap> {
        let Some((base, arguments)) = self.find_local(ident) else {
            self.diagnostics.push(unbound_type_variable(
                ident.span,
                ident.value,
                self.locals.names(),
            ));

            return TypeKind::Never;
        };

        self.apply_reference(
            &VariableReference::Local(ident),
            base,
            arguments,
            parameters,
        )
    }

    /// Handles intrinsic type references like List and Dict.
    ///
    /// Intrinsic types are built-in parameterized types with special semantics. This method
    /// resolves references to intrinsic types and constructs the appropriate type representation
    /// based on the provided parameters.
    #[expect(clippy::missing_asserts_for_indexing, reason = "false positive")]
    fn intrinsic(
        &mut self,
        span: SpanId,
        name: &'static str,
        parameters: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap> {
        match name {
            "::kernel::type::List" => {
                if parameters.len() != 1 {
                    self.diagnostics.push(intrinsic_parameter_count_mismatch(
                        span,
                        name,
                        1,
                        parameters.len(),
                    ));

                    return TypeKind::Never;
                }

                let Some(reference) = self.convert_path_segment_argument(&parameters[0]) else {
                    return TypeKind::Never;
                };

                let element = self.reference(reference);

                TypeKind::Intrinsic(IntrinsicType::List(ListType { element }))
            }
            "::kernel::type::Dict" => {
                if parameters.len() != 2 {
                    self.diagnostics.push(intrinsic_parameter_count_mismatch(
                        span,
                        name,
                        2,
                        parameters.len(),
                    ));

                    return TypeKind::Never;
                }

                let key = self
                    .convert_path_segment_argument(&parameters[0])
                    .map(|key| self.reference(key));

                let value = self
                    .convert_path_segment_argument(&parameters[1])
                    .map(|value| self.reference(value));

                let Some((key, value)) = Option::zip(key, value) else {
                    return TypeKind::Never;
                };

                TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value }))
            }
            _ => {
                self.diagnostics.push(unknown_intrinsic_type(
                    span,
                    self.env.heap,
                    name,
                    &["::kernel::type::List", "::kernel::type::Dict"],
                ));

                TypeKind::Never
            }
        }
    }

    /// Resolves a global type reference from a path.
    ///
    /// Global references are paths like `::module::Type<T>` that need to be resolved through the
    /// module registry. This method handles both normal types and intrinsic types, and applies any
    /// generic parameters.
    fn global_reference(&mut self, path: &Path<'heap>) -> TypeKind<'heap> {
        let parameters = &path
            .segments
            .last()
            .unwrap_or_else(|| unreachable!("segments are always non-empty"))
            .arguments;

        let query = path.segments.iter().map(|segment| segment.name.value);

        let (base, arguments) = match self.registry.resolve(query, Universe::Type) {
            Ok(Item {
                kind: ItemKind::Type(TypeDef { id, arguments }),
                ..
            }) => (id, arguments),
            Ok(Item {
                kind: ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem { name })),
                ..
            }) => return self.intrinsic(path.span, name, parameters),
            Ok(item) => {
                self.diagnostics
                    .push(invalid_resolved_item(path.span, Universe::Type, item.kind));

                return TypeKind::Never;
            }
            Err(error) => {
                self.diagnostics.push(resolution_error(path, &error));

                return TypeKind::Never;
            }
        };

        // Global references are re-spanned, so that they point to the definition site.
        // Local variables may not be defined yet and therefore couldn't be re-spanned in any
        // meaningful capacity.
        let base_kind = self.env.types.index_partial(base).kind;
        let base = self.env.intern_type(PartialType {
            span: path.span,
            kind: base_kind,
        });

        self.apply_reference(
            &VariableReference::Global(path),
            base,
            arguments.as_ref(),
            parameters,
        )
    }

    fn report_unused_variables(
        &mut self,
        span: SpanId,
        arguments: &SpannedGenericArguments<'heap>,
        unbound: FastHashSet<GenericArgumentReference<'heap>>,
    ) -> Option<TypeKind<'heap>> {
        if unbound.is_empty() {
            return None;
        }

        for unbound_argument in unbound {
            let (argument, argument_span) = arguments
                .iter_spanned()
                .find(|(argument, _)| *argument == unbound_argument)
                .unwrap_or_else(|| unreachable!());

            self.diagnostics
                .push(unused_generic_parameter(argument, argument_span, span));
        }

        Some(TypeKind::Never)
    }

    fn verify_unused_variables(
        &mut self,
        r#type: &node::r#type::Type<'heap>,
        arguments: &SpannedGenericArguments<'heap>,
    ) -> Option<TypeKind<'heap>> {
        let mut visitor = GenericArgumentVisitor::new(&arguments.value);
        visitor.visit_type(r#type);

        let mut unbound: FastHashSet<_> = arguments.iter().copied().collect();
        unbound -= &visitor.used;

        self.report_unused_variables(r#type.span, arguments, unbound)
    }

    fn verify_unused_variables_closure(
        &mut self,
        closure: &ClosureSignature<'heap>,
        arguments: &SpannedGenericArguments<'heap>,
    ) -> Option<TypeKind<'heap>> {
        let mut visitor = GenericArgumentVisitor::new(&arguments.value);

        for param in &closure.inputs {
            visitor.visit_type(&param.bound);
        }

        visitor.visit_type(&closure.output);

        let mut unbound: FastHashSet<_> = arguments.iter().copied().collect();
        unbound -= &visitor.used;

        self.report_unused_variables(closure.span, arguments, unbound)
    }

    fn translate_children(&mut self, types: &[node::r#type::Type<'heap>]) -> SmallVec<TypeId> {
        let mut variants = SmallVec::with_capacity(types.len());

        for r#type in types {
            variants.push(self.reference(Reference::Type(r#type)));
        }

        variants
    }

    fn union(&mut self, union: &node::r#type::UnionType<'heap>) -> TypeKind<'heap> {
        let variants = self.translate_children(&union.types);

        TypeKind::Union(UnionType {
            variants: self.env.intern_type_ids(&variants),
        })
    }

    fn intersection(
        &mut self,
        intersection: &node::r#type::IntersectionType<'heap>,
    ) -> TypeKind<'heap> {
        let variants = self.translate_children(&intersection.types);

        TypeKind::Intersection(IntersectionType {
            variants: self.env.intern_type_ids(&variants),
        })
    }

    /// Translates an AST type kind into the core type system representation.
    ///
    /// This is the main translation function that handles all the different type kinds (infer,
    /// path, tuple, struct, union, intersection) and converts them to the corresponding core type
    /// system representation.
    fn type_kind(&mut self, kind: &node::r#type::TypeKind<'heap>) -> TypeKind<'heap> {
        match kind {
            node::r#type::TypeKind::Infer => {
                let hole = self.env.counter.hole.next();

                TypeKind::Infer(Infer { hole })
            }
            node::r#type::TypeKind::Path(path) => {
                if let Some((name, parameters)) = path.as_generic_ident() {
                    self.local_reference(name, parameters)
                } else {
                    self.global_reference(path)
                }
            }
            node::r#type::TypeKind::Tuple(tuple_type) => {
                let mut elements = SmallVec::with_capacity(tuple_type.fields.len());

                for node::r#type::TupleField { r#type, .. } in &tuple_type.fields {
                    // The arguments are bound by the tuple type itself, therefore no downstream
                    // type needs to bind them
                    elements.push(self.reference(Reference::Type(r#type)));
                }

                TypeKind::Tuple(TupleType {
                    fields: self.env.intern_type_ids(&elements),
                })
            }
            node::r#type::TypeKind::Struct(struct_type) => {
                let mut fields = SmallVec::with_capacity(struct_type.fields.len());

                let mut spans = FastHashMap::with_capacity_and_hasher(
                    fields.len(),
                    foldhash::fast::RandomState::default(),
                );

                for node::r#type::StructField {
                    name, r#type, span, ..
                } in &struct_type.fields
                {
                    fields.push(StructField {
                        name: name.value,
                        value: self.reference(Reference::Type(r#type)),
                    });

                    spans.entry(name.value).or_insert(Vec::new()).push(*span);
                }

                let fields = match self.env.intern_struct_fields(&mut fields) {
                    Ok(fields) => fields,
                    Err((fields, _)) => {
                        for field in fields {
                            let spans = spans.get(&field.name).map_or(&[] as &[_], Vec::as_slice);
                            // The first span is the original span, any subsequent spans are
                            // duplicates
                            let original = spans[0];
                            let duplicates = &spans[1..];

                            if duplicates.is_empty() {
                                // Not a duplicate
                                continue;
                            }

                            self.diagnostics.push(duplicate_struct_fields(
                                original,
                                duplicates.iter().copied(),
                                field.name,
                            ));
                        }

                        return TypeKind::Never;
                    }
                };

                TypeKind::Struct(StructType { fields })
            }
            node::r#type::TypeKind::Union(union_type) => self.union(union_type),
            node::r#type::TypeKind::Intersection(intersection_type) => {
                self.intersection(intersection_type)
            }
            node::r#type::TypeKind::Dummy => TypeKind::Never,
        }
    }

    /// Translates a reference into a `TypeId`.
    ///
    /// This is a dispatcher method that handles both variable references and type references,
    /// converting them to an interned `TypeId`.
    pub(crate) fn reference(&mut self, reference: Reference<'_, 'heap>) -> TypeId {
        let kind = match reference {
            Reference::Variable(ident) => self.local_reference(ident, &[]),
            Reference::Type(r#type) => self.type_kind(&r#type.kind),
        };

        let partial = PartialType {
            span: reference.span(),
            kind: self.env.intern_kind(kind),
        };

        self.env.intern_type(partial)
    }

    fn variable_kind(&mut self, variable: &LocalVariable<'_, 'heap>) -> TypeKind<'heap> {
        if let Identity::Nominal(name) = variable.identity {
            self.nominal(name, Reference::Type(variable.r#type))
        } else {
            self.type_kind(&variable.r#type.kind)
        }
    }

    fn generic_variable(
        &mut self,
        variable: &LocalVariable<'_, 'heap>,
        constraints: &GenericArgumentMap<Option<TypeId>>,
    ) -> TypeKind<'heap> {
        let mut arguments: TinyVec<_> = variable
            .arguments
            .iter()
            .map(|reference| reference.with_constraint(constraints[&reference.id]))
            .collect();

        TypeKind::Generic(Generic {
            base: self.env.intern_type(PartialType {
                span: variable.r#type.span,
                kind: self.env.intern_kind(self.variable_kind(variable)),
            }),
            arguments: self.env.intern_generic_arguments(&mut arguments),
        })
    }

    fn variable_verify(
        &mut self,
        variable: &LocalVariable<'_, 'heap>,
        constraints: &GenericArgumentMap<Option<TypeId>>,
    ) -> (TypeKind<'heap>, TinyVec<GenericArgumentReference<'heap>>) {
        if let Some(kind) = self.verify_unused_variables(variable.r#type, &variable.arguments) {
            return (kind, TinyVec::new());
        }

        if variable.arguments.is_empty() {
            return (self.variable_kind(variable), TinyVec::new());
        }

        (
            self.generic_variable(variable, constraints),
            variable.arguments.value.clone(),
        )
    }

    /// Converts a local variable to its `TypeId` representation.
    ///
    /// This method handles creating the appropriate type for a local variable, taking into account
    /// whether it has nominal or structural identity.
    ///
    /// Returns the unitialized type, as well as the referenced arguments, this is always either all
    /// the generics, or none in case an error occured and the type was coerced to `Never`.
    pub(crate) fn variable(
        &mut self,
        variable: &LocalVariable<'_, 'heap>,
        constraints: &GenericArgumentMap<Option<TypeId>>,
    ) -> TypeDef<'heap> {
        let (kind, arguments) = self.variable_verify(variable, constraints);

        let kind = self.env.intern_kind(kind);
        let partial = PartialType {
            span: variable.r#type.span,
            kind,
        };

        let id = self.env.types.intern_provisioned(variable.id, partial).id;

        TypeDef {
            id,
            arguments: self.env.intern_generic_argument_references(&arguments),
        }
    }

    pub(crate) fn closure_signature(
        &mut self,
        signature: &ClosureSignature<'heap>,
    ) -> TypeDef<'heap> {
        // Generate the required generic mappings and their constraints
        let mut generic_arguments = TinyVec::with_capacity(signature.generics.params.len());
        let mut generic_constraints = TinyVec::with_capacity(signature.generics.params.len());
        let mut generic_spans = TinyVec::with_capacity(signature.generics.params.len());

        for param in &signature.generics.params {
            let argument = GenericArgumentReference {
                id: self.env.counter.generic_argument.next(),
                name: param.name.value,
            };

            generic_arguments.push(argument);
            generic_spans.push(param.span);
        }

        let generics = SpannedGenericArguments {
            value: generic_arguments.clone(),
            spans: generic_spans,
        };

        if let Some(replacement) = self.verify_unused_variables_closure(signature, &generics) {
            return TypeDef {
                id: self.env.intern_type(PartialType {
                    span: signature.span,
                    kind: self.env.intern_kind(replacement),
                }),
                arguments: self.env.intern_generic_argument_references(&[]),
            };
        }

        self.bound_generics = Cow::Owned(generics);

        for param in &signature.generics.params {
            let bound = param
                .bound
                .as_ref()
                .map(|bound| self.reference(Reference::Type(bound)));

            generic_constraints.push(bound);
        }

        // generate all parameters and the output type
        let mut params = SmallVec::with_capacity(signature.inputs.len());
        for param in &signature.inputs {
            params.push(self.reference(Reference::Type(&param.bound)));
        }

        let returns = self.reference(Reference::Type(&signature.output));

        // Actually create the closure
        let mut kind = TypeKind::Closure(ClosureType {
            params: self.env.intern_type_ids(&params),
            returns,
        });

        // in case we have generics we need to additionally wrap said kind in a `Generic`
        if !self.bound_generics.is_empty() {
            let mut arguments: TinyVec<_> = self
                .bound_generics
                .iter()
                .zip(generic_constraints)
                .map(|(reference, constraint)| reference.with_constraint(constraint))
                .collect();

            kind = TypeKind::Generic(Generic {
                base: self.env.intern_type(PartialType {
                    span: signature.span,
                    kind: self.env.intern_kind(kind),
                }),
                arguments: self.env.intern_generic_arguments(&mut arguments),
            });
        }

        let id = self.env.intern_type(PartialType {
            span: signature.span,
            kind: self.env.intern_kind(kind),
        });

        TypeDef {
            id,
            arguments: self
                .env
                .intern_generic_argument_references(&generic_arguments),
        }
    }
}
