use oxc::{
    allocator::Allocator,
    ast::{AstBuilder, ast},
    codegen::Codegen,
    span::SPAN,
};

use crate::{
    TypeCollection,
    definitions::{Enum, EnumTagging, EnumVariant, Fields, Primitive, Type, TypeDefinition},
};

#[derive(Default)]
#[non_exhaustive]
pub struct TypeScriptGeneratorSettings {
    allocator: Allocator,
}

#[expect(dead_code)]
pub struct TypeScriptGenerator<'a> {
    settings: &'a TypeScriptGeneratorSettings,
    collection: TypeCollection,
    ast: AstBuilder<'a>,
}

impl<'a> TypeScriptGenerator<'a> {
    pub const fn new(
        settings: &'a TypeScriptGeneratorSettings,
        collection: TypeCollection,
    ) -> Self {
        Self {
            settings,
            collection,
            ast: AstBuilder {
                allocator: &settings.allocator,
            },
        }
    }

    #[must_use]
    pub fn generate(&self, name: &str) -> String {
        Codegen::new()
            .build(
                &self.ast.program(
                    SPAN,
                    ast::SourceType::d_ts(),
                    "test",
                    self.ast.vec(),
                    None,
                    self.ast.vec(),
                    self.ast.vec1(
                        self.visit_type_definition(name, &self.collection.types[name].1)
                            .into(),
                    ),
                ),
            )
            .code
    }

    fn visit_type_definition(
        &self,
        name: &str,
        definition: &TypeDefinition,
    ) -> ast::Declaration<'a> {
        self.ast.declaration_ts_type_alias(
            SPAN,
            self.ast.binding_identifier(SPAN, name),
            None::<ast::TSTypeParameterDeclaration<'a>>,
            self.visit_type(&definition.r#type),
            false,
        )
    }

    fn visit_primitive(&self, primitive: &Primitive) -> ast::TSType<'a> {
        match primitive {
            &Primitive::Boolean => self.ast.ts_type_boolean_keyword(SPAN),
            Primitive::Number => self.ast.ts_type_number_keyword(SPAN),
            Primitive::String => self.ast.ts_type_string_keyword(SPAN),
        }
    }

    fn visit_fields(&self, variant: &Fields) -> ast::TSType<'a> {
        match variant {
            Fields::Unit => self.ast.ts_type_null_keyword(SPAN),
            Fields::Named { fields } => {
                let mut members = self.ast.vec();
                for (field_name, field) in fields {
                    members.push(
                        self.ast.ts_signature_property_signature(
                            SPAN,
                            false, // computed
                            false, // optional
                            false, // read-only
                            self.ast
                                .property_key_static_identifier(SPAN, field_name.as_ref()),
                            Some(
                                self.ast
                                    .alloc_ts_type_annotation(SPAN, self.visit_type(&field.r#type)),
                            ),
                        ),
                    );
                }
                self.ast.ts_type_type_literal(SPAN, members)
            }
            Fields::Unnamed { fields } => match fields.as_slice() {
                [field] => self.visit_type(&field.r#type),
                fields => {
                    let mut members = self.ast.vec();
                    for field in fields {
                        members.push(self.visit_type(&field.r#type).into());
                    }
                    self.ast.ts_type_tuple_type(SPAN, members)
                }
            },
        }
    }

    fn visit_externally_tagged_enum_variant(&self, variant: &EnumVariant) -> ast::TSType<'a> {
        match &variant.fields {
            Fields::Unit => self.ast.ts_type_literal_type(
                SPAN,
                self.ast
                    .ts_literal_string_literal(SPAN, variant.name.as_ref(), None),
            ),
            Fields::Named { .. } | Fields::Unnamed { .. } => {
                self.ast.ts_type_type_literal(
                    SPAN,
                    self.ast.vec1(
                        self.ast.ts_signature_property_signature(
                            SPAN,
                            false, // computed
                            false, // optional
                            false, // readonly
                            self.ast
                                .property_key_static_identifier(SPAN, variant.name.as_ref()),
                            Some(self.ast.alloc_ts_type_annotation(
                                SPAN,
                                self.visit_fields(&variant.fields),
                            )),
                        ),
                    ),
                )
            }
        }
    }

    fn visit_internally_tagged_enum_variant(
        &self,
        variant: &EnumVariant,
        tag: &str,
    ) -> ast::TSType<'a> {
        let mut members = self.ast.vec1(
            self.ast.ts_signature_property_signature(
                SPAN,
                false, // computed
                false, // optional
                false, // read-only
                self.ast.property_key_static_identifier(SPAN, tag),
                Some(
                    self.ast.alloc_ts_type_annotation(
                        SPAN,
                        self.ast.ts_type_literal_type(
                            SPAN,
                            self.ast
                                .ts_literal_string_literal(SPAN, variant.name.as_ref(), None),
                        ),
                    ),
                ),
            ),
        );

        match &variant.fields {
            Fields::Unit => {}
            Fields::Named { fields } => {
                for (field_name, field) in fields {
                    members.push(
                        self.ast.ts_signature_property_signature(
                            SPAN,
                            false, // computed
                            false, // optional
                            false, // readonly
                            self.ast
                                .property_key_static_identifier(SPAN, field_name.as_ref()),
                            Some(
                                self.ast
                                    .alloc_ts_type_annotation(SPAN, self.visit_type(&field.r#type)),
                            ),
                        ),
                    );
                }
            }
            Fields::Unnamed { fields: _ } => {
                unimplemented!("Internally tagged tuple-variant `{}`", variant.name);
            }
        }

        self.ast.ts_type_type_literal(SPAN, members)
    }

    fn visit_adjacently_tagged_enum_variant(
        &self,
        variant: &EnumVariant,
        tag: &str,
        content: &str,
    ) -> ast::TSType<'a> {
        let mut members = self.ast.vec1(
            self.ast.ts_signature_property_signature(
                SPAN,
                false, // computed
                false, // optional
                false, // readonly
                self.ast.property_key_static_identifier(SPAN, tag),
                Some(
                    self.ast.alloc_ts_type_annotation(
                        SPAN,
                        self.ast.ts_type_literal_type(
                            SPAN,
                            self.ast
                                .ts_literal_string_literal(SPAN, variant.name.as_ref(), None),
                        ),
                    ),
                ),
            ),
        );

        if !matches!(variant.fields, Fields::Unit) {
            members.push(
                self.ast.ts_signature_property_signature(
                    SPAN,
                    false, // computed
                    false, // optional
                    false, // readonly
                    self.ast.property_key_static_identifier(SPAN, content),
                    Some(
                        self.ast
                            .alloc_ts_type_annotation(SPAN, self.visit_fields(&variant.fields)),
                    ),
                ),
            );
        }
        self.ast.ts_type_type_literal(SPAN, members)
    }

    fn visit_enum_variant(&self, variant: &EnumVariant, tagging: &EnumTagging) -> ast::TSType<'a> {
        match tagging {
            EnumTagging::Untagged => self.visit_fields(&variant.fields),
            EnumTagging::External => self.visit_externally_tagged_enum_variant(variant),
            EnumTagging::Internal { tag } => {
                self.visit_internally_tagged_enum_variant(variant, tag)
            }
            EnumTagging::Adjacent { tag, content } => {
                self.visit_adjacently_tagged_enum_variant(variant, tag, content)
            }
        }
    }

    fn visit_enum(&self, enum_type: &Enum) -> ast::TSType<'a> {
        let mut types = self.ast.vec();

        for variant in &enum_type.variants {
            types.push(self.visit_enum_variant(variant, &enum_type.tagging));
        }

        self.ast.ts_type_union_type(SPAN, types)
    }

    fn visit_type(&self, r#type: &Type) -> ast::TSType<'a> {
        match r#type {
            Type::Primitive(primitive) => self.visit_primitive(primitive),
            Type::Enum(enum_type) => self.visit_enum(enum_type),
            Type::Reference(name) => self.ast.ts_type_type_reference(
                SPAN,
                self.ast
                    .ts_type_name_identifier_reference(SPAN, name.as_ref()),
                None::<ast::TSTypeParameterInstantiation<'a>>,
            ),
            Type::List(name) => self.ast.ts_type_array_type(SPAN, self.visit_type(name)),
            Type::Optional(name) => {
                self.ast
                    .ts_type_js_doc_nullable_type(SPAN, self.visit_type(name), true)
            }
        }
    }
}
