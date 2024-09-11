use quote::ToTokens;
use syn::{meta::ParseNestedMeta, parse_quote, DeriveInput, Error, LitStr, Path, Token};

fn try_set_attribute<T: ToTokens>(
    attribute: &mut Option<T>,
    value: T,
    name: &'static str,
) -> Result<(), Error> {
    if attribute.is_some() {
        return Err(Error::new_spanned(
            value,
            format!("{name} already specified"),
        ));
    }
    *attribute = Some(value);
    Ok(())
}

#[derive(Default)]
struct Builder {
    pub(crate) display: Option<LitStr>,
    pub(crate) crate_path: Option<Path>,
}

impl Builder {
    fn parse_meta(&mut self, meta: ParseNestedMeta<'_>) -> Result<(), Error> {
        if meta.path.is_ident("crate") {
            if meta.input.parse::<Token![=]>().is_ok() {
                let path = meta.input.parse::<Path>()?;
                try_set_attribute(&mut self.crate_path, path, "crate")
            } else if meta.input.is_empty() || meta.input.peek(Token![,]) {
                try_set_attribute(&mut self.crate_path, parse_quote! { crate }, "crate")
            } else {
                Err(meta.error("expected `crate` or `crate = ...`"))
            }
        } else {
            Ok(())
        }
    }
}

pub(crate) struct Attributes {
    #[allow(unused)]
    pub(crate) display: LitStr,
    pub(crate) crate_path: Path,
}
impl Attributes {
    pub(crate) fn parse(input: &DeriveInput) -> Result<Attributes, Error> {
        let mut builder = Builder::default();

        for attr in &input.attrs {
            if attr.path().is_ident("display") {
                builder.display = Some(attr.parse_args()?);
            }
            if attr.path().is_ident("error_stack") {
                attr.parse_nested_meta(|meta| builder.parse_meta(meta))?;
            }
        }
        let display = builder
            .display
            .take()
            .unwrap_or_else(|| LitStr::new(&input.ident.to_string(), input.ident.span()));
        let crate_path = builder
            .crate_path
            .take()
            .unwrap_or_else(|| parse_quote! { ::error_stack });
        Ok(Self {
            display,
            crate_path,
        })
    }
}
