use specta::datatype;

#[derive(Debug, Clone)]
pub enum Primitive {
    String,
    Number,
    Boolean,
}

impl From<&datatype::Primitive> for Primitive {
    fn from(primitive: &datatype::Primitive) -> Self {
        match primitive {
            datatype::Primitive::i8
            | datatype::Primitive::i16
            | datatype::Primitive::i32
            | datatype::Primitive::i64
            | datatype::Primitive::i128
            | datatype::Primitive::isize
            | datatype::Primitive::u8
            | datatype::Primitive::u16
            | datatype::Primitive::u32
            | datatype::Primitive::u64
            | datatype::Primitive::u128
            | datatype::Primitive::usize
            | datatype::Primitive::f16
            | datatype::Primitive::f32
            | datatype::Primitive::f64 => Self::Number,
            datatype::Primitive::bool => Self::Boolean,
            datatype::Primitive::char | datatype::Primitive::String => Self::String,
        }
    }
}
