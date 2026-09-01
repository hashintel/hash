# Status Views

A status view maps net state to named statuses — Todo, In Progress, Blocked, Done — for the instances of one identity, such as tickets or machines. Which status an instance carries is derived from where its token sits; it is never stored, so a status view can never disagree with the net.

Status views power three surfaces:

- status badges and tinting on component-instance nodes on the canvas,
- the Kanban board projection of the net,
- status-change and dwell information in Actual mode's Events tab.

## Identities

An identity names the thing a status view tracks, e.g. "Ticket". To declare one, open a type's properties and pick **New identity** on the dimension that carries the instance's key (an id-like attribute — a `uuid` or `string` dimension works well). Tokens whose key values are equal are the same instance, even across different types: give each type's key dimension the same identity, and a machine that changes type as it moves through the net keeps one status history.

Transition kernels must copy the key attribute from input token to output token — a kernel that drops the key ends the recorded history for that instance.

A token whose key was never set is not tracked: an unset `uuid` key (the nil UUID) or an empty `string` key marks the token as untracked rather than merging every such token into one instance. When several tokens carry the same key in one frame, they count as one instance — the first matching label (in label order, then place order) decides its status.

## Creating a status view

Open the **Simulate** mode and pick the **Status views** tab, then **Create**. A status view has:

- **Identity** — which instances the view tracks.
- **Labels** — the statuses, in order. Label order is the Kanban column order, and when several labels could match, the first one wins. Each label maps to a set of places: a token in any of those places carries the label. A component instance's internal places appear in the picker as `InstanceName::PlaceName`.
- **Token conditions** — an optional boolean expression over the token's attributes, e.g. `token.attempts > 0`. The label applies only while the token is in the label's places AND the condition holds, so "Retrying" can be the same place as "In Progress" with a condition on the attempts attribute. A condition that is still compiling, or fails to compile, makes its label match nothing (the board shows a notice), so a broken condition never widens a label to every token.
- **Exit label** — at most one label can be the exit label. It has no places: it applies to instances whose token has left every place of the view, e.g. consumed outright by a final transition. Model distinct terminal statuses (Done vs Failed) as ordinary labels on sink places; use the exit label as the catch-all.

## Kanban board

When the net has at least one status view, a toggle at the top of the canvas switches between the net canvas and the **Kanban board**. Columns are the selected view's labels in order, with the exit label last. Each card is one tracked instance, showing its key value, the time it has spent in its current status, and — when it has entered the status more than once, e.g. through a review loop — the entry count.

The board reads the same frames as the canvas: simulation playback in Edit mode, or the live stream in Actual mode. Scrub the timeline and the board follows.

## Timing

All durations derive from the firing history — the recorded wall-clock timestamps in Actual mode, simulated time otherwise. Because a token can re-enter a status, time-in-status is a set of intervals; displays show the total plus the entry count.

In Actual mode, the Events tab gains a **Status changes** column when the net declares a status view and the stream's firings carry token values: each row lists which instances changed status and how long they spent in the previous one.

## Examples

The **Ticket Processing** example ships a complete status view over a ticket workflow, including a review loop and an archived exit label. **Deployment Pipeline** and **Production with Machine Failure** carry status views too — the latter tracks machines across two token types.
