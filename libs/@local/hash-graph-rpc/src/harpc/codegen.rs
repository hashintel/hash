use std::fmt::Display;

use specta::{
    DataType, EnumRepr, EnumType, EnumVariants, List, LiteralType, NamedFields, PrimitiveType,
    StructFields, StructType, TupleType, TypeMap, UnnamedFields,
};
use tokio::io::{AsyncWrite, AsyncWriteExt};

async fn inline_primitive(
    ast: &PrimitiveType,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    let value: &[_] = match ast {
        PrimitiveType::i8 => b"B.i8",
        PrimitiveType::i16 => b"B.i16",
        PrimitiveType::i32 => b"B.i32",
        PrimitiveType::i64 | PrimitiveType::isize => b"B.i64",
        PrimitiveType::i128 => b"B.i128",
        PrimitiveType::u8 => b"B.u8",
        PrimitiveType::u16 => b"B.u16",
        PrimitiveType::u32 => b"B.u32",
        PrimitiveType::u64 | PrimitiveType::usize => b"B.u64",
        PrimitiveType::u128 => b"B.u128",
        PrimitiveType::f32 | PrimitiveType::f64 => b"S.number",
        PrimitiveType::bool => b"S.boolean",
        PrimitiveType::char => b"B.char",
        PrimitiveType::String => b"S.string",
    };

    output.write_all(value).await
}

async fn inline_literal(
    ast: &LiteralType,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    async fn write_bare(
        output: &mut (impl AsyncWrite + Unpin + Send),
        value: &(impl Display + Sync),
    ) -> std::io::Result<()> {
        output.write_all(b"S.literal(").await?;
        output.write_all(value.to_string().as_bytes()).await?;
        output.write_all(b")").await
    }

    match ast {
        LiteralType::i8(value) => write_bare(output, &value).await,
        LiteralType::i16(value) => write_bare(output, &value).await,
        LiteralType::i32(value) => write_bare(output, &value).await,
        LiteralType::u8(value) => write_bare(output, &value).await,
        LiteralType::u16(value) => write_bare(output, &value).await,
        LiteralType::u32(value) => write_bare(output, &value).await,
        LiteralType::f32(value) => write_bare(output, &value).await,
        LiteralType::f64(value) => write_bare(output, &value).await,
        LiteralType::bool(value) => write_bare(output, &value).await,
        LiteralType::String(value) => write_bare(output, &format!(r#""{value}""#)).await,
        LiteralType::char(value) => write_bare(output, &format!(r#""{value}""#)).await,
        LiteralType::None => output.write_all(b"S.null").await,
        _ => panic!("Unsupported literal type: {ast:?}"),
    }
}

async fn inline_list(
    ast: &List,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    if let Some(length) = ast.length() {
        let mut inner = Vec::new();
        inline(ast.ty(), map, &mut inner).await?;

        output.write_all(b"S.tuple(").await?;
        for index in 0..length {
            if index > 0 {
                output.write_all(b", ").await?;
            }

            output.write_all(&inner).await?;
        }
    } else {
        output.write_all(b"S.list(").await?;
        inline(ast.ty(), map, output).await?;
        output.write_all(b")").await?;
    }

    Ok(())
}

async fn inline_struct_unnamed_fields(
    field: &UnnamedFields,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    output.write_all(b"S.tuple(").await?;

    for field in field.fields() {
        let Some(ty) = field.ty() else {
            continue;
        };

        inline(ty, map, output).await?;
        output.write_all(b", ").await?;
    }

    output.write_all(b")").await
}

async fn inline_struct_named_fields(
    field: &NamedFields,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    output.write_all(b"S.record({").await?;

    for (name, field) in field.fields() {
        let Some(ty) = field.ty() else {
            continue;
        };

        output.write_all(b"\"").await?;
        output.write_all(name.as_bytes()).await?;
        output.write_all(b"\": ").await?;
        inline(ty, map, output).await?;
        output.write_all(b", ").await?;
    }

    output.write_all(b"})").await
}

async fn inline_struct(
    ast: &StructType,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    match ast.fields() {
        StructFields::Unit => output.write_all(b"S.null").await,
        StructFields::Unnamed(fields) => inline_struct_unnamed_fields(fields, map, output).await,
        StructFields::Named(fields) => inline_struct_named_fields(fields, map, output).await,
    }
}

async fn inline_enum_variant(
    ast: &EnumVariants,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    match ast {
        EnumVariants::Unit => output.write_all(b"S.null").await,
        EnumVariants::Named(fields) => inline_struct_named_fields(fields, map, output).await,
        EnumVariants::Unnamed(fields) => inline_struct_unnamed_fields(fields, map, output).await,
    }
}

async fn inline_enum(
    ast: &EnumType,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    match ast.repr() {
        EnumRepr::Untagged => {
            output.write_all(b"S.union(").await?;

            for (_, variant) in ast.variants() {
                let variant = variant.inner();

                inline_enum_variant(variant, map, output).await?;
                output.write_all(b", ").await?;
            }

            output.write_all(b")").await
        }
        EnumRepr::External => {
            output.write_all(b"S.union(").await?;

            for (name, variant) in ast.variants() {
                let variant = variant.inner();

                output.write_all(b"S.struct({").await?;
                output.write_all(b"\"").await?;
                output.write_all(name.as_bytes()).await?;
                output.write_all(b"\": ").await?;
                inline_enum_variant(variant, map, output).await?;
                output.write_all(b"})").await?;

                output.write_all(b", ").await?;
            }

            output.write_all(b")").await
        }
        EnumRepr::Internal { tag } => {
            async fn empty_tagged_struct(
                tag: &str,
                name: &str,
                output: &mut (impl AsyncWrite + Unpin + Send),
            ) -> std::io::Result<()> {
                output.write_all(b"S.struct({").await?;
                output.write_all(b"\"").await?;
                output.write_all(tag.as_bytes()).await?;
                output.write_all(b"\": ").await?;
                inline_literal(&LiteralType::String(name.to_owned()), output).await?;
                output.write_all(b"})").await
            }

            output.write_all(b"S.union(").await?;

            for (name, variant) in ast.variants() {
                let variant = variant.inner();

                match variant {
                    EnumVariants::Unit => {
                        empty_tagged_struct(tag, name, output).await?;
                    }
                    EnumVariants::Named(value) => {
                        output.write_all(b"S.compose(").await?;
                        empty_tagged_struct(tag, name, output).await?;
                        output.write_all(b", ").await?;
                        inline_struct_named_fields(value, map, output).await?;
                        output.write_all(b")").await?;
                    }
                    EnumVariants::Unnamed(_) => {
                        unreachable!("Unnamed enum variants with internal repr")
                    }
                }

                output.write_all(b", ").await?;
            }

            output.write_all(b")").await
        }
        EnumRepr::Adjacent { tag, content } => {
            output.write_all(b"S.union(").await?;

            for (name, variant) in ast.variants() {
                let variant = variant.inner();

                output.write_all(b"S.struct({").await?;
                output.write_all(b"\"").await?;
                output.write_all(tag.as_bytes()).await?;
                output.write_all(b"\": ").await?;
                inline_literal(&LiteralType::String(name.clone().into_owned()), output).await?;
                output.write_all(b", ").await?;
                output.write_all(b"\"").await?;
                output.write_all(content.as_bytes()).await?;
                output.write_all(b"\": ").await?;
                inline_enum_variant(variant, map, output).await?;
                output.write_all(b"})").await?;
            }

            output.write_all(b")").await
        }
    }
}

async fn inline_tuple(
    ast: &TupleType,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    output.write_all(b"S.tuple(").await?;

    for ty in ast.elements() {
        inline(ty, map, output).await?;
        output.write_all(b", ").await?;
    }

    output.write_all(b")").await
}

// TODO: inline structs have generics :/ ones with generics we need to keep track and hoist once
//  concrete.
//  The problem: can we safely hoist? How would that look like without polluting the namespace?
// TODO: we'd need some sort of scope to keep track of the generics and their types
//  Generic structs are just functions with their generics as key that we instantiate :O
// TODO: add docs
#[async_recursion::async_recursion]
async fn inline(
    ast: &DataType,
    map: &TypeMap,
    output: &mut (impl AsyncWrite + Unpin + Send),
) -> std::io::Result<()> {
    match ast {
        DataType::Any => output.write_all(b"S.any").await,
        DataType::Unknown => output.write_all(b"S.unknown").await,
        DataType::Primitive(primitive) => inline_primitive(primitive, output).await,
        DataType::Literal(literal) => inline_literal(literal, output).await,
        DataType::List(list) => inline_list(list, map, output).await,
        DataType::Nullable(value) => {
            output.write_all(b"S.optional(").await?;
            inline(value, map, output).await?;
            output.write_all(b")").await
        }
        DataType::Map(entry) => {
            let (key, value) = entry.as_ref();

            output.write_all(b"S.record(").await?;
            inline(key, map, output).await?;
            output.write_all(b", ").await?;
            inline(value, map, output).await?;
            output.write_all(b")").await
        }
        DataType::Struct(r#struct) => inline_struct(r#struct, map, output).await,
        DataType::Enum(r#enum) => inline_enum(r#enum, map, output).await,
        DataType::Tuple(tuple) => inline_tuple(tuple, map, output).await,
        DataType::Result(_) => todo!(),
        DataType::Reference(value) => {
            // TODO: hoist if generics :/
            output.write_all(value.name().as_bytes()).await
        }
        DataType::Generic(generic) => {
            todo!("Generic types are not supported in the WASM backend")
        }
    }
}
