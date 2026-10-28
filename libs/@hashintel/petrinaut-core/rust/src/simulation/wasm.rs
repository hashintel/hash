#![expect(
    unreachable_pub,
    clippy::missing_const_for_fn,
    reason = "wasm-bindgen requires public, non-const exports inside this private bridge module"
)]

use alloc::collections::BTreeMap;
use core::cell::RefCell;

use wasm_bindgen::prelude::{JsError, wasm_bindgen};

use super::{Config, Simulation};

#[derive(Default)]
struct Registry {
    next_id: u32,
    runs: BTreeMap<u32, Simulation>,
}

thread_local! { static RUNS: RefCell<Registry> = RefCell::default(); }

#[wasm_bindgen]
pub fn simulation_abi_version() -> u32 {
    1
}

#[wasm_bindgen]
pub fn simulation_create(config: &str) -> Result<u32, JsError> {
    let config: Config =
        serde_json::from_str(config).map_err(|error| JsError::new(&error.to_string()))?;
    let simulation = Simulation::new(config).map_err(|error| JsError::new(&error))?;
    RUNS.with_borrow_mut(|registry| {
        let id = registry
            .next_id
            .checked_add(1)
            .ok_or_else(|| JsError::new("Simulation handle space is exhausted"))?;
        registry.next_id = id;
        registry.runs.insert(id, simulation);
        Ok(id)
    })
}

#[wasm_bindgen]
pub fn simulation_free(id: u32) {
    RUNS.with_borrow_mut(|registry| {
        registry.runs.remove(&id);
    });
}

#[wasm_bindgen]
pub fn simulation_buffer(id: u32) -> *const f64 {
    RUNS.with_borrow(|registry| {
        registry
            .runs
            .get(&id)
            .map_or(core::ptr::null(), |run| run.values().as_ptr())
    })
}

#[wasm_bindgen]
pub fn simulation_begin(id: u32) -> bool {
    RUNS.with_borrow_mut(|registry| registry.runs.get_mut(&id).is_some_and(Simulation::begin))
}

#[wasm_bindgen]
pub fn simulation_fire(id: u32, transition: u32, rate: f64) {
    RUNS.with_borrow_mut(|registry| {
        if let Some(run) = registry.runs.get_mut(&id) {
            run.fire(transition as usize, rate);
        }
    });
}

#[wasm_bindgen]
pub fn simulation_finish(id: u32) {
    RUNS.with_borrow_mut(|registry| {
        if let Some(run) = registry.runs.get_mut(&id) {
            run.finish();
        }
    });
}
