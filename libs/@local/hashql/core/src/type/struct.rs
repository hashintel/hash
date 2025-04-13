use std::collections::HashMap;

use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    generic_argument::GenericArguments,
    pretty_print::{PrettyPrint, RecursionLimit},
    unify::{UnificationArena, UnificationContext},
    unify_type,
};
use crate::symbol::Ident;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructField {
    pub key: Ident,
    pub value: TypeId,
}

impl PrettyPrint for StructField {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text(self.key.value.as_str())
            .append(RcDoc::text(":"))
            .append(RcDoc::line())
            .append(limit.pretty(&arena[self.value], arena))
            .group()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructType {
    // Any extends is resolved in a previous pass
    pub fields: EcoVec<StructField>,

    pub arguments: GenericArguments,
}

impl PrettyPrint for StructType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> RcDoc<'a, anstyle::Style> {
        let inner = if self.fields.is_empty() {
            RcDoc::text("(:)")
        } else {
            RcDoc::text("(")
                .append(
                    RcDoc::intersperse(
                        self.fields.iter().map(|field| field.pretty(arena, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(")"))
        };

        self.arguments.pretty(arena, limit).append(inner).group()
    }
}

/// Unifies struct types
///
/// In a covariant context:
/// - rhs must have at least all the fields that lhs has (width subtyping).
/// - Field types must respect covariance (rhs fields must be subtypes of left field types)
pub(crate) fn unify_struct(
    context: &mut UnificationContext,
    lhs: &Type<StructType>,
    rhs: &Type<StructType>,
) {
    // Enter generic argument scope for both structs
    lhs.kind.arguments.enter_scope(context);
    rhs.kind.arguments.enter_scope(context);

    // Maps for fast lookups of fields by key
    let rhs_by_key: HashMap<_, _> = rhs
        .kind
        .fields
        .iter()
        .map(|field| (field.key.value.clone(), field))
        .collect();

    // In a strictly variance-aware system:
    // - rhs must have all fields of lhs (width subtyping)
    // - Field types must respect the current variance context

    // Check if all lhs fields exist in rhs
    let mut missing_fields = false;
    for lhs_field in &lhs.kind.fields {
        if let Some(rhs_field) = rhs_by_key.get(&lhs_field.key.value) {
            // This field exists in both structs - unify the field types
            // Fields are in covariant position within a struct
            context.in_covariant(|ctx| {
                unify_type(ctx, lhs_field.value, rhs_field.value);
            });
        } else {
            // The covariance of lhs <: rhs is violated
            let diagnostic = super::error::type_mismatch(
                context.source,
                &context.arena,
                lhs,
                rhs,
                Some(&format!(
                    "Missing required field '{}'. The struct being used is missing fields that \
                     are required by the expected type.",
                    lhs_field.key.value
                )),
            );

            context.record_diagnostic(diagnostic);
            missing_fields = true;
        }
    }

    if missing_fields {
        context.mark_error(lhs.id);
        context.mark_error(rhs.id);
    }

    lhs.kind.arguments.exit_scope(context);
    rhs.kind.arguments.exit_scope(context);

    // In a strictly variance-aware system, we do NOT modify the struct types
    // Each struct maintains its original fields, preserving the subtyping relationship
}

#[cfg(test)]
mod tests {
    use super::{StructField, StructType};
    use crate::r#type::{
        TypeKind,
        generic_argument::{GenericArgument, GenericArgumentId, GenericArguments},
        primitive::PrimitiveType,
        r#struct::unify_struct,
        test::{ident, instantiate, setup},
    };

    #[test]
    fn identical_structs_unify() {
        let mut context = setup();

        // Create a struct with two fields: name: String, age: Number
        let lhs_fields = [
            StructField {
                key: ident("name"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
            },
            StructField {
                key: ident("age"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
            },
        ];

        let lhs_id = instantiate(
            &mut context,
            TypeKind::Struct(StructType {
                fields: lhs_fields.into(),
                arguments: GenericArguments::new(),
            }),
        );

        let rhs_fields = [
            StructField {
                key: ident("name"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
            },
            StructField {
                key: ident("age"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
            },
        ];

        let rhs_id = instantiate(
            &mut context,
            TypeKind::Struct(StructType {
                fields: rhs_fields.into(),
                arguments: GenericArguments::new(),
            }),
        );

        let lhs = context.arena[lhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));
        let rhs = context.arena[rhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));

        unify_struct(&mut context, &lhs, &rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify identical structs"
        );

        // Check both structs maintained their fields
        let lhs = context.arena[lhs_id].clone();
        let rhs = context.arena[rhs_id].clone();

        let TypeKind::Struct(lhs) = lhs.kind else {
            panic!("type should be a struct");
        };

        let TypeKind::Struct(rhs) = rhs.kind else {
            panic!("type should be a struct");
        };

        assert_eq!(lhs.fields.len(), rhs.fields.len());
        assert_eq!(
            lhs.fields
                .iter()
                .map(|field| (
                    field.key.value.clone(),
                    context.arena[field.value].kind.clone()
                ))
                .collect::<Vec<_>>(),
            rhs.fields
                .iter()
                .map(|field| (
                    field.key.value.clone(),
                    context.arena[field.value].kind.clone()
                ))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn overlapping_structs_unify() {
        let mut context = setup();

        // Create two structs with overlapping fields:
        // lhs: (name: String, age: Number)
        // rhs: (name: String, age: Number, id: Number)
        let lhs_fields = [
            StructField {
                key: ident("name"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
            },
            StructField {
                key: ident("age"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
            },
        ];

        let lhs_type = StructType {
            fields: lhs_fields.into(),
            arguments: GenericArguments::default(),
        };

        let rhs_fields = [
            StructField {
                key: ident("name"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
            },
            StructField {
                key: ident("age"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
            },
            StructField {
                key: ident("id"),
                value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
            },
        ];

        let rhs_type = StructType {
            fields: rhs_fields.into(),
            arguments: GenericArguments::default(),
        };

        let lhs_id = instantiate(&mut context, TypeKind::Struct(lhs_type));
        let rhs_id = instantiate(&mut context, TypeKind::Struct(rhs_type));

        let lhs = context.arena[lhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));
        let rhs = context.arena[rhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));

        unify_struct(&mut context, &lhs, &rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify structs with overlapping fields"
        );
    }

    #[test]
    fn struct_field_types_unify() {
        let mut context = setup();

        // Create structs with a field that needs type promotion:
        // lhs: { value: Number }
        // rhs: { value: Integer }
        let lhs_field = StructField {
            key: ident("value"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        };
        let rhs_field = StructField {
            key: ident("value"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer)),
        };

        let lhs_type = StructType {
            fields: [lhs_field].into(),
            arguments: GenericArguments::default(),
        };
        let rhs_type = StructType {
            fields: [rhs_field].into(),
            arguments: GenericArguments::default(),
        };

        let lhs_id = instantiate(&mut context, TypeKind::Struct(lhs_type));
        let rhs_id = instantiate(&mut context, TypeKind::Struct(rhs_type));

        let lhs = context.arena[lhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));
        let rhs = context.arena[rhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));

        unify_struct(&mut context, &lhs, &rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify structs with unifiable field types"
        );

        // Check that Integer was promoted to Number in both structs
        let lhs = context.arena[lhs_id].clone();
        let rhs = context.arena[rhs_id].clone();

        if let TypeKind::Struct(lhs_struct) = lhs.kind {
            let field_type = &context.arena[lhs_struct.fields[0].value].kind;
            assert!(
                matches!(field_type, TypeKind::Primitive(PrimitiveType::Number)),
                "LHS field type should be promoted to Number"
            );
        }

        if let TypeKind::Struct(rhs_struct) = rhs.kind {
            let field_type = &context.arena[rhs_struct.fields[0].value].kind;
            assert!(
                matches!(field_type, TypeKind::Primitive(PrimitiveType::Integer)),
                "RHS field type should be an Integer"
            );
        }
    }

    #[test]
    fn disjoint_structs_unify_to_empty() {
        let mut context = setup();

        // Create structs with no fields in common:
        // lhs: { name: String }
        // rhs: { age: Number }
        let name_field = StructField {
            key: ident("name"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
        };
        let age_field = StructField {
            key: ident("age"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        };

        let lhs_type = StructType {
            fields: vec![name_field].into(),
            arguments: GenericArguments::default(),
        };
        let rhs_type = StructType {
            fields: vec![age_field].into(),
            arguments: GenericArguments::default(),
        };

        let lhs_id = instantiate(&mut context, TypeKind::Struct(lhs_type));
        let rhs_id = instantiate(&mut context, TypeKind::Struct(rhs_type));

        let lhs = context.arena[lhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));
        let rhs = context.arena[rhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));

        unify_struct(&mut context, &lhs, &rhs);

        assert!(
            !context.take_diagnostics().is_empty(),
            "Disjoint structs are not covariant"
        );
    }

    #[test]
    fn generic_struct_args_scope() {
        let mut context = setup();

        // Create a generic argument T
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let t_arg = GenericArgument {
            id: t_id,
            name: ident("T"),
            constraint: None,
            r#type: t_type,
        };

        // Create structs with generic field:
        // lhs: { value: T }
        let lhs_field = StructField {
            key: ident("value"),
            value: t_type,
        };

        let lhs_type = StructType {
            fields: vec![lhs_field].into(),
            arguments: GenericArguments::from_iter([t_arg]),
        };

        // rhs: { value: Number }
        let rhs_field = StructField {
            key: ident("value"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        };

        let rhs_type = StructType {
            fields: vec![rhs_field].into(),
            arguments: GenericArguments::new(),
        };

        let lhs_id = instantiate(&mut context, TypeKind::Struct(lhs_type));
        let rhs_id = instantiate(&mut context, TypeKind::Struct(rhs_type));

        // Verify arg is not in scope before unification
        assert!(context.generic_argument(t_id).is_none());

        let lhs = context.arena[lhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));
        let rhs = context.arena[rhs_id]
            .clone()
            .map(|kind| kind.into_struct().expect("type should be a struct"));

        unify_struct(&mut context, &lhs, &rhs);

        // Verify arg was properly removed from scope after unification
        assert!(context.generic_argument(t_id).is_none());

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify struct with generic argument"
        );

        // Check that both structs maintained their field
        let lhs = context.arena[lhs_id].clone();
        let rhs = context.arena[rhs_id].clone();

        if let TypeKind::Struct(lhs_struct) = lhs.kind {
            assert_eq!(lhs_struct.fields.len(), 1);
            assert_eq!(lhs_struct.fields[0].key, ident("value"));
        }

        if let TypeKind::Struct(rhs_struct) = rhs.kind {
            assert_eq!(rhs_struct.fields.len(), 1);
            assert_eq!(rhs_struct.fields[0].key, ident("value"));
        }
    }
}
