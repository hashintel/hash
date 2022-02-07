/**
 * This behavior causes the agent to approach a destination
 * using a greedy stochastic algorithm.
 */
function behavior(state, context) {
  // Only approach if I have a target destination and
  // am not waiting for a response
  if (!state.target_destination || state.waiting) {
    return;
  }

  const prev_pos = state.position;

  /** Check if moving would run into another agent */
  function newPositionFree(newPosition) {
    const newPosStr = JSON.stringify(newPosition);
    let free = true;
    context
      .neighbors()
      .filter((n) => !n.behaviors.includes("approach.js"))
      .forEach((n) => {
        if (JSON.stringify(n.position) == newPosStr) {
          free = false;
        }
      });

    return free;
  }

  /** Identify whether a move is in a positive or negative direction */
  function whichWay(diff) {
    if (diff > 0) {
      return 1;
    } else if (diff < 0) {
      return -1;
    } else {
      return 0;
    }
  }

  function setDirection() {
    const new_direction = state.position.map((p, i) => p - prev_pos[i]);
    if (!new_direction.every((p) => p === 0)) {
      state.direction = state.prev_direction.map(
        (d, i) => d + new_direction[i],
      );
      state.prev_direction = new_direction;
    }
  }

  // Determine a potential move in either the x or y directions
  const dx = state.target_destination[0] - state.position[0];
  const dy = state.target_destination[1] - state.position[1];

  const yMove = whichWay(dy);
  const xMove = whichWay(dx);

  const xMoveNewPos = [state.position[0] + xMove, state.position[1], 0];
  const yMoveNewPos = [state.position[0], state.position[1] + yMove, 0];

  // Check if they would be free
  const yMoveFree = newPositionFree(yMoveNewPos);
  const xMoveFree = newPositionFree(xMoveNewPos);

  // Switch to go_around mode if needed
  if (state.go_around === "y") {
    if (!xMoveFree) {
      state.position[1] += state.dy;
    } else {
      state.modify("dy", (i) => i * -1);
      // I can stop going around since x direction is open
      state.position = xMoveNewPos;
      state.go_around = "";
    }

    setDirection();
    return;
  } else if (state.go_around === "x") {
    if (!yMoveFree) {
      state.position[0] += state.dx;
    } else {
      state.modify("dx", (i) => i * -1);
      // I can stop going around since y direction is open
      state.position = yMoveNewPos;
      state.go_around = "";
    }

    setDirection();
    return;
  }

  // If both my moves are blocked start a roundabout move
  if ((!xMoveFree || xMove === 0) && (!yMoveFree || yMove === 0)) {
    if (xMove === 0) {
      state.go_around = "x";
    } else if (yMove === 0) {
      state.go_around = "y";
    }
  }
  // Otherwise move to unblocked spot
  else if (!xMoveFree) {
    state.position = yMoveNewPos;
  } else if (!yMoveFree) {
    state.position = xMoveNewPos;
  } else {
    // Otherwise close the longest distance
    if (Math.abs(dy) > Math.abs(dx)) {
      state.position = yMoveNewPos;
    } else {
      state.position = xMoveNewPos;
    }
  }

  // Set direction for visualization
  setDirection();
}
