import {
  CalculatedHistogramOptions,
  CalculatedMetricOptions,
  CalculatedSummaryOptions,
  Connection,
  Counter,
  CounterGroup,
  Histogram,
  HistogramGroup,
  HistogramOptions,
  Metric as LibMetric,
  MetricGroup,
  MetricOptions,
  MultiaddrConnection,
  Metrics as P2pMetrics,
  Stream,
  Summary,
  SummaryGroup,
  SummaryOptions,
} from "@libp2p/interface";
import { Effect, MetricKey, MetricKeyType } from "effect";
import { MetricRegistry, MutableHashMap, Predicate } from "effect";
import { UnknownException } from "effect/Cause";

const TypeId = Symbol("@local/harpc-client/net/NetworkMetrics");
export type TypeId = typeof TypeId;

export interface NetworkMetrics extends P2pMetrics {
  readonly [TypeId]: TypeId;
}

interface NetworkMetricsImpl extends NetworkMetrics {
  readonly [TypeId]: TypeId;

  readonly registry: MetricRegistry.MetricRegistry;
  readonly polling: MutableHashMap.MutableHashMap<
    MetricKey.MetricKey<MetricKeyType.MetricKeyType.Untyped>,
    Effect.Effect<void, UnknownException>
  >;
}

const ensurePromise = <A>(value: A | Promise<A>): Promise<A> =>
  Predicate.isPromise(value) ? value : Promise.resolve(value);

const NetworkMetricsProto: Omit<NetworkMetricsImpl, "registry" | "polling"> = {
  [TypeId]: TypeId,

  trackMultiaddrConnection(connection) {},
  trackProtocolStream(stream, connection) {},

  registerMetric(this: NetworkMetricsImpl, name, options) {
    const key = MetricKey.gauge(name, {
      description: options?.label ?? options?.help,
      bigint: false,
    });

    const metric = this.registry.get(key);

    if (Predicate.hasProperty(options, "calculate")) {
      MutableHashMap.set(
        this.polling,
        key,
        Effect.tryPromise(() => ensurePromise(options.calculate())).pipe(
          Effect.map((value) => metric.update(value)),
        ),
      );

      return;
    }

    return {
      update(value: number) {
        metric.update(value);
      },
      increment(value?: number) {
        metric.modify(value ?? 1);
      },
      decrement(value?: number) {
        metric.modify(-(value ?? 1));
      },
      reset() {
        metric.update(0);
      },
    } as LibMetric;
  },
};
