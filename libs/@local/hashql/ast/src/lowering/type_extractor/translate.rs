//! Type translation module that converts AST type nodes into the core type system.
//!
//! This module handles the translation from abstract tree type representations
//! to the lower-level type system used by the compiler for type checking and inference.
//! It maintains context about local variables, generics, and handles path resolution through
//! the module registry to support both local and global type references.

use hashql_core::{
    collection::{FastHashMap, SmallVec, TinyVec},
    intern::Provisioned,
    module::{
        ModuleRegistry,
        item::{IntrinsicItem, Item, ItemKind, Universe},
    },
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, TypeId,
        environment::Environment,
        kind::{
            Apply, GenericArgument, Infer, IntersectionType, IntrinsicType, OpaqueType, Param,
            StructType, TupleType, TypeKind, UnionType,
            generic::GenericSubstitution,
            intrinsic::{DictType, ListType},
            r#struct::StructField,
        },
    },
};

use super::error::{
    TypeExtractorDiagnostic, duplicate_struct_fields, generic_constraint_not_allowed,
    invalid_resolved_item, resolution_error, special_form_not_supported, unknown_intrinsic_type,
};
use crate::{
    lowering::type_extractor::error::{
        generic_parameter_mismatch, infer_with_arguments, intrinsic_parameter_count_mismatch,
        unbound_type_variable,
    },
    node::{
        self,
        path::{Path, PathSegmentArgument},
    },
};

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

/// Represents a reference to either a type variable or a type node
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

/// Specifies whether a type has structural or nominal identity
///
/// Types in the system can have either structural identity (compared by their structure)
/// or nominal identity (compared by their name), which affects type checking.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Identity<'heap> {
    Structural,
    Nominal(Symbol<'heap>),
}

type GenericArguments<'heap> = TinyVec<GenericArgument<'heap>>;

/// Represents a local type variable with its associated type information
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalVariable<'ty, 'heap> {
    pub id: Provisioned<TypeId>,
    pub r#type: &'ty node::r#type::Type<'heap>,
    pub identity: Identity<'heap>,

    pub arguments: GenericArguments<'heap>,
}

/// Main context for type translation operations
///
/// The translation unit maintains all the context needed for translating AST type
/// nodes into the core type system, including environment, registry access,
/// and tracking of local variables and bound generic parameters.
pub(crate) struct TranslationUnit<'env, 'ty, 'heap> {
    pub env: &'env Environment<'heap>,
    pub registry: &'env ModuleRegistry<'heap>,
    pub diagnostics: Vec<TypeExtractorDiagnostic>,

    pub locals: &'env FastHashMap<Symbol<'heap>, LocalVariable<'ty, 'heap>>,
    pub bound_generics: &'env GenericArguments<'heap>,
}

impl<'env, 'heap> TranslationUnit<'env, '_, 'heap> {
    /// Creates a nominal (named) type with its underlying representation
    ///
    /// Nominal types are identified by their name rather than structure, but still have an
    /// underlying representation.
    fn nominal(
        &mut self,
        name: Symbol<'heap>,
        mut arguments: GenericArguments<'heap>,
        repr: Reference<'_, 'heap>,
    ) -> TypeKind<'heap> {
        let repr = self.reference(repr, TinyVec::new());

        let kind = OpaqueType {
            name,
            repr,
            arguments: self.env.intern_generic_arguments(&mut arguments),
        };

        TypeKind::Opaque(kind)
    }

    /// Looks up a local identifier to find its associated type and generic arguments
    ///
    /// This method first checks if the identifier refers to a bound generic parameter, and if so,
    /// creates a parameter reference. Otherwise, it looks for a local variable with that name and
    /// returns its type ID and generic arguments.
    fn find_local(&self, ident: Ident<'heap>) -> Option<(TypeId, &'env [GenericArgument<'heap>])> {
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

        let variable = self.locals.get(&ident.value)?;

        Some((variable.id.value(), &variable.arguments))
    }

    /// Converts a path segment argument into a type reference
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

    /// Applies generic arguments to a base type
    ///
    /// This creates a type application by substituting concrete types for the generic parameters of
    /// the base type. It maps the provided parameters to the expected arguments and creates the
    /// appropriate substitutions.
    fn apply_reference(
        &mut self,
        variable: &VariableReference<'_, 'heap>,
        base: TypeId,
        parameters: &[GenericArgument<'heap>],
        arguments: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap> {
        if arguments.len() != parameters.len() {
            self.diagnostics
                .push(generic_parameter_mismatch(variable, parameters, arguments));

            return TypeKind::Never;
        }

        let mut substitutions = TinyVec::with_capacity(arguments.len());

        let mut error = false;
        for (&parameter, argument) in parameters.iter().zip(arguments.iter()) {
            let Some(reference) = self.convert_path_segment_argument(argument) else {
                error = true;
                continue;
            };

            let value = self.reference(reference, TinyVec::new());

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

    /// Resolves a reference to a local variable or generic parameter
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
                self.locals.keys().copied(),
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

    /// Handles intrinsic type references like List and Dict
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
        if name.starts_with("::kernel::special_form") {
            self.diagnostics
                .push(special_form_not_supported(span, name));

            return TypeKind::Never;
        }

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

                let element = self.reference(reference, TinyVec::new());

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
                    .map(|key| self.reference(key, TinyVec::new()));

                let value = self
                    .convert_path_segment_argument(&parameters[1])
                    .map(|value| self.reference(value, TinyVec::new()));

                let Some((key, value)) = Option::zip(key, value) else {
                    return TypeKind::Never;
                };

                TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value }))
            }
            _ => {
                self.diagnostics.push(unknown_intrinsic_type(
                    span,
                    name,
                    &["::kernel::type::List", "::kernel::type::Dict"],
                ));

                TypeKind::Never
            }
        }
    }

    /// Resolves a global type reference from a path
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
                kind: ItemKind::Type(id, arguments),
                ..
            }) => (id, arguments),
            Ok(Item {
                kind:
                    ItemKind::Intrinsic(IntrinsicItem {
                        name,
                        universe: Universe::Type,
                    }),
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

        self.apply_reference(
            &VariableReference::Global(path),
            base,
            arguments,
            parameters,
        )
    }

    /// Translates an AST type kind into the core type system representation
    ///
    /// This is the main translation function that handles all the different type kinds (infer,
    /// path, tuple, struct, union, intersection) and converts them to the corresponding core type
    /// system representation.
    fn type_kind(
        &mut self,
        span: SpanId,
        kind: &node::r#type::TypeKind<'heap>,
        mut arguments: GenericArguments<'heap>,
    ) -> TypeKind<'heap> {
        match kind {
            node::r#type::TypeKind::Infer => {
                let hole = self.env.counter.hole.next();

                if !arguments.is_empty() {
                    self.diagnostics.push(infer_with_arguments(span));

                    return TypeKind::Never;
                }

                TypeKind::Infer(Infer { hole })
            }
            node::r#type::TypeKind::Path(path) => {
                if !arguments.is_empty() {
                    unimplemented!("https://linear.app/hash/issue/H-4524/hashql-alias-type-variant")
                }

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
                    elements.push(self.reference(Reference::Type(r#type), TinyVec::new()));
                }

                TypeKind::Tuple(TupleType {
                    fields: self.env.intern_type_ids(&elements),
                    arguments: self.env.intern_generic_arguments(&mut arguments),
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
                        value: self.reference(Reference::Type(r#type), TinyVec::new()),
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

                TypeKind::Struct(StructType {
                    fields,
                    arguments: self.env.intern_generic_arguments(&mut arguments),
                })
            }
            node::r#type::TypeKind::Union(union_type) => {
                let mut variants = SmallVec::with_capacity(union_type.types.len());

                for r#type in &union_type.types {
                    variants.push(self.reference(Reference::Type(r#type), arguments.clone()));
                }

                TypeKind::Union(UnionType {
                    variants: self.env.intern_type_ids(&variants),
                })
            }
            node::r#type::TypeKind::Intersection(intersection_type) => {
                let mut variants = SmallVec::with_capacity(intersection_type.types.len());

                for r#type in &intersection_type.types {
                    variants.push(self.reference(Reference::Type(r#type), arguments.clone()));
                }

                TypeKind::Intersection(IntersectionType {
                    variants: self.env.intern_type_ids(&variants),
                })
            }
        }
    }

    /// Translates a reference into a `TypeId`
    ///
    /// This is a dispatcher method that handles both variable references and type references,
    /// converting them to an interned `TypeId`.
    pub(crate) fn reference(
        &mut self,
        reference: Reference<'_, 'heap>,
        arguments: GenericArguments<'heap>,
    ) -> TypeId {
        let kind = match reference {
            Reference::Variable(ident) => self.local_reference(ident, &[]),
            Reference::Type(r#type) => self.type_kind(r#type.span, &r#type.kind, arguments),
        };

        let partial = PartialType {
            span: reference.span(),
            kind: self.env.intern_kind(kind),
        };

        self.env.intern_type(partial)
    }

    /// Converts a local variable to its `TypeId` representation
    ///
    /// This method handles creating the appropriate type for a local variable, taking into account
    /// whether it has nominal or structural identity.
    pub(crate) fn variable(&mut self, variable: &LocalVariable<'_, 'heap>) -> TypeId {
        let kind = if let Identity::Nominal(name) = variable.identity {
            self.nominal(
                name,
                variable.arguments.clone(),
                Reference::Type(variable.r#type),
            )
        } else {
            self.type_kind(
                variable.r#type.span,
                &variable.r#type.kind,
                variable.arguments.clone(),
            )
        };

        let partial = PartialType {
            span: variable.r#type.span,
            kind: self.env.intern_kind(kind),
        };

        self.env.types.intern_provisioned(variable.id, partial).id
    }
}
