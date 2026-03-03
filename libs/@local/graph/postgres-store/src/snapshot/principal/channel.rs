use core::{
    pin::Pin,
    result::Result as StdResult,
    task::{Context, Poll, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _,
    channel::mpsc::{self, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use type_system::principal::{Actor, ActorGroup, Principal};

use super::{
    batch::PrincipalRowBatch,
    table::{ActorRoleRow, AiActorRow, MachineActorRow, RoleRow, TeamRow, UserActorRow, WebRow},
};
use crate::snapshot::SnapshotRestoreError;

/// A sink to insert [`Principal`]s.
///
/// An `PrincipalSender` with the corresponding [`PrincipalReceiver`] are created using the
/// [`channel`] function.
#[derive(Debug, Clone)]
pub struct PrincipalSender {
    users: Sender<UserActorRow>,
    machines: Sender<MachineActorRow>,
    ais: Sender<AiActorRow>,
    actor_roles: Sender<ActorRoleRow>,
    webs: Sender<WebRow>,
    teams: Sender<TeamRow>,
    roles: Sender<RoleRow>,
}

// This is a direct wrapper around `Sink<mpsc::Sender<AccountRow>>` with error-handling added
// to make it easier to use.
impl Sink<Principal> for PrincipalSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.users.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll user sender")?;
        ready!(self.machines.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll machine sender")?;
        ready!(self.ais.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll ai sender")?;
        ready!(self.actor_roles.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll actor role sender")?;
        ready!(self.webs.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll web sender")?;
        ready!(self.teams.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll team sender")?;
        ready!(self.roles.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll role sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, item: Principal) -> StdResult<(), Self::Error> {
        match item {
            Principal::Actor(actor) => {
                for role in actor.roles() {
                    self.actor_roles
                        .start_send_unpin(ActorRoleRow {
                            actor_id: actor.id().into(),
                            role_id: role.into(),
                        })
                        .change_context(SnapshotRestoreError::Read)
                        .attach("could not send user role")?;
                }
                match actor {
                    Actor::User(user) => self
                        .users
                        .start_send_unpin(UserActorRow { id: user.id })
                        .change_context(SnapshotRestoreError::Read)
                        .attach("could not send user"),
                    Actor::Machine(machine) => self
                        .machines
                        .start_send_unpin(MachineActorRow {
                            id: machine.id,
                            identifier: machine.identifier,
                        })
                        .change_context(SnapshotRestoreError::Read)
                        .attach("could not send machine"),
                    Actor::Ai(ai) => self
                        .ais
                        .start_send_unpin(AiActorRow {
                            id: ai.id,
                            identifier: ai.identifier,
                        })
                        .change_context(SnapshotRestoreError::Read)
                        .attach("could not send AI"),
                }
            }
            Principal::ActorGroup(ActorGroup::Web(web)) => self
                .webs
                .start_send_unpin(WebRow {
                    id: web.id,
                    shortname: web.shortname,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send web"),
            Principal::ActorGroup(ActorGroup::Team(team)) => self
                .teams
                .start_send_unpin(TeamRow {
                    id: team.id,
                    parent_id: team.parent_id.into(),
                    name: team.name,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send team"),
            Principal::Role(role) => self
                .roles
                .start_send_unpin(RoleRow {
                    id: role.id().into(),
                    principal_type: role.id().role_type().into(),
                    actor_group_id: role.actor_group_id().into(),
                    name: role.name(),
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send role"),
        }
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.users.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush user sender")?;
        ready!(self.machines.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush machine sender")?;
        ready!(self.ais.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush ai sender")?;
        ready!(self.actor_roles.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush actor role sender")?;
        ready!(self.webs.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush web sender")?;
        ready!(self.teams.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush team sender")?;
        ready!(self.roles.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush role sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.users.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close user sender")?;
        ready!(self.machines.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close machine sender")?;
        ready!(self.ais.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close ai sender")?;
        ready!(self.actor_roles.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close actor role sender")?;
        ready!(self.webs.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close web sender")?;
        ready!(self.teams.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close team sender")?;
        ready!(self.roles.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close role sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to emit [`PrincipalRowBatch`]es.
///
/// An [`PrincipalSender`] with the corresponding `PrincipalReceiver` are created using the
/// [`channel`] function.
pub struct PrincipalReceiver {
    stream: SelectAll<BoxStream<'static, PrincipalRowBatch>>,
}

impl Stream for PrincipalReceiver {
    type Item = PrincipalRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`PrincipalSender`] and [`PrincipalReceiver`] pair.
///
/// The `chunk_size` parameter determines the number of ids are sent in a single batch.
pub fn channel(chunk_size: usize) -> (PrincipalSender, PrincipalReceiver) {
    let (users_tx, users_rx) = mpsc::channel(chunk_size);
    let (machines_tx, machines_rx) = mpsc::channel(chunk_size);
    let (ais_tx, ais_rx) = mpsc::channel(chunk_size);
    let (actor_roles_tx, actor_roles_rx) = mpsc::channel(chunk_size);
    let (webs_tx, webs_rx) = mpsc::channel(chunk_size);
    let (teams_tx, teams_rx) = mpsc::channel(chunk_size);
    let (roles_tx, roles_rx) = mpsc::channel(chunk_size);

    (
        PrincipalSender {
            users: users_tx,
            machines: machines_tx,
            ais: ais_tx,
            actor_roles: actor_roles_tx,
            webs: webs_tx,
            teams: teams_tx,
            roles: roles_tx,
        },
        PrincipalReceiver {
            stream: select_all(vec![
                users_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::Users)
                    .boxed(),
                machines_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::Machines)
                    .boxed(),
                ais_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::Ais)
                    .boxed(),
                actor_roles_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::ActorRoles)
                    .boxed(),
                webs_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::Webs)
                    .boxed(),
                teams_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::Teams)
                    .boxed(),
                roles_rx
                    .ready_chunks(chunk_size)
                    .map(PrincipalRowBatch::Roles)
                    .boxed(),
            ]),
        },
    )
}
