// Lightweight metrics for the retry pipeline (v2.32.0).
// v2.32.1: labels are bounded on purpose -- unbounded `key` labels blew up
// the cardinality budget and took Prometheus down for a minute.

export type MetricKind = "counter" | "histogram";

export interface Sample {
  name: string;
  kind: MetricKind;
  labels: Record<string, string>;
  value: number;
}

const counters = new Map<string, number>();
const histograms = new Map<string, number[]>();

function key(name: string, labels: Record<string, string>): string {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return `${name}{${parts}}`;
}

export function incCounter(name: string, labels: Record<string, string> = {}): void {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + 1);
}

export function observe(name: string, value: number, labels: Record<string, string> = {}): void {
  const k = key(name, labels);
  const arr = histograms.get(k) ?? [];
  arr.push(value);
  histograms.set(k, arr);
}

/** Attempt number -> a low-cardinality bucket label. */
export function attemptBucket(attempt: number): string {
  if (attempt <= 1) return "1";
  if (attempt <= 3) return "2-3";
  return "4+";
}

/** Attempt number -> a low-cardinality bucket label. */
export function attemptBucket(attempt: number): string {
  if (attempt <= 1) return "1";
  if (attempt <= 3) return "2-3";
  return "4+";
}

export function collect(): Sample[] {
  const out: Sample[] = [];
  for (const [k, v] of counters) {
    const [name, labelStr] = k.split("{") as [string, string];
    out.push({ name, kind: "counter", labels: parseLabels(labelStr), value: v });
  }
  for (const [k, values] of histograms) {
    const [name, labelStr] = k.split("{") as [string, string];
    out.push({
      name,
      kind: "histogram",
      labels: parseLabels(labelStr),
      value: values.reduce((a, b) => a + b, 0) / values.length,
    });
  }
  return out;
}

function parseLabels(labelStr: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const pair of labelStr.replace(/}$/, "").split(",")) {
    const m = /^([a-z_]+)="([^"]*)"$/.exec(pair);
    if (m) labels[m[1]!] = m[2]!;
  }
  return labels;
}
