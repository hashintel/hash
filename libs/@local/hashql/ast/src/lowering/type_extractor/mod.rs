pub mod error;

use core::mem;
use std::borrow::Cow;

use hashql_core::{
    collection::{FastHashMap, SmallVec, TinyVec},
    intern::Provisioned,
    module::ModuleRegistry,
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, Type, TypeId,
        environment::Environment,
        kind::{
            Apply, Infer, IntersectionType, OpaqueType, Param, StructType, TupleType, TypeKind,
            UnionType,
            generic::{GenericArgument, GenericArgumentId, GenericArguments, GenericSubstitution},
            r#struct::StructField,
        },
    },
};

use self::error::{TypeExtractorDiagnostic, duplicate_newtype, duplicate_type_alias};
use crate::{
    node::{
        self,
        expr::{Expr, ExprKind, NewTypeExpr, TypeExpr},
        generic::GenericConstraint,
    },
    visit::{Visitor, walk_expr},
};

pub struct TypeEnvironment<'heap> {
    pub alias: FastHashMap<Symbol<'heap>, TypeId>,
    pub opaque: FastHashMap<Symbol<'heap>, TypeId>,
}

// TODO: I don't think these two need to be separate
#[derive(Debug, Default)]
struct ProvisionedTypeEnvironment<'heap> {
    alias: FastHashMap<Symbol<'heap>, Provisioned<TypeId>>,
    opaque: FastHashMap<Symbol<'heap>, Provisioned<TypeId>>,
}

struct Generics<'heap> {
    alias: FastHashMap<Symbol<'heap>, TinyVec<GenericArgument<'heap>>>,
    opaque: FastHashMap<Symbol<'heap>, TinyVec<GenericArgument<'heap>>>,
}

struct Scope<'a, 'heap> {
    provisioned: &'a ProvisionedTypeEnvironment<'heap>,
    generics: &'a Generics<'heap>,

    local_generics: TinyVec<GenericArgument<'heap>>, /* Generic arguments that are currently in
                                                      * scope */
}

impl<'heap> Scope<'_, 'heap> {
    fn local(
        &self,
        env: &Environment<'heap>,
        ident: Ident<'heap>,
    ) -> Option<(TypeId, &[GenericArgument<'heap>])> {
        // look through the generics, and see if there are any generics, that have a fitting name
        if let Some(&generic) = self
            .local_generics
            .iter()
            .find(|generic| generic.name == ident.value)
        {
            let param = env.intern_type(PartialType {
                span: ident.span,
                kind: env.intern_kind(TypeKind::Param(Param {
                    argument: generic.id,
                })),
            });

            // A generic does not have any arguments that can be slotted into
            return Some((param, &[]));
        }

        let order = [
            (&self.provisioned.alias, &self.generics.alias),
            (&self.provisioned.opaque, &self.generics.opaque),
        ];

        for (provisioned, generics) in order {
            // Look through the list of provisioned items, are there any that fit the bill?
            if let Some(&provisioned) = provisioned.get(&ident.value) {
                // The generics **must** be in the generics list as well, if it is in the
                // provisioned list
                let generics = generics
                    .get(&ident.value)
                    .expect("if provisioned this should exist");

                return Some((provisioned.value(), generics.as_slice()));
            }
        }

        // No match found, meaning it's an unbound variable
        None
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Mode<'heap> {
    Structural,
    Nominal(Symbol<'heap>),
}

pub struct TypeExtractor<'env, 'heap> {
    environment: &'env Environment<'heap>,
    modules: &'env ModuleRegistry<'heap>,

    alias: FastHashMap<Symbol<'heap>, TypeExpr<'heap>>,
    opaque: FastHashMap<Symbol<'heap>, NewTypeExpr<'heap>>,

    diagnostics: Vec<TypeExtractorDiagnostic>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
    #[must_use]
    pub fn new(
        environment: &'env Environment<'heap>,
        modules: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            environment,
            modules,

            alias: FastHashMap::default(),
            opaque: FastHashMap::default(),

            diagnostics: Vec::new(),
        }
    }

    fn provision(&self) -> ProvisionedTypeEnvironment<'heap> {
        let mut provisioned = ProvisionedTypeEnvironment {
            alias: FastHashMap::with_capacity_and_hasher(
                self.alias.len(),
                foldhash::fast::RandomState::default(),
            ),
            opaque: FastHashMap::with_capacity_and_hasher(
                self.opaque.len(),
                foldhash::fast::RandomState::default(),
            ),
        };

        for &name in self.alias.keys() {
            provisioned
                .alias
                .insert(name, self.environment.types.provision());
        }

        for &name in self.opaque.keys() {
            provisioned
                .opaque
                .insert(name, self.environment.types.provision());
        }

        provisioned
    }

    fn convert_generic_constraints(
        &self,
        constraints: &[GenericConstraint<'heap>],
    ) -> TinyVec<GenericArgument<'heap>> {
        let mut arguments = TinyVec::with_capacity(constraints.len());

        for GenericConstraint {
            id: _,
            span: _,
            name,
            bound,
        } in constraints
        {
            arguments.push(GenericArgument {
                id: self.environment.counter.generic_argument.next(),
                name: name.value,
                // TODO: these must be populated *after* the we got all the types in the generics
                // map
                constraint: None,
            });
        }

        arguments
    }

    fn generics(&self) -> Generics<'heap> {
        let mut generics = Generics {
            alias: FastHashMap::with_capacity_and_hasher(
                self.alias.len(),
                foldhash::fast::RandomState::default(),
            ),
            opaque: FastHashMap::with_capacity_and_hasher(
                self.opaque.len(),
                foldhash::fast::RandomState::default(),
            ),
        };

        for (&name, expr) in &self.alias {
            generics
                .alias
                .insert(name, self.convert_generic_constraints(&expr.constraints));
        }

        for (&name, expr) in &self.opaque {
            generics
                .opaque
                .insert(name, self.convert_generic_constraints(&expr.constraints));
        }

        generics
    }

    fn convert_nominal_type(
        &mut self,
        id: Option<Provisioned<TypeId>>,
        name: Symbol<'heap>,
        mut arguments: TinyVec<GenericArgument<'heap>>,
        repr: node::r#type::Type<'heap>,
        scope: &Scope<'_, 'heap>,
    ) -> TypeId {
        let span = repr.span;

        let repr = self.convert_type(None, TinyVec::new(), repr, scope);

        let kind = OpaqueType {
            name,
            repr,
            arguments: self.environment.intern_generic_arguments(&mut arguments),
        };

        let partial = PartialType {
            span,
            kind: self.environment.intern_kind(TypeKind::Opaque(kind)),
        };

        if let Some(id) = id {
            self.environment.types.intern_provisioned(id, partial).id
        } else {
            self.environment.intern_type(partial)
        }
    }

    fn convert_type(
        &mut self,
        id: Option<(Provisioned<TypeId>, Mode<'heap>)>,
        mut arguments: TinyVec<GenericArgument<'heap>>,
        r#type: node::r#type::Type<'heap>,
        scope: &Scope<'_, 'heap>,
    ) -> TypeId {
        let mode = id.map_or(Mode::Structural, |(_, mode)| mode);

        if let Mode::Nominal(name) = mode {
            return self.convert_nominal_type(id.map(|(id, _)| id), name, arguments, r#type, scope);
        }

        let kind = match r#type.kind {
            node::r#type::TypeKind::Infer => {
                let hole = self.environment.counter.hole.next();

                if !arguments.is_empty() {
                    todo!("record diagnostic")
                }

                TypeKind::Infer(Infer { hole })
            }
            node::r#type::TypeKind::Path(path) => {
                if let Some((name, parameters)) = path.as_generic_ident() {
                    let Some((base, arguments)) = scope.local(self.environment, name) else {
                        todo!("record diagnostic - unbound variable");
                    };

                    if parameters.len() != arguments.len() {
                        todo!("record diagnostic - not enough or too many generic parameters")
                    }

                    let mut substitutions = TinyVec::with_capacity(parameters.len());

                    for (&argument, parameter) in arguments.iter().zip(parameters.iter()) {
                        // TODO: try to convert from generic constraint to path (but only if it
                        // doesn't have a bound)

                        let value = self.convert_type(None, TinyVec::new(), todo!(), scope);

                        substitutions.push(GenericSubstitution {
                            argument: argument.id,
                            value,
                        });
                    }

                    TypeKind::Apply(Apply {
                        base,
                        substitutions: self
                            .environment
                            .intern_generic_substitutions(&mut substitutions),
                    })
                } else {
                    todo!("global lookup")
                }
            }
            node::r#type::TypeKind::Tuple(tuple_type) => {
                let mut elements = SmallVec::with_capacity(tuple_type.fields.len());

                for node::r#type::TupleField { r#type, .. } in tuple_type.fields {
                    // Any nested type has automatically no arguments
                    elements.push(self.convert_type(None, TinyVec::new(), r#type, scope));
                }

                TypeKind::Tuple(TupleType {
                    fields: self.environment.intern_type_ids(&elements),
                    arguments: self.environment.intern_generic_arguments(&mut arguments),
                })
            }
            node::r#type::TypeKind::Struct(struct_type) => {
                let mut fields = SmallVec::with_capacity(struct_type.fields.len());

                for node::r#type::StructField { name, r#type, .. } in struct_type.fields {
                    fields.push(StructField {
                        name: name.value,
                        value: self.convert_type(None, TinyVec::new(), r#type, scope),
                    });
                }

                let fields = match self.environment.intern_struct_fields(&mut fields) {
                    Ok(fields) => fields,
                    Err(duplicates) => {
                        todo!("record diagnostics")
                    }
                };

                TypeKind::Struct(StructType {
                    fields,
                    arguments: self.environment.intern_generic_arguments(&mut arguments),
                })
            }
            node::r#type::TypeKind::Union(union_type) => {
                let mut variants = SmallVec::with_capacity(union_type.types.len());

                for r#type in union_type.types {
                    variants.push(self.convert_type(None, arguments.clone(), r#type, scope));
                }

                TypeKind::Union(UnionType {
                    variants: self.environment.intern_type_ids(&variants),
                })
            }
            node::r#type::TypeKind::Intersection(intersection_type) => {
                let mut variants = SmallVec::with_capacity(intersection_type.types.len());

                for r#type in intersection_type.types {
                    variants.push(self.convert_type(None, arguments.clone(), r#type, scope));
                }

                TypeKind::Intersection(IntersectionType {
                    variants: self.environment.intern_type_ids(&variants),
                })
            }
        };

        let partial = PartialType {
            span: r#type.span,
            kind: self.environment.intern_kind(kind),
        };

        if let Some((id, _)) = id {
            self.environment.types.intern_provisioned(id, partial).id
        } else {
            self.environment.intern_type(partial)
        }
    }
}

impl<'heap> Visitor<'heap> for TypeExtractor<'_, 'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        if !matches!(expr.kind, ExprKind::Type(_) | ExprKind::NewType(_)) {
            walk_expr(self, expr);
            return;
        }

        let body = match mem::replace(&mut expr.kind, ExprKind::Dummy) {
            ExprKind::Type(mut expr) => {
                let name = expr.name.value;
                let span = expr.span;

                let body = mem::replace(&mut *expr.body, Expr::dummy());

                if let Err(error) = self.alias.try_insert(name, expr) {
                    let diagnostic = duplicate_type_alias(error.entry.get().span, span, name);
                    self.diagnostics.push(diagnostic);
                }

                body
            }
            ExprKind::NewType(mut expr) => {
                let name = expr.name.value;
                let span = expr.span;

                let body = mem::replace(&mut *expr.body, Expr::dummy());

                if let Err(error) = self.opaque.try_insert(name, expr) {
                    let diagnostic = duplicate_newtype(error.entry.get().span, span, name);
                    self.diagnostics.push(diagnostic);
                }

                body
            }
            _ => unreachable!(),
        };

        *expr = body;
        self.visit_expr(expr);
    }
}
