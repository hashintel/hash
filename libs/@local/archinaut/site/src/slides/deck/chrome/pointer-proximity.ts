export interface ProximityOptions {
  radius?: number;
  settleMs?: number;
  leaveMs?: number;
}

export function observePointerProximity(
  element: Pick<HTMLElement, "getBoundingClientRect">,
  onChange: (near: boolean) => void,
  { radius = 80, settleMs = 0, leaveMs = 0 }: ProximityOptions = {},
  retainWithin?: Pick<HTMLElement, "getBoundingClientRect">,
) {
  let timer: number | undefined;
  let leaveTimer: number | undefined;
  let inside = false;
  let previous: { x: number; y: number } | undefined;
  let distance = 0;
  let settledFor = 0;
  let sampledAt = 0;
  let active = false;

  const update = (next: boolean) => {
    if (active === next) return;
    active = next;
    onChange(next);
  };

  const clearTimer = () => {
    window.clearInterval(timer);
    timer = undefined;
  };
  const cancelLeave = () => {
    window.clearTimeout(leaveTimer);
    leaveTimer = undefined;
  };
  const reset = () => {
    clearTimer();
    cancelLeave();
    inside = false;
    previous = undefined;
    distance = 0;
    settledFor = 0;
    update(false);
  };
  const leave = () => {
    if (!active || leaveMs === 0) {
      reset();
      return;
    }
    if (leaveTimer === undefined)
      leaveTimer = window.setTimeout(reset, leaveMs);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons !== 0) {
      reset();
      return;
    }
    const retained = active ? retainWithin?.getBoundingClientRect() : undefined;
    if (
      retained &&
      event.clientX >= retained.left &&
      event.clientX <= retained.right &&
      event.clientY >= retained.top &&
      event.clientY <= retained.bottom
    ) {
      cancelLeave();
      return;
    }
    const rect = element.getBoundingClientRect();
    const dx = Math.max(
      rect.left - event.clientX,
      0,
      event.clientX - rect.right,
    );
    const dy = Math.max(
      rect.top - event.clientY,
      0,
      event.clientY - rect.bottom,
    );
    if (Math.hypot(dx, dy) > radius) {
      leave();
      return;
    }
    cancelLeave();
    if (active) return;
    if (previous) {
      distance += Math.hypot(
        event.clientX - previous.x,
        event.clientY - previous.y,
      );
    }
    previous = { x: event.clientX, y: event.clientY };
    if (inside) return;
    inside = true;
    if (settleMs === 0) {
      update(true);
      return;
    }
    sampledAt = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - sampledAt;
      settledFor = distance / elapsed <= 0.12 ? settledFor + elapsed : 0;
      distance = 0;
      sampledAt = now;
      if (settledFor < settleMs) return;
      clearTimer();
      update(true);
    }, 100);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) leave();
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  if (settleMs > 0) window.addEventListener("pointerdown", reset);
  window.addEventListener("pointerout", onPointerOut);
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  return () => {
    clearTimer();
    cancelLeave();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", reset);
    window.removeEventListener("pointerout", onPointerOut);
    window.removeEventListener("blur", reset);
    window.removeEventListener("resize", reset);
  };
}
