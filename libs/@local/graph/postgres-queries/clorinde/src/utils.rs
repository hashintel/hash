// This file was generated with `clorinde`. Do not modify.

use postgres_types::{Kind, ToSql, Type};
pub fn escape_domain(ty: &Type) -> &Type {
    match ty.kind() {
        Kind::Domain(ty) => ty,
        _ => ty,
    }
}
pub fn slice_iter<'a>(
    s: &'a [&'a (dyn ToSql + Sync)],
) -> impl ExactSizeIterator<Item = &'a dyn ToSql> + 'a {
    s.iter().map(|s| *s as _)
}
