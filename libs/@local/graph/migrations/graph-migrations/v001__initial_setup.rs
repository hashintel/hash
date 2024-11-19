use error_stack::Report;

use crate::{Migration, MigrationError};

pub struct V001;

impl Migration for V001 {
    type Context = ();
    type Error = MigrationError;

    async fn up(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }

    async fn down(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }
}
