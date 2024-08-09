use alloc::borrow::Cow;

use hql_diagnostics::category::Category;

pub(crate) const CATEGORY: &Category = &Category {
    id: Cow::Borrowed("jexpr"),
    name: Cow::Borrowed("J-Expr Frontend"),
    parent: None,
};
