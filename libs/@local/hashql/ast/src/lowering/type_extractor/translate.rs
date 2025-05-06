use hashql_core::{
    collection::{FastHashMap, SmallVec, TinyVec},
    intern::Provisioned,
    module::{
        ModuleRegistry,
        item::{Item, ItemKind, Universe},
    },
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, TypeId,
        environment::Environment,
        kind::{
            Apply, GenericArgument, Infer, IntersectionType, OpaqueType, Param, StructType,
            TupleType, TypeKind, UnionType, generic::GenericSubstitution, r#struct::StructField,
        },
    },
};

use crate::node::{
    self,
    path::{Path, PathSegmentArgument},
};

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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Identity<'heap> {
    Structural,
    Nominal(Symbol<'heap>),
}

struct LocalVariable<'heap> {
    id: Provisioned<TypeId>,
    r#type: node::r#type::Type<'heap>,
    identity: Identity<'heap>,
    arguments: TinyVec<GenericArgument<'heap>>,
}

struct TranslationUnit<'env, 'heap> {
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,

    locals: &'env FastHashMap<Symbol<'heap>, LocalVariable<'heap>>,
    bound_generics: TinyVec<GenericArgument<'heap>>,
}

impl<'heap> TranslationUnit<'_, 'heap> {
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
            let reference = match parameter {
                node::path::PathSegmentArgument::Argument(generic_argument) => {
                    Reference::Type(&generic_argument.r#type)
                }
                node::path::PathSegmentArgument::Constraint(generic_constraint) => {
                    if generic_constraint.bound.is_some() {
                        todo!("record diagnostics, constraints in this position are not allowed");
                    }

                    Reference::Variable(generic_constraint.name)
                }
            };

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
            Ok(_) => todo!("emit diagnostic, invalid item, compiler bug"),
            Err(error) => {
                todo!("emit diagnostic, resolution error, compiler bug")
            }
        };

        self.apply_reference(base, arguments, parameters)
    }

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
                // TODO: what if we have a path with generic arguments?! I know we have apply, but
                // we have nowhere to stick the generics to, if it's a simple type alias, e.g. `type
                // Foo<T> = Bar<T, String>` will fail, because we have nowhere to define `Foo<T>` as
                // a generic, opaques have the ability to define these, aliases don't. We would
                // require an `Alias` node that does it for us, but that's uber-messy, even then we
                // wouldn't be able to handle additional constraints on said type.

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
