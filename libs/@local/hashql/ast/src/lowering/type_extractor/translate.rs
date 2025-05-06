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

use crate::node::{
    self,
    path::{Path, PathSegmentArgument},
};

/// Represents a reference to either a type variable or a type node
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Reference<'ty, 'heap> {
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
enum Identity<'heap> {
    Structural,
    Nominal(Symbol<'heap>),
}

/// Represents a local type variable with its associated type information
struct LocalVariable<'heap> {
    id: Provisioned<TypeId>,
    r#type: node::r#type::Type<'heap>,
    identity: Identity<'heap>,
    arguments: TinyVec<GenericArgument<'heap>>,
}

/// Main context for type translation operations
///
/// The translation unit maintains all the context needed for translating AST type
/// nodes into the core type system, including environment, registry access,
/// and tracking of local variables and bound generic parameters.
struct TranslationUnit<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    locals: &'env FastHashMap<Symbol<'heap>, LocalVariable<'heap>>,
    bound_generics: TinyVec<GenericArgument<'heap>>,
}

impl<'heap> TranslationUnit<'_, 'heap> {
    /// Creates a nominal (named) type with its underlying representation
    ///
    /// Nominal types are identified by their name rather than structure, but still have an
    /// underlying representation.
    fn nominal(
        &self,
        name: Symbol<'heap>,
        mut arguments: TinyVec<GenericArgument<'heap>>,
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
    fn find_local(&self, ident: Ident<'heap>) -> Option<(TypeId, &[GenericArgument<'heap>])> {
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
        &self,
        parameter: &'arg PathSegmentArgument<'heap>,
    ) -> Reference<'arg, 'heap> {
        match parameter {
            node::path::PathSegmentArgument::Argument(generic_argument) => {
                Reference::Type(&generic_argument.r#type)
            }
            node::path::PathSegmentArgument::Constraint(generic_constraint) => {
                if generic_constraint.bound.is_some() {
                    todo!("record diagnostics, constraints in this position are not allowed");
                }

                Reference::Variable(generic_constraint.name)
            }
        }
    }

    /// Applies generic arguments to a base type
    ///
    /// This creates a type application by substituting concrete types for the generic parameters of
    /// the base type. It maps the provided parameters to the expected arguments and creates the
    /// appropriate substitutions.
    fn apply_reference(
        &self,
        base: TypeId,
        arguments: &[GenericArgument<'heap>],
        parameters: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap> {
        if parameters.len() != arguments.len() {
            todo!("record diagnostic - not enough or too many generic parameters")
        }

        let mut substitutions = TinyVec::with_capacity(parameters.len());

        for (&argument, parameter) in arguments.iter().zip(parameters.iter()) {
            // TODO: try to convert from generic constraint to path (but only if it
            // doesn't have a bound)
            let reference = self.convert_path_segment_argument(parameter);

            let value = self.reference(reference, TinyVec::new());

            substitutions.push(GenericSubstitution {
                argument: argument.id,
                value,
            });
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
        &self,
        ident: Ident<'heap>,
        parameters: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap> {
        let Some((base, arguments)) = self.find_local(ident) else {
            todo!("record diagnostic - unbound variable");
        };

        self.apply_reference(base, arguments, parameters)
    }

    /// Handles intrinsic type references like List and Dict
    ///
    /// Intrinsic types are built-in parameterized types with special semantics. This method
    /// resolves references to intrinsic types and constructs the appropriate type representation
    /// based on the provided parameters.
    #[expect(clippy::missing_asserts_for_indexing, reason = "false positive")]
    fn intrinsic(
        &self,
        name: &'static str,
        parameters: &[PathSegmentArgument<'heap>],
    ) -> TypeKind<'heap> {
        if name.starts_with("::kernel::special_form") {
            todo!("emit diagnostic, special forms no longer supported here")
        }

        match name {
            "::kernel::type::List" => {
                if parameters.len() != 1 {
                    todo!(
                        "emit diagnostic, expected 1 parameter, found {}",
                        parameters.len()
                    );
                }

                let reference = self.convert_path_segment_argument(&parameters[0]);
                let element = self.reference(reference, TinyVec::new());

                TypeKind::Intrinsic(IntrinsicType::List(ListType { element }))
            }
            "::kernel::type::Dict" => {
                if parameters.len() != 2 {
                    todo!(
                        "emit diagnostic, expected 2 parameters, found {}",
                        parameters.len()
                    );
                }

                let key = self.convert_path_segment_argument(&parameters[0]);
                let key = self.reference(key, TinyVec::new());

                let value = self.convert_path_segment_argument(&parameters[1]);
                let value = self.reference(value, TinyVec::new());

                TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value }))
            }
            _ => todo!("emit diagnostic, unknown intrinsic type"),
        }
    }

    /// Resolves a global type reference from a path
    ///
    /// Global references are paths like `::module::Type<T>` that need to be resolved through the
    /// module registry. This method handles both normal types and intrinsic types, and applies any
    /// generic parameters.
    fn global_reference(&self, path: &Path<'heap>) -> TypeKind<'heap> {
        let parameters = &path
            .segments
            .last()
            .unwrap_or_else(|| unreachable!("segments are always non-empty"))
            .arguments;

        let path = path.segments.iter().map(|segment| segment.name.value);

        let (base, arguments) = match self.registry.resolve(path, Universe::Type) {
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
            }) => return self.intrinsic(name, parameters),
            Ok(_) => todo!("emit diagnostic, invalid item, compiler bug"),
            Err(error) => {
                todo!("emit diagnostic, resolution error, compiler bug")
            }
        };

        self.apply_reference(base, arguments, parameters)
    }

    /// Translates an AST type kind into the core type system representation
    ///
    /// This is the main translation function that handles all the different type kinds (infer,
    /// path, tuple, struct, union, intersection) and converts them to the corresponding core type
    /// system representation.
    fn type_kind(
        &self,
        kind: &node::r#type::TypeKind<'heap>,
        mut arguments: TinyVec<GenericArgument<'heap>>,
    ) -> TypeKind<'heap> {
        match kind {
            node::r#type::TypeKind::Infer => {
                let hole = self.env.counter.hole.next();

                if !arguments.is_empty() {
                    todo!("record diagnostic")
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

                for node::r#type::StructField { name, r#type, .. } in &struct_type.fields {
                    fields.push(StructField {
                        name: name.value,
                        value: self.reference(Reference::Type(r#type), TinyVec::new()),
                    });
                }

                let fields = match self.env.intern_struct_fields(&mut fields) {
                    Ok(fields) => fields,
                    Err(duplicates) => {
                        todo!("record diagnostics")
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

    /// Translates a reference into a TypeId
    ///
    /// This is a dispatcher method that handles both variable references and type references,
    /// converting them to an interned TypeId.
    fn reference(
        &self,
        reference: Reference<'_, 'heap>,
        arguments: TinyVec<GenericArgument<'heap>>,
    ) -> TypeId {
        let kind = match reference {
            Reference::Variable(ident) => self.local_reference(ident, &[]),
            Reference::Type(r#type) => self.type_kind(&r#type.kind, arguments),
        };

        let partial = PartialType {
            span: reference.span(),
            kind: self.env.intern_kind(kind),
        };

        self.env.intern_type(partial)
    }

    /// Converts a local variable to its TypeId representation
    ///
    /// This method handles creating the appropriate type for a local variable, taking into account
    /// whether it has nominal or structural identity.
    fn variable(&self, variable: &LocalVariable<'heap>) -> TypeId {
        let kind = if let Identity::Nominal(name) = variable.identity {
            self.nominal(
                name,
                variable.arguments.clone(),
                Reference::Type(&variable.r#type),
            )
        } else {
            self.type_kind(&variable.r#type.kind, variable.arguments.clone())
        };

        let partial = PartialType {
            span: variable.r#type.span,
            kind: self.env.intern_kind(kind),
        };

        self.env.types.intern_provisioned(variable.id, partial).id
    }
}
