use std::collections::{HashMap, HashSet};

use proc_macro::TokenStream;
use virtue::{
    parse::Attribute,
    prelude::*,
    utils::{parse_tagged_attribute, ParsedAttribute},
};

use crate::input::{QueryBuilderField, QueryBuilderInput, QueryBuilderVariant, Redirect};

// Body Attributes that are valid:
// - none for now -
fn parse_body_attributes(attributes: &[ParsedAttribute]) -> Result {
    if !attributes.is_empty() {
        return Err(Error::custom("expected no attributes on field"));
    }

    Ok(())
}

pub fn parse(input: TokenStream) -> Result<TokenStream> {
    let parse = Parse::new(input)?;

    let (_, attributes, body) = parse.into_generator();

    parse_body_attributes(&parse_attributes(&attributes)?)?;
    let _input = QueryBuilderInput::try_from(body)?;
    Ok(TokenStream::new())
}

impl TryFrom<Body> for QueryBuilderInput {
    type Error = Error;

    fn try_from(value: Body) -> std::result::Result<Self, Self::Error> {
        match value {
            Body::Struct(_) => Err(Error::custom("only enums are supported")),
            Body::Enum(body) => {
                let variants: Result<Vec<_>> = body
                    .variants
                    .into_iter()
                    .map(QueryBuilderVariant::try_from)
                    .collect();

                let variants = variants?;
                Ok(Self { variants })
            }
        }
    }
}

fn ensure_no_duplicate_attributes(attributes: &[ParsedAttribute]) -> Result {
    let mut encountered = HashSet::new();

    for attribute in attributes {
        let (name, span) = match attribute {
            ParsedAttribute::Property(ident, _) | ParsedAttribute::Tag(ident) => {
                (ident.to_string(), ident.span())
            }
            _ => continue,
        };

        if encountered.contains(&name) {
            // virtue (unlike darling) currently does not support multiple errors :/
            // TODO: we could use our own version that uses error-stack potentially?
            return Err(Error::custom_at(
                format!("The attribute {name} has been used multiple times on the same item"),
                span,
            ));
        }

        encountered.insert(name);
    }

    Ok(())
}

fn find_attribute<'a>(
    attributes: &'a [ParsedAttribute],
    name: &str,
) -> Option<&'a ParsedAttribute> {
    attributes.iter().find(|attribute| matches!(attribute, ParsedAttribute::Tag(ident) | ParsedAttribute::Property(ident, _) if ident.to_string() == name))
}

enum Next {
    Remote,
    This,
    Properties,
}

struct VariantAttributes {
    // not bool, because we want to know presence, not if it is true/false
    skip: Option<()>,
    next: Option<Next>,
}

fn parse_attributes(attributes: &[Attribute]) -> Result<Vec<ParsedAttribute>> {
    let attributes: Result<Vec<_>> = attributes
        .iter()
        .map(|attribute| parse_tagged_attribute(&attribute.tokens, "builder"))
        .collect();

    let attributes: Vec<_> = attributes?.into_iter().flatten().flatten().collect();

    Ok(attributes)
}

// Variant Attributes that are valid:
// * skip (tag)
// * next (property), value oneOf remote, this, properties
fn parse_variant_attributes(attributes: &[ParsedAttribute]) -> Result<VariantAttributes> {
    ensure_no_duplicate_attributes(attributes)?;

    let skip = find_attribute(attributes, "skip")
        .map(|attribute| match attribute {
            ParsedAttribute::Tag(_) => Ok(()),
            ParsedAttribute::Property(ident, _) => Err(Error::custom_at(
                "expected skip attribute to be a tag, found property",
                ident.span(),
            )),
            _ => unimplemented!(),
        })
        .transpose()?;

    let next = find_attribute(attributes, "next")
        .map(|attribute| match attribute {
            ParsedAttribute::Tag(ident) => Err(Error::custom_at(
                "expected next attribute to be a property, found tag",
                ident.span(),
            )),
            ParsedAttribute::Property(_, value) => Ok(value),
            _ => unimplemented!(),
        })
        .transpose()?
        .map(|value| match value.to_string().as_str() {
            r#""remote""# => Ok(Next::Remote),
            r#""this""# => Ok(Next::This),
            r#""properties""# => Ok(Next::Properties),
            received => Err(Error::custom_at(
                format!(
                    "unrecognized `next` value, expected `remote`, `properties` or `this`, \
                     received {received}"
                ),
                value.span(),
            )),
        })
        .transpose()?;

    Ok(VariantAttributes { skip, next })
}

// Field Attributes that are valid:
// - none for now -
fn parse_field_attributes(attributes: &[ParsedAttribute]) -> Result {
    if !attributes.is_empty() {
        return Err(Error::custom("expected no attributes on field"));
    }

    Ok(())
}

impl TryFrom<EnumVariant> for QueryBuilderVariant {
    type Error = Error;

    fn try_from(value: EnumVariant) -> std::result::Result<Self, Self::Error> {
        let attributes = parse_variant_attributes(&parse_attributes(&value.attributes)?)?;

        if attributes.skip.is_some() {
            return Ok(Self {
                name: value.name,
                field: QueryBuilderField::Skip,
            });
        }

        let field = match value.fields {
            None => {
                if attributes.next.is_some() {
                    return Err(Error::custom_at(
                        "unexpected attribute `next` on variant without value",
                        value.name.span(),
                    ));
                }

                QueryBuilderField::Bottom
            }
            Some(Fields::Struct(_)) => {
                if attributes.next.is_some() {
                    return Err(Error::custom_at(
                        "unexpected attribute `next` on complex variant",
                        value.name.span(),
                    ));
                }

                QueryBuilderField::Complex
            }
            Some(Fields::Tuple(fields)) => {
                let [field] = fields.as_slice() else {
                    return Err(Error::custom_at(
                        format!(
                            "unable to determine reference to `{}`, more than a single tuple \
                             element",
                            value.name
                        ),
                        value.name.span(),
                    ));
                };

                parse_field_attributes(&parse_attributes(&field.attributes)?)?;

                match attributes.next {
                    Some(Next::Remote) => {
                        QueryBuilderField::Redirect(Redirect::Remote(field.r#type.clone()))
                    }
                    Some(Next::This) => QueryBuilderField::Redirect(Redirect::This),
                    Some(Next::Properties) => QueryBuilderField::Properties,
                    None => QueryBuilderField::Redirect(Redirect::Remote(field.r#type.clone())),
                }
            }
        };

        Ok(Self {
            name: value.name,
            field,
        })
    }
}
