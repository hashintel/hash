use core::fmt;

use serde::de::{DeserializeSeed, Unexpected, Visitor};
use serde_json::Value;
use winnow::{
    combinator::alt,
    error::{ContextError, ErrMode, ParseError},
    Located, Parser, Stateful,
};

use crate::{
    arena,
    call::Call,
    constant::Constant,
    expr::Expr,
    path::parse_path,
    signature::{parse_signature, Signature},
    r#type::{parse_type, Type},
    Path,
};

struct ExprSeed<'a> {
    arena: &'a arena::Arena,
}

impl<'a, 'de> DeserializeSeed<'de> for ExprSeed<'a> {
    type Value = Expr<'a>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::de::Deserializer<'de>,
    {
        deserializer.deserialize_any(ExprVisitor { arena: self.arena })
    }
}

struct ArgsVisitor<'a> {
    arena: &'a arena::Arena,
}

impl<'a, 'de> DeserializeSeed<'de> for ArgsVisitor<'a> {
    type Value = arena::Box<'a, [Expr<'a>]>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::de::Deserializer<'de>,
    {
        deserializer.deserialize_seq(self)
    }
}

impl<'a, 'de> Visitor<'de> for ArgsVisitor<'a> {
    type Value = arena::Box<'a, [Expr<'a>]>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a sequence of expressions")
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::SeqAccess<'de>,
    {
        let mut args = self.arena.vec(seq.size_hint());
        while let Some(expr) = seq.next_element_seed(ExprSeed { arena: self.arena })? {
            args.push(expr);
        }

        Ok(args.into_boxed_slice())
    }
}

struct TypeVisitor<'a> {
    arena: &'a arena::Arena,
}

impl<'a, 'de> DeserializeSeed<'de> for TypeVisitor<'a> {
    type Value = Type<'a>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_str(self)
    }
}

impl<'a, 'de> Visitor<'de> for TypeVisitor<'a> {
    type Value = Type<'a>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a type")
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        parse_type
            .parse(Stateful {
                input: Located::new(v),
                state: self.arena,
            })
            .map_err(|error: ParseError<_, ErrMode<ContextError>>| {
                serde::de::Error::invalid_value(Unexpected::Str(v), &&*error.to_string())
            })
    }
}

struct PathVisitor<'a> {
    arena: &'a arena::Arena,
}

impl<'de, 'a> DeserializeSeed<'de> for PathVisitor<'a> {
    type Value = Path<'a>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::de::Deserializer<'de>,
    {
        deserializer.deserialize_str(self)
    }
}

impl<'de, 'a> Visitor<'de> for PathVisitor<'a> {
    type Value = Path<'a>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a path")
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        parse_path
            .parse(Stateful {
                input: Located::new(v),
                state: self.arena,
            })
            .map_err(|error: ParseError<_, ErrMode<ContextError>>| {
                serde::de::Error::invalid_value(Unexpected::Str(v), &&*error.to_string())
            })
    }
}

struct SignatureVisitor<'a> {
    arena: &'a arena::Arena,
}

impl<'a, 'de> DeserializeSeed<'de> for SignatureVisitor<'a> {
    type Value = Signature<'a>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::de::Deserializer<'de>,
    {
        deserializer.deserialize_str(self)
    }
}

impl<'a, 'de> Visitor<'de> for SignatureVisitor<'a> {
    type Value = Signature<'a>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a signature")
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        parse_signature
            .parse(Stateful {
                input: Located::new(v),
                state: self.arena,
            })
            .map_err(|error: ParseError<_, ErrMode<ContextError>>| {
                serde::de::Error::invalid_value(Unexpected::Str(v), &&*error.to_string())
            })
    }
}

pub(crate) struct ExprVisitor<'a> {
    pub arena: &'a arena::Arena,
}

impl<'a, 'de> DeserializeSeed<'de> for ExprVisitor<'a> {
    type Value = Expr<'a>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::de::Deserializer<'de>,
    {
        deserializer.deserialize_any(self)
    }
}

impl<'a, 'de> Visitor<'de> for ExprVisitor<'a> {
    type Value = Expr<'a>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("an expression")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::MapAccess<'de>,
    {
        #[derive(Debug, serde::Deserialize)]
        enum Key {
            #[serde(rename = "fn")]
            Fn,
            #[serde(rename = "args")]
            Args,
            #[serde(rename = "const")]
            Const,
            #[serde(rename = "type")]
            Type,
            #[serde(rename = "var")]
            Var,
            #[serde(rename = "sig")]
            Sig,
        }

        #[derive(Debug, Default)]
        struct Bag<'a> {
            r#fn: Option<Expr<'a>>,
            args: Option<arena::Box<'a, [Expr<'a>]>>,
            r#const: Option<Value>,
            r#type: Option<Type<'a>>,
            var: Option<Path<'a>>,
            sig: Option<Signature<'a>>,
        }

        let mut bag = Bag::default();

        while let Some(key) = map.next_key::<Key>()? {
            match key {
                Key::Fn => {
                    if bag.r#fn.is_some() {
                        return Err(serde::de::Error::duplicate_field("fn"));
                    }

                    bag.r#fn = Some(map.next_value_seed(ExprSeed { arena: self.arena })?);
                }
                Key::Args => {
                    if bag.args.is_some() {
                        return Err(serde::de::Error::duplicate_field("args"));
                    }

                    bag.args = Some(map.next_value_seed(ArgsVisitor { arena: self.arena })?);
                }
                Key::Const => {
                    if bag.r#const.is_some() {
                        return Err(serde::de::Error::duplicate_field("const"));
                    }

                    bag.r#const = Some(map.next_value()?);
                }
                Key::Type => {
                    if bag.r#type.is_some() {
                        return Err(serde::de::Error::duplicate_field("type"));
                    }

                    bag.r#type = Some(map.next_value_seed(TypeVisitor { arena: self.arena })?);
                }
                Key::Var => {
                    if bag.var.is_some() {
                        return Err(serde::de::Error::duplicate_field("var"));
                    }

                    bag.var = Some(map.next_value_seed(PathVisitor { arena: self.arena })?);
                }
                Key::Sig => {
                    if bag.sig.is_some() {
                        return Err(serde::de::Error::duplicate_field("sig"));
                    }

                    bag.sig = Some(map.next_value_seed(SignatureVisitor { arena: self.arena })?);
                }
            }
        }

        macro_rules! ensure_missing {
            ([$($expected:ident),*]; [$($field:ident),*]) => {{
                const EXPECTED: &[&str] = &[$(stringify!($expected)),*];

                $(
                if bag.$field.is_some() {
                    return Err(serde::de::Error::unknown_field(
                        stringify!($field),
                        EXPECTED,
                    ));
                }
                )*
            }};
        }

        if let Some(r#fn) = bag.r#fn {
            // args is optional, and will just be: []
            ensure_missing!([args]; [r#const, r#type, var, sig]);

            Ok(Expr::Call(Call {
                r#fn: self.arena.boxed(r#fn),
                args: bag.args.unwrap_or_else(|| self.arena.boxed([])),
            }))
        } else if let Some(r#const) = bag.r#const {
            // type is optional
            ensure_missing!([r#type]; [r#fn, args, var, sig]);

            Ok(Expr::Constant(Constant {
                value: r#const,
                r#type: bag.r#type,
            }))
        } else if let Some(var) = bag.var {
            ensure_missing!([var]; [r#fn, args, r#const, r#type, sig]);

            Ok(Expr::Path(var))
        } else if let Some(sig) = bag.sig {
            ensure_missing!([sig]; [r#fn, args, r#const, r#type, var]);

            Ok(Expr::Signature(sig))
        } else {
            Err(serde::de::Error::missing_field("fn, const, var, or sig"))
        }
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::SeqAccess<'de>,
    {
        let r#fn = seq.next_element_seed(ExprSeed { arena: self.arena })?;
        let Some(r#fn) = r#fn else {
            return Err(serde::de::Error::invalid_length(0, &"at least 1 element"));
        };

        let mut args = self.arena.vec(seq.size_hint());
        while let Some(arg) = seq.next_element_seed(ExprSeed { arena: self.arena })? {
            args.push(arg);
        }

        Ok(Expr::Call(Call {
            r#fn: self.arena.boxed(r#fn),
            args: args.into_boxed_slice(),
        }))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        // Symbol or Signature
        alt((
            parse_signature.map(Expr::Signature),
            parse_path.map(Expr::Path),
        ))
        .parse(Stateful {
            input: Located::new(v),
            state: self.arena,
        })
        .map_err(|error: ParseError<_, ErrMode<ContextError>>| {
            serde::de::Error::invalid_value(Unexpected::Str(v), &&*error.to_string())
        })
    }
}
