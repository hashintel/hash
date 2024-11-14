use error_stack::Report;

use crate::Migration;

pub struct V002;

impl Migration for V002 {
    type Context = ();
    type Error = core::fmt::Error;

    async fn up(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }

    async fn down(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }
}
