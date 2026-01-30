use core::time::Duration;
use std::{io, sync::mpsc, time::Instant};

use ratatui::{
    Frame, Terminal,
    crossterm::event,
    prelude::Backend,
    style::Color,
    symbols::Marker,
    widgets::{
        Block, Paragraph, Widget,
        canvas::{Canvas, Points, Rectangle},
    },
};

use crate::harness::trial::{Trial, TrialGroup, TrialStatistics};

#[derive(Debug, Clone)]
enum Event {
    TracingMessage(Vec<u8>),
    Shutdown,
    Tick,
    Resize,
}

#[derive(Debug, Clone)]
struct TracingWriter {
    sender: mpsc::Sender<Event>,
}

impl io::Write for TracingWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let len = buf.len();
        self.sender.send(Event::TracingMessage(buf.to_vec()));
        Ok(len)
    }

    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        self.write(buf).map(|_| ())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct TuiConfig {
    tick_rate: Duration,
}

fn input_handler(tx: mpsc::Sender<Event>, TuiConfig { tick_rate }: TuiConfig) -> io::Result<()> {
    let mut last_tick = Instant::now();

    loop {
        // poll for tick rate duration, if no events, sent tick event.
        let timeout = tick_rate.saturating_sub(last_tick.elapsed());

        let poll = event::poll(timeout)?;
        if poll {
            match event::read()? {
                event::Event::Resize(_, _) => {
                    tx.send(Event::Resize).map_err(io::Error::other)?;
                }
                _ => {}
            }
        }

        if last_tick.elapsed() >= tick_rate {
            tx.send(Event::Tick).map_err(io::Error::other)?;
            last_tick = Instant::now();
        }
    }
}

enum TrialState {
    Pending,
    Running,
    Success(TrialStatistics),
    Failure,
}

struct RenderState<'trial, 'graph> {
    trials: Vec<(&'trial TrialGroup<'graph>, &'trial Trial)>,
    results: Vec<TrialState>,
}

fn render(frame: &mut Frame, state: &mut RenderState) {
    // We display the trial results in the following fashion:
    // We have a top part, which has a list of the amount of pending, running and success and
    // failure trials, as the header.
    // Then below that we a 2 row detailed timing statistics for the total, such as the time spent
    // to run the trial.
    let area = frame.area();

    // Find a good ratio between the width and height of the canvas
    let ratio = area.width as f64 / area.height as f64;

    // Use that ratio to determine the amount of rows and columns
    let rows = (area.height as f64 * ratio).ceil() as u16;
    let cols = (area.width as f64 / ratio).ceil() as u16;

    let mut pending = 0;
    let mut running = 0;
    let mut success = 0;
    let mut failure = 0;

    for result in &state.results {
        match result {
            TrialState::Pending => pending += 1,
            TrialState::Running => running += 1,
            TrialState::Success(_) => success += 1,
            TrialState::Failure => failure += 1,
        }
    }

    let canvas = Canvas::default()
        .block(Block::bordered().title(format!(
            "Pending: {pending} Running: {running} Success: {success} Failure: {failure}"
        )))
        .marker(Marker::Octant)
        .x_bounds([0.0, rows as f64])
        .y_bounds([0.0, cols as f64])
        .paint(|ctx| {
            let mut index = 0;
            for result in &state.results {
                let row = index / cols;
                let col = index % cols;

                ctx.draw(&Rectangle::new(
                    row as f64,
                    col as f64,
                    1.0,
                    1.0,
                    match result {
                        TrialState::Pending => Color::Gray,
                        TrialState::Running => Color::Yellow,
                        TrialState::Success(_) => Color::Green,
                        TrialState::Failure => Color::Red,
                    },
                ));

                index += 1;
            }
        });
}

fn event_loop<B: Backend>(
    terminal: &mut Terminal<B>,
    rx: mpsc::Receiver<Event>,
) -> Result<(), B::Error> {
    let mut redraw = true;
    loop {
        if redraw {
            terminal.draw(|frame| render(frame));
        }
        redraw = true;

        let event = rx
            .recv()
            .expect("receivers should be dropped before sender");

        match event {
            Event::TracingMessage(bytes) => {
                let size = terminal.size()?;
                let paragraph = Paragraph::new(String::from_utf8_lossy_owned(bytes));
                let height = paragraph.line_count(size.height);

                terminal.insert_before(height as u16, |buffer| {
                    paragraph.render(buffer.area, buffer);
                });
            }
            Event::Resize => terminal.autoresize()?,
            Event::Tick => {}
            Event::Shutdown => return Ok(()),
        }
    }
}

struct Tui {}

impl Tui {
    fn run(&mut self) {
        loop {}
        todo!()
    }
}
