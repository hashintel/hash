mod args;
mod intent;

pub use self::intent::{CommandIntent, CommandIntentIter, CommandIntentSet};

trait Command {
    type Error;

    fn intent(&self) -> CommandIntentSet;

    async fn run(&self) -> Result<(), Self::Error>;
}
