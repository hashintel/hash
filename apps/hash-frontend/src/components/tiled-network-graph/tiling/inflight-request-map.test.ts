import { describe, expect, it, vi } from "vitest";

import {
  inflightRequestBindingFor,
  shareInflightRequest,
  type InflightRequestBinding,
} from "./inflight-request-map";

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason?: unknown) => void;
}

const deferred = <Value>(): Deferred<Value> => {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const bindingRef = (): {
  current: InflightRequestBinding<string, string>;
} => ({
  current: { signature: "binding-a", entries: new Map() },
});

const renderLocateBinding = (
  holder: ReturnType<typeof bindingRef>,
  signature: string,
) => {
  const ref = holder;
  const entries = () => {
    ref.current = inflightRequestBindingFor(ref.current, signature);
    return ref.current.entries;
  };

  return {
    entries,
    locate: (
      entityId: string,
      request: () => Promise<string>,
    ): Promise<string> => shareInflightRequest(entries(), entityId, request),
  };
};

describe("shareInflightRequest", () => {
  it.each(["resolve", "reject"] as const)(
    "leaves a successor binding intact when a retired request %ss",
    async (settlement) => {
      const ref = bindingRef();
      const renderA = renderLocateBinding(ref, "binding-a");
      const bindingA = renderA.entries();
      const requestA = deferred<string>();
      const promiseA = renderA.locate("entity-a", () => requestA.promise);
      void promiseA.catch(() => undefined);

      const renderB = renderLocateBinding(ref, "binding-b");
      const bindingB = renderB.entries();
      expect(bindingB).not.toBe(bindingA);
      expect(bindingB.size).toBe(0);

      const requestB = deferred<string>();
      const startB = vi.fn(() => requestB.promise);
      const promiseB = renderB.locate("entity-b", startB);

      if (settlement === "resolve") {
        requestA.resolve("a");
        await promiseA;
      } else {
        requestA.reject(new Error("a failed"));
        await expect(promiseA).rejects.toThrow("a failed");
      }
      await Promise.resolve();

      expect(bindingA.has("entity-a")).toBe(false);
      expect(ref.current.signature).toBe("binding-b");
      expect(ref.current.entries).toBe(bindingB);
      expect(bindingB.get("entity-b")).toBe(promiseB);
      expect(renderB.locate("entity-b", startB)).toBe(promiseB);
      expect(startB).toHaveBeenCalledTimes(1);

      requestB.resolve("b");
      await promiseB;
    },
  );

  it("reuses a binding while its signature is unchanged", () => {
    const binding: InflightRequestBinding<string, string> = {
      signature: "binding",
      entries: new Map(),
    };

    expect(inflightRequestBindingFor(binding, binding.signature)).toBe(binding);
  });

  it("does not let a retired promise remove its same-map replacement", async () => {
    const entries = new Map<string, Promise<string>>();
    const retired = deferred<string>();
    const replacement = deferred<string>();
    const retiredPromise = shareInflightRequest(
      entries,
      "entity",
      () => retired.promise,
    );

    entries.delete("entity");
    const replacementPromise = shareInflightRequest(
      entries,
      "entity",
      () => replacement.promise,
    );
    retired.resolve("retired");
    await retiredPromise;
    await Promise.resolve();

    expect(entries.get("entity")).toBe(replacementPromise);

    replacement.resolve("replacement");
    await replacementPromise;
  });
});
