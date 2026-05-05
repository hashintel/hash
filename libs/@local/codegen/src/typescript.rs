use oxc::{
    allocator::Allocator,
    ast::{
        AstBuilder,
        ast::{self, TSTupleElement},
    },
    codegen::Codegen,
    span::{Atom, SPAN},
};
use specta::NamedType;

use crate::{
    TypeCollection,
    definitions::{
        Enum, EnumTagging, EnumVariant, Fields, List, Map, Primitive, Struct, Tuple, Type,
        TypeDefinition, TypeId,
    },
};

#[derive(Default)]
#[non_exhaustive]
pub struct TypeScriptGeneratorSettings {
    allocator: Allocator,
}

#[expect(dead_code)]
pub struct TypeScriptGenerator<'a, 'c> {
    settings: &'a TypeScriptGeneratorSettings,
    collection: &'c TypeCollection,
    ast: AstBuilder<'a>,
    program: ast::Program<'a>,
    has_branded_types: bool,
}

impl<'a, 'c> TypeScriptGenerator<'a, 'c> {
    pub fn new(settings: &'a TypeScriptGeneratorSettings, collection: &'c TypeCollection) -> Self {
        let ast_builder = AstBuilder::new(&settings.allocator);
        let program = ast_builder.program(
            SPAN,
            ast::SourceType::d_ts(),
            "unnamed",
            ast_builder.vec(),
            None,
            ast_builder.vec(),
            ast_builder.vec(),
        );
        Self {
            settings,
            collection,
            ast: ast_builder,
            program,
            has_branded_types: false,
        }
    }

    pub fn add_import_declaration(
        &mut self,
        module: &str,
        specifiers: impl IntoIterator<Item = &'a str>,
    ) {
        self.program.body.push(
            self.ast
                .module_declaration_import_declaration(
                    SPAN,
                    Some(
                        self.ast
                            .vec_from_iter(specifiers.into_iter().map(|specifier| {
                                self.ast.import_declaration_specifier_import_specifier(
                                    SPAN,
                                    self.ast.module_export_name_identifier_name(SPAN, specifier),
                                    self.ast.binding_identifier(SPAN, specifier),
                                    ast::ImportOrExportKind::Value,
                                )
                            })),
                    ),
                    self.ast.string_literal(SPAN, self.ast.str(module), None),
                    None,
                    None::<ast::WithClause<'a>>,
                    ast::ImportOrExportKind::Type,
                )
                .into(),
        );
    }

    /// Generates TypeScript code from the provided type collection.
    pub fn write(self) -> String {
        Codegen::new().build(&self.program).code
    }

    /// Adds a type declaration to the program body by its `TypeId`.
    ///
    /// # Panics
    ///
    /// Panics if the `TypeId` does not exist in the type collection.
    pub fn add_type_declaration_by_id(&mut self, id: TypeId) {
        let definition = self
            .collection
            .types
            .get(&id)
            .expect("type collection should contain the type");
        let type_declaration = self.visit_type_definition(definition);
        self.program.body.push(if definition.public {
            ast::Statement::ExportNamedDeclaration(self.ast.alloc_export_named_declaration(
                SPAN,
                Some(type_declaration),
                self.ast.vec(),
                None,
                ast::ImportOrExportKind::Type,
                None::<ast::WithClause<'a>>,
            ))
        } else {
            type_declaration.into()
        });
    }

    pub fn add_type_declaration<T: NamedType>(&mut self) {
        self.add_type_declaration_by_id(TypeId::from_specta(T::ID));
    }

    fn can_be_used_in_interface_extend(&self, r#type: &Type) -> bool {
        match r#type {
            Type::Reference(type_id) => self.can_be_used_in_interface_extend(
                &self
                    .collection
                    .types
                    .get(type_id)
                    .unwrap_or_else(|| {
                        panic!(
                            "Reference {:?} not found. Ensure all referenced types are registered \
                             or use `register_transitive_types()` first.",
                            self.collection
                                .collection
                                .get(type_id.to_specta())
                                .map_or_else(
                                    || format!("{type_id:?}"),
                                    |data_type| data_type.name().to_string()
                                )
                        )
                    })
                    .r#type,
            ),
            r#type @ (Type::Primitive(_)
            | Type::Enum(_)
            | Type::Struct(_)
            | Type::Tuple(_)
            | Type::List(_)
            | Type::NonEmptyList(_)
            | Type::Map(_)
            | Type::Nullable(_)) => self.should_export_as_interface(r#type),
        }
    }

    fn should_export_as_interface(&self, r#type: &Type) -> bool {
        match r#type {
            Type::Struct(r#struct) => {
                if let Fields::Named {
                    fields,
                    deny_unknown: true,
                } = &r#struct.fields
                {
                    !fields.iter().any(|(_, field)| {
                        field.flatten && !self.can_be_used_in_interface_extend(&field.r#type)
                    })
                } else {
                    false
                }
            }
            Type::Reference(_)
            | Type::Primitive(_)
            | Type::Enum(_)
            | Type::Tuple(_)
            | Type::List(_)
            | Type::NonEmptyList(_)
            | Type::Map(_)
            | Type::Nullable(_) => false,
        }
    }

    fn visit_type_definition(&mut self, definition: &TypeDefinition) -> ast::Declaration<'a> {
        if !definition.branded && self.should_export_as_interface(&definition.r#type) {
            self.generate_interface(definition)
        } else {
            let mut r#type: ast::TSType<'a> = self.visit_type(&definition.r#type);

            if definition.branded {
                if !self.has_branded_types {
                    self.has_branded_types = true;
                    self.add_import_declaration("@blockprotocol/type-system-rs", ["Brand"]);
                }

                // This extends the `UserId` type by intersecting it with the `WebId` type. We
                // currently, don't have a way to represent the `UserId` type in the
                // AST, so we have to do this manually.
                // TODO: Allow this to be done from the Rust code directly
                //   see https://linear.app/hash/issue/H-4514/allow-specifying-type-branding-in-rust-itself
                if definition.module == "type_system::principal::actor::user"
                    && definition.name == "UserId"
                {
                    r#type = self.ast.ts_type_intersection_type(
                        SPAN,
                        self.ast.vec_from_array([
                            r#type,
                            self.ast.ts_type_type_reference(
                                SPAN,
                                self.ast.ts_type_name_identifier_reference(
                                    SPAN,
                                    Atom::new_const("WebId"),
                                ),
                                None::<ast::TSTypeParameterInstantiation<'a>>,
                            ),
                        ]),
                    );
                }

                // This extends the `WebId` type by unifying it with the `ActorEntityUuid` type. We
                // currently, don't have a way to represent the `WebId` type in the
                // AST, so we have to do this manually.
                // TODO: Allow this to be done from the Rust code directly
                //   see https://linear.app/hash/issue/H-4514/allow-specifying-type-branding-in-rust-itself
                if definition.module == "type_system::principal::actor_group::web"
                    && definition.name == "WebId"
                {
                    r#type = self.ast.ts_type_union_type(
                        SPAN,
                        self.ast.vec_from_array([
                            r#type,
                            self.ast.ts_type_type_reference(
                                SPAN,
                                self.ast.ts_type_name_identifier_reference(
                                    SPAN,
                                    Atom::new_const("ActorEntityUuid"),
                                ),
                                None::<ast::TSTypeParameterInstantiation<'a>>,
                            ),
                        ]),
                    );
                }

                r#type = self.ast.ts_type_type_reference(
                    SPAN,
                    self.ast.ts_type_name_identifier_reference(SPAN, "Brand"),
                    Some(self.ast.ts_type_parameter_instantiation(
                        SPAN,
                        self.ast.vec_from_array([
                            r#type,
                            self.ast.ts_type_literal_type(
                                SPAN,
                                self.ast.ts_literal_string_literal(
                                    SPAN,
                                    self.ast.str(definition.name.as_ref()),
                                    None,
                                ),
                            ),
                        ]),
                    )),
                );
            }

            self.ast.declaration_ts_type_alias(
                SPAN,
                self.ast
                    .binding_identifier(SPAN, self.ast.str(definition.name.as_ref())),
                None::<ast::TSTypeParameterDeclaration<'a>>,
                r#type,
                false,
            )
        }
    }

    fn generate_interface(&self, definition: &TypeDefinition) -> ast::Declaration<'a> {
        let (body, extends) = match &definition.r#type {
            Type::Struct(struct_def) => match &struct_def.fields {
                Fields::Named {
                    fields,
                    deny_unknown: true,
                } => {
                    let mut members = self.ast.vec();
                    let mut extends = self.ast.vec();
                    for (field_name, field) in fields {
                        if field.flatten {
                            // TODO: Implement struct inlining.
                            //       If it would be a struct, we couldn't add it as `extends`, so we
                            //       actually need a reference here. If we encounter a `panic!` here
                            //       due to `field.r#type` being a `Type::Struct` we can workaround
                            //       it by truely flatten the struct into the interface.
                            //   see https://linear.app/hash/issue/H-4506/support-inlining-of-flattened-structs
                            let Type::Reference(type_id) = &field.r#type else {
                                panic!("Expected reference type for flattened field");
                            };
                            extends.push(
                                self.ast.ts_interface_heritage(
                                    SPAN,
                                    ast::Expression::Identifier(
                                        self.ast.alloc_identifier_reference(
                                            SPAN,
                                            self.ast.str(
                                                self.collection
                                                    .types
                                                    .get(type_id)
                                                    .expect(
                                                        "type collection should contain the type",
                                                    )
                                                    .name
                                                    .as_ref(),
                                            ),
                                        ),
                                    ),
                                    None::<ast::TSTypeParameterInstantiation<'a>>,
                                ),
                            );
                            continue;
                        }
                        members.push(
                            self.ast.ts_signature_property_signature(
                                SPAN,
                                false, // computed
                                field.optional,
                                false, // read-only
                                self.ast.property_key_static_identifier(
                                    SPAN,
                                    self.ast.str(field_name.as_ref()),
                                ),
                                Some(self.ast.alloc_ts_type_annotation(
                                    SPAN,
                                    self.visit_type(&field.r#type),
                                )),
                            ),
                        );
                    }
                    (members, extends)
                }
                Fields::Named { .. } | Fields::Unnamed { .. } | Fields::Unit => unimplemented!(
                    "Tried to generate an interface from tuple-struct or unit struct"
                ),
            },
            ty @ (Type::Reference(_)
            | Type::Primitive(_)
            | Type::Enum(_)
            | Type::Tuple(_)
            | Type::List(_)
            | Type::NonEmptyList(_)
            | Type::Map(_)
            | Type::Nullable(_)) => {
                unimplemented!("Tried to generate an interface from unsupported type: {ty:?}")
            }
        };

        self.ast.declaration_ts_interface(
            SPAN,
            self.ast
                .binding_identifier(SPAN, self.ast.str(definition.name.as_ref())),
            None::<ast::TSTypeParameterDeclaration<'a>>,
            extends,
            self.ast.ts_interface_body(SPAN, body),
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

    fn visit_reference(&self, type_id: TypeId) -> ast::TSType<'a> {
        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(
                SPAN,
                self.ast.str(
                    self.collection
                        .types
                        .get(&type_id)
                        .expect("type collection should contain the type")
                        .name
                        .as_ref(),
                ),
            ),
            None::<ast::TSTypeParameterInstantiation<'a>>,
        )
    }

    fn visit_fields(&self, variant: &Fields) -> ast::TSType<'a> {
        match variant {
            Fields::Unit => self.ast.ts_type_null_keyword(SPAN),
            Fields::Named {
                fields,
                deny_unknown,
            } => {
                if fields.is_empty() && *deny_unknown {
                    return self.ast.ts_type_type_reference(
                        SPAN,
                        self.ast
                            .ts_type_name_identifier_reference(SPAN, Atom::new_const("Record")),
                        Some(self.ast.ts_type_parameter_instantiation(
                            SPAN,
                            self.ast.vec_from_array([
                                self.ast.ts_type_string_keyword(SPAN),
                                self.ast.ts_type_never_keyword(SPAN),
                            ]),
                        )),
                    );
                }

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
                            field.optional,
                            false, // read-only
                            self.ast.property_key_static_identifier(
                                SPAN,
                                self.ast.str(field_name.as_ref()),
                            ),
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
                fields => self.ast.ts_type_tuple_type(
                    SPAN,
                    self.ast.vec_from_iter(
                        fields
                            .iter()
                            .map(|field| self.visit_type(&field.r#type).into()),
                    ),
                ),
            },
        }
    }

    fn visit_externally_tagged_enum_variant(&self, variant: &EnumVariant) -> ast::TSType<'a> {
        match &variant.fields {
            Fields::Unit => self.ast.ts_type_literal_type(
                SPAN,
                self.ast
                    .ts_literal_string_literal(SPAN, self.ast.str(variant.name.as_ref()), None),
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
                            self.ast.property_key_static_identifier(
                                SPAN,
                                self.ast.str(variant.name.as_ref()),
                            ),
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
                self.ast
                    .property_key_static_identifier(SPAN, self.ast.str(tag)),
                Some(self.ast.alloc_ts_type_annotation(
                    SPAN,
                    self.ast.ts_type_literal_type(
                        SPAN,
                        self.ast.ts_literal_string_literal(
                            SPAN,
                            self.ast.str(variant.name.as_ref()),
                            None,
                        ),
                    ),
                )),
            ),
        );

        let mut flattened_members = self.ast.vec();
        match &variant.fields {
            Fields::Unit => {}
            Fields::Named {
                fields,
                deny_unknown: _,
            } => {
                for (field_name, field) in fields {
                    if field.flatten {
                        flattened_members.push(self.visit_type(&field.r#type));
                        continue;
                    }
                    members.push(
                        self.ast.ts_signature_property_signature(
                            SPAN,
                            false, // computed
                            field.optional,
                            false, // readonly
                            self.ast.property_key_static_identifier(
                                SPAN,
                                self.ast.str(field_name.as_ref()),
                            ),
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
                self.ast
                    .property_key_static_identifier(SPAN, self.ast.str(tag)),
                Some(self.ast.alloc_ts_type_annotation(
                    SPAN,
                    self.ast.ts_type_literal_type(
                        SPAN,
                        self.ast.ts_literal_string_literal(
                            SPAN,
                            self.ast.str(variant.name.as_ref()),
                            None,
                        ),
                    ),
                )),
            ),
        );

        if !matches!(variant.fields, Fields::Unit) {
            members.push(
                self.ast.ts_signature_property_signature(
                    SPAN,
                    false, // computed
                    false, // optional
                    false, // readonly
                    self.ast
                        .property_key_static_identifier(SPAN, self.ast.str(content)),
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
        self.ast.ts_type_union_type(
            SPAN,
            self.ast.vec_from_iter(
                enum_type
                    .variants
                    .iter()
                    .map(|variant| self.visit_enum_variant(variant, &enum_type.tagging)),
            ),
        )
    }

    fn visit_struct(&self, struct_type: &Struct) -> ast::TSType<'a> {
        self.visit_fields(&struct_type.fields)
    }

    fn visit_map(&self, map: &Map) -> ast::TSType<'a> {
        self.ast.ts_type_type_literal(
            SPAN,
            self.ast.vec1(
                self.ast.ts_signature_index_signature(
                    SPAN,
                    self.ast.vec1(
                        self.ast.ts_index_signature_name(
                            SPAN,
                            "key",
                            self.ast
                                .alloc_ts_type_annotation(SPAN, self.visit_type(&map.key)),
                        ),
                    ),
                    self.ast
                        .alloc_ts_type_annotation(SPAN, self.visit_type(&map.value)),
                    false, // read-only
                    false, // static
                ),
            ),
        )
    }

    fn visit_tuple(&self, tuple: &Tuple) -> ast::TSType<'a> {
        self.ast.ts_type_tuple_type(
            SPAN,
            self.ast.vec_from_iter(
                tuple
                    .elements
                    .iter()
                    .map(|element| self.visit_type(element).into()),
            ),
        )
    }

    fn visit_list(&self, list: &List) -> ast::TSType<'a> {
        self.ast
            .ts_type_array_type(SPAN, self.visit_type(&list.r#type))
    }

    fn visit_non_empty_list(&self, list: &List) -> ast::TSType<'a> {
        let head = self.visit_type(&list.r#type);
        let tail = self.ast.alloc_ts_rest_type(SPAN, self.visit_list(list));

        self.ast.ts_type_tuple_type(
            SPAN,
            self.ast
                .vec_from_array([head.into(), TSTupleElement::TSRestType(tail)]),
        )
    }

    fn visit_nullable(&self, optional: &Type) -> ast::TSType<'a> {
        self.ast.ts_type_parenthesized_type(
            SPAN,
            self.ast.ts_type_union_type(
                SPAN,
                self.ast.vec_from_array([
                    self.visit_type(optional),
                    self.ast.ts_type_null_keyword(SPAN),
                ]),
            ),
        )
    }

    fn visit_type(&self, r#type: &Type) -> ast::TSType<'a> {
        match r#type {
            Type::Primitive(primitive) => self.visit_primitive(primitive),
            Type::Enum(enum_type) => self.visit_enum(enum_type),
            Type::Struct(struct_type) => self.visit_struct(struct_type),
            Type::Reference(type_id) => self.visit_reference(*type_id),
            Type::Tuple(tuple) => self.visit_tuple(tuple),
            Type::List(list) => self.visit_list(list),
            Type::NonEmptyList(list) => self.visit_non_empty_list(list),
            Type::Map(map) => self.visit_map(map),
            Type::Nullable(optional) => self.visit_nullable(optional),
        }
    }
}
