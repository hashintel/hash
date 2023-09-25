use graph_types::account::AccountId;

use crate::zanzibar::Resource;

impl Resource for AccountId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/account"
    }

    fn id(&self) -> Self::Id {
        *self
    }
}

pub struct PublicAccess;

impl Resource for PublicAccess {
    type Id = &'static str;

    fn namespace() -> &'static str {
        AccountId::namespace()
    }

    fn id(&self) -> Self::Id {
        "*"
    }
}
