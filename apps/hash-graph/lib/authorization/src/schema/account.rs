use graph_types::account::AccountId;
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub enum PublicAccess {
    #[serde(rename = "*")]
    Public,
}

impl Resource for PublicAccess {
    type Id = &'static str;

    fn namespace() -> &'static str {
        AccountId::namespace()
    }

    fn id(&self) -> Self::Id {
        "*"
    }
}
