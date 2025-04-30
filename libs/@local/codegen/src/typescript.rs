use oxc::{
    allocator::Allocator,
    ast::{AstBuilder, ast},
    codegen::Codegen,
    span::SPAN,
};

use crate::{
    TypeCollection,
    definitions::{
        Enum, EnumTagging, EnumVariant, Fields, List, Map, Primitive, Struct, Tuple, Type,
        TypeDefinition,
    },
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
                    "unnamed",
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

    fn visit_reference(&self, reference: &str) -> ast::TSType<'a> {
        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, reference),
            None::<ast::TSTypeParameterInstantiation<'a>>,
        )
    }

    fn visit_fields(&self, variant: &Fields) -> ast::TSType<'a> {
        match variant {
            Fields::Unit => self.ast.ts_type_null_keyword(SPAN),
            Fields::Named { fields } => {
                let mut members = self.ast.vec();
                // TODO: Cache generated members to avoid redundant computations
                //   see https://linear.app/hash/issue/H-4500/cache-generated-types-for-future-re-use
                let mut flattened_members = self.ast.vec();
                for (field_name, field) in fields {
                    if field.flatten {
                        flattened_members.push(self.visit_type(&field.r#type));
                        continue;
                    }
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
                let fields = self.ast.ts_type_type_literal(SPAN, members);
                if flattened_members.is_empty() {
                    fields
                } else {
                    flattened_members.insert(0, fields);
                    self.ast.ts_type_intersection_type(SPAN, flattened_members)
                }
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

        let mut flattened_members = self.ast.vec();
        match &variant.fields {
            Fields::Unit => {}
            Fields::Named { fields } => {
                for (field_name, field) in fields {
                    if field.flatten {
                        flattened_members.push(self.visit_type(&field.r#type));
                        continue;
                    }
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
            Fields::Unnamed { fields } => match fields.as_slice() {
                [field] => {
                    flattened_members.push(self.visit_type(&field.r#type));
                }
                _ => unimplemented!("Internally tagged tuple-variant `{}`", variant.name),
            },
        }

        let fields = self.ast.ts_type_type_literal(SPAN, members);
        if flattened_members.is_empty() {
            fields
        } else {
            flattened_members.insert(0, fields);
            self.ast.ts_type_intersection_type(SPAN, flattened_members)
        }
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

    fn visit_struct(&self, struct_type: &Struct) -> ast::TSType<'a> {
        self.visit_fields(&struct_type.fields)
    }

    fn visit_map(&self, map: &Map) -> ast::TSType<'a> {
        let mut params = self.ast.vec();
        params.push(self.visit_type(&map.key));
        params.push(self.visit_type(&map.value));

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "Record"),
            Some(self.ast.ts_type_parameter_instantiation(SPAN, params)),
        )
    }

    fn visit_tuple(&self, tuple: &Tuple) -> ast::TSType<'a> {
        let mut elements = self.ast.vec();
        for element in &tuple.elements {
            elements.push(self.visit_type(element).into());
        }

        self.ast.ts_type_tuple_type(SPAN, elements)
    }

    fn visit_list(&self, list: &List) -> ast::TSType<'a> {
        self.ast
            .ts_type_array_type(SPAN, self.visit_type(&list.r#type))
    }

    fn visit_optional(&self, optional: &Type) -> ast::TSType<'a> {
        // TODO: Properly implement optional handling
        //   see https://linear.app/hash/issue/H-4457/capture-field-optionality-in-codegen
        let mut types = self.ast.vec();
        types.push(self.visit_type(optional));
        types.push(self.ast.ts_type_undefined_keyword(SPAN));

        self.ast
            .ts_type_parenthesized_type(SPAN, self.ast.ts_type_union_type(SPAN, types))
    }

    fn visit_type(&self, r#type: &Type) -> ast::TSType<'a> {
        match r#type {
            Type::Primitive(primitive) => self.visit_primitive(primitive),
            Type::Enum(enum_type) => self.visit_enum(enum_type),
            Type::Struct(struct_type) => self.visit_struct(struct_type),
            Type::Reference(reference) => self.visit_reference(reference),
            Type::Tuple(tuple) => self.visit_tuple(tuple),
            Type::List(list) => self.visit_list(list),
            Type::Map(map) => self.visit_map(map),
            Type::Optional(optional) => self.visit_optional(optional),
        }
    }
}
