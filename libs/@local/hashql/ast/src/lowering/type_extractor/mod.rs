pub mod error;

use core::mem;

use hashql_core::{
    collection::{FastHashMap, SmallVec},
    intern::Provisioned,
    module::ModuleRegistry,
    symbol::Symbol,
    r#type::{
        PartialType, TypeId,
        environment::Environment,
        kind::{
            Infer, IntersectionType, StructType, TupleType, TypeKind, UnionType,
            generic_argument::{GenericArgumentId, GenericArguments},
            r#struct::StructField,
        },
    },
};

use self::error::{TypeExtractorDiagnostic, duplicate_newtype, duplicate_type_alias};
use crate::{
    node::{
        self,
        expr::{Expr, ExprKind, NewTypeExpr, TypeExpr},
        r#type::{TupleField, Type},
    },
    visit::{Visitor, walk_expr},
};

pub struct TypeEnvironment<'heap> {
    pub alias: FastHashMap<Symbol<'heap>, TypeId>,
    pub opaque: FastHashMap<Symbol<'heap>, TypeId>,
}

struct ProvisionedTypeEnvironment<'heap> {
    alias: FastHashMap<Symbol<'heap>, Provisioned<TypeId>>,
    opaque: FastHashMap<Symbol<'heap>, Provisioned<TypeId>>,
}

struct Generics<'heap>(FastHashMap<Symbol<'heap>, GenericArgumentId>);

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

    fn convert_type(
        &mut self,
        r#type: Type<'heap>,
        provisioned: &ProvisionedTypeEnvironment<'heap>,
        generics: &Generics<'heap>,
    ) -> TypeId {
        let kind = match r#type.kind {
            node::r#type::TypeKind::Infer => {
                let hole = self.environment.counter.hole.next();

                TypeKind::Infer(Infer { hole })
            }
            node::r#type::TypeKind::Path(path) => {
                // Check first if the path is a single segment, in that case we can take a look
                // at the provisioned values, to see if it already exists, and if that is the case
                // use that. Now the problem is that we're unable to link any generics. I guess we'd
                // need to instantiate the type, then create a substitution of the generics?
                todo!()
            }
            node::r#type::TypeKind::Tuple(tuple_type) => {
                let mut elements = SmallVec::with_capacity(tuple_type.fields.len());

                for TupleField { r#type, .. } in tuple_type.fields {
                    elements.push(self.convert_type(r#type, provisioned, generics));
                }

                TypeKind::Tuple(TupleType {
                    fields: self.environment.intern_type_ids(&elements),
                    arguments: GenericArguments::empty(),
                })
            }
            node::r#type::TypeKind::Struct(struct_type) => {
                let mut fields = SmallVec::with_capacity(struct_type.fields.len());

                for node::r#type::StructField { name, r#type, .. } in struct_type.fields {
                    fields.push(StructField {
                        name: name.value,
                        value: self.convert_type(r#type, provisioned, generics),
                    });
                }

                match self.environment.intern_struct_fields(&mut fields) {
                    Ok(fields) => TypeKind::Struct(StructType {
                        fields,
                        arguments: GenericArguments::empty(),
                    }),
                    Err(duplicates) => {
                        todo!("record error")
                    }
                }
            }
            node::r#type::TypeKind::Union(union_type) => {
                let mut variants = SmallVec::with_capacity(union_type.types.len());

                for r#type in union_type.types {
                    variants.push(self.convert_type(r#type, provisioned, generics));
                }

                TypeKind::Union(UnionType {
                    variants: self.environment.intern_type_ids(&variants),
                })
            }
            node::r#type::TypeKind::Intersection(intersection_type) => {
                let mut variants = SmallVec::with_capacity(intersection_type.types.len());

                for r#type in intersection_type.types {
                    variants.push(self.convert_type(r#type, provisioned, generics));
                }

                TypeKind::Intersection(IntersectionType {
                    variants: self.environment.intern_type_ids(&variants),
                })
            }
        };

        self.environment.intern_type(PartialType {
            span: r#type.span,
            kind: self.environment.intern_kind(kind),
        })
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
