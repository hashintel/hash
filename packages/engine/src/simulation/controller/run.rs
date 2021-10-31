use futures::FutureExt;
use std::sync::Arc;
use tokio::time::Duration;

use crate::datastore::prelude::{SharedStore, Store};

use crate::experiment::controller::comms::exp_pkg_update::ExpPkgUpdateSend;
use crate::experiment::controller::comms::sim_status::SimStatusSend;
use crate::experiment::controller::comms::simulation::SimCtlRecv;
use crate::experiment::package::{StepOutputResponsePayload, StepUpdate, UpdateRequest};
use crate::output::SimulationOutputPersistenceRepr;
use crate::proto::{ExperimentRunBase, SimulationShortID};
use crate::simulation::agent_control::AgentControl;
use crate::simulation::comms::Comms;
use crate::simulation::controller::sim_control::SimControl;
use crate::simulation::engine::Engine;
use crate::simulation::packages::run::Packages;
use crate::simulation::status::SimStatus;
use crate::simulation::step_result::SimulationStepResult;
use crate::SimRunConfig;

use super::Result;

enum LoopControl {
    Continue,
    Stop,
}

fn create_update_for_exp_pkg(
    sim_id: SimulationShortID,
    step_result: &SimulationStepResult,
    exp_pkg_update_request: &Option<UpdateRequest>,
) -> Result<StepUpdate> {
    Ok(StepUpdate {
        sim_id,
        payload: StepOutputResponsePayload {
            analysis_output: None,
        },
        was_error: false,
        stop_signal: false,
    })
}

pub async fn sim_run<P: SimulationOutputPersistenceRepr>(
    config: Arc<SimRunConfig<ExperimentRunBase>>,
    shared_store: Arc<SharedStore>,
    comms: Comms,
    packages: Packages,
    mut sim_from_exp: SimCtlRecv,
    mut sims_to_exp: SimStatusSend,
    mut persistence_service: P,
    // TODO[2] remove this and stop using it, add a step_update
    //         field to SimStatus, whereby on receiving the SimStatus,
    //         the exp controller would pass on the step_update to the
    //         exp package
    exp_pkg_update_request: Option<UpdateRequest>,
    exp_pkg_update_send: ExpPkgUpdateSend,
) -> Result<()> {
    let sim_run_id = config.sim.id;
    let max_num_steps = config.sim.max_num_steps;
    log::info!(
        "Beginning simulation run with id {} for a maximum of {} steps",
        &sim_run_id,
        max_num_steps,
    );

    let uninitialized_store = Store::new_uninitialized(shared_store, &config);

    // TODO[1] add initial payload to persistence_service here (0th step)
    let mut engine = Engine::new(packages, uninitialized_store, comms, config.clone()).await?;

    let now = std::time::Instant::now();
    let mut steps_taken = 0;
    let mut early_stop = false;
    let mut stop_msg = None;
    'sim_main: loop {
        // `sim.current_step` is -1 if `next` has not been called
        let next_step_index = steps_taken;
        if next_step_index >= max_num_steps {
            break;
        }

        if let LoopControl::Stop = maybe_handle_sim_ctl_msg(&mut sim_from_exp).await? {
            // The experiment controller has signalled to stop
            break;
        }

        // Take a step in the simulation
        let result = match engine.next().await {
            Ok(step_result) => step_result,
            Err(error) => {
                log::error!("Got error within the engine step process: {:?}", error);
                // Try to persist before exiting
                let persistence_result = persistence_service.finalize().await?;
                sims_to_exp
                    .send(SimStatus::error(
                        sim_run_id,
                        steps_taken as isize,
                        error.into(),
                        persistence_result,
                    ))
                    .await?;
                exp_pkg_update_send
                    .send(StepUpdate {
                        sim_id: sim_run_id,
                        was_error: true,
                        ..StepUpdate::default()
                    })
                    .await?;
                return Err(error.into());
            }
        };
        let step_result = engine.next().await?;

        // Send update to experiment package
        let output_response =
            create_update_for_exp_pkg(config.sim.id, &step_result, &exp_pkg_update_request)?;
        exp_pkg_update_send.send(output_response).await?;

        // Persist the output
        persistence_service.add_step_output(step_result.output)?;
        if let AgentControl::Stop(msg) = step_result.agent_control {
            early_stop = true;
            stop_msg = Some(msg);
            break 'sim_main; // Break before `send`, because stop messages (like
                             // other messages) are handled at the start of a step,
                             // before running behaviors, so the stop message was
                             // already sent on the previous step.
        }

        sims_to_exp.send(SimStatus::running(config.sim.id, *steps_taken))?;

        *steps_taken += 1;
    }
    let main_loop_dur = now.elapsed().as_millis();

    // Tell the experiment controller that the sim is stopping
    sims_to_exp.send(SimStatus::stop_signal(sim_run_id))?;
    // Also tell the package that the sim is stopping
    exp_pkg_update_send.send(StepUpdate {
        sim_id: sim_run_id,
        payload: Default::default(),
        was_error: false,
        stop_signal: true,
    });

    let now = std::time::Instant::now();
    let persistence_result = persistence_service.finalize().await?;
    sims_to_exp.send(SimStatus::ended(
        sim_run_id.clone(),
        *steps_taken,
        early_stop,
        stop_msg,
        persistence_result,
    )?)?;
    let persistence_dur = now.elapsed().as_millis();

    log::info!(
        "Finished simulation run. Main loop took {} ms. Persistence took: {} ms",
        main_loop_dur,
        persistence_dur
    );

    // Allow experiment main loop to receive statuses.
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(())
}

async fn maybe_handle_sim_ctl_msg(sim_from_exp: &mut SimCtlRecv) -> Result<LoopControl> {
    if let Some(Some(control)) = sim_from_exp.recv().now_or_never() {
        match control {
            SimControl::Pause => loop {
                if let Some(control) = sim_from_exp.recv().await {
                    match control {
                        SimControl::Pause => {
                            log::warn!("Pausing when already paused");
                        }
                        SimControl::Resume => {
                            break;
                        }
                        SimControl::Stop => return Ok(LoopControl::Stop),
                    }
                } else {
                    log::warn!("Experiment runner exited while paused.");
                    return Ok(LoopControl::Stop);
                }
            },
            SimControl::Resume => {
                log::warn!("Resuming when not paused");
            }
            SimControl::Stop => return Ok(LoopControl::Stop),
        }
    }
    return Ok(LoopControl::Continue);
}
