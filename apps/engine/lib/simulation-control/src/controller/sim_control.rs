// Sent from experiment main loop to sim runs.
#[derive(Debug)]
pub enum SimControl {
    Pause,
    Resume,
    Stop,
}
