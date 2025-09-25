import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private counters = new Map<string, number>();
  private histograms = new Map<string, { buckets: number[]; counts: number[]; sum: number; count: number }>();
  private gauges = new Set<string>();

  registerGauge(name: string) {
    this.gauges.add(name);
    if (!this.counters.has(name)) this.counters.set(name, 0);
  }

  inc(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }
  dec(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) - value);
  }
  observe(name: string, value: number, buckets: number[]) {
    let h = this.histograms.get(name);
    if (!h) {
      const sorted = [...buckets].sort((a,b)=>a-b);
      h = { buckets: sorted, counts: new Array(sorted.length + 1).fill(0), sum: 0, count: 0 }; // last bucket = +Inf
      this.histograms.set(name, h);
    }
    // Assure même configuration
    if (h.buckets.length !== buckets.length) {
      // ignore mismatched shapes
    }
    let placed = false;
    for (let i=0;i<h.buckets.length;i++) {
      if (value <= h.buckets[i]) { h.counts[i]++; placed = true; break; }
    }
    if (!placed) h.counts[h.counts.length -1]++; // +Inf bucket
    h.sum += value; h.count += 1;
  }

  snapshot() {
    return Object.fromEntries(this.counters.entries());
  }

  reset() { this.counters.clear(); }
  resetAll() {
    this.counters.clear();
    this.histograms.clear();
    // Ré-initialiser les gauges à 0 pour conserver exposition
    for (const g of this.gauges) this.counters.set(g, 0);
  }

  toPrometheus(prefix = 'sourcekuizz') {
    // Génère exposition simple Prometheus pour tous les compteurs
    const lines: string[] = [];
    for (const [k, v] of this.counters.entries()) {
      const metricBase = k.replace(/[^a-zA-Z0-9_]/g, '_');
      if (this.gauges.has(k)) {
        const metricName = `${prefix}_${metricBase}`;
        lines.push(`# HELP ${metricName} Gauge for ${k}`);
        lines.push(`# TYPE ${metricName} gauge`);
        lines.push(`${metricName} ${v}`);
      } else {
        const metricName = `${prefix}_${metricBase}_total`;
        lines.push(`# HELP ${metricName} Counter for ${k}`);
        lines.push(`# TYPE ${metricName} counter`);
        lines.push(`${metricName} ${v}`);
      }
    }
    // Histograms
    for (const [k, h] of this.histograms.entries()) {
      const metricBase = k.replace(/[^a-zA-Z0-9_]/g, '_');
      const metricName = `${prefix}_${metricBase}`;
      lines.push(`# HELP ${metricName} Histogram for ${k}`);
      lines.push(`# TYPE ${metricName} histogram`);
      let cumulative = 0;
      for (let i=0;i<h.buckets.length;i++) {
        cumulative += h.counts[i];
        lines.push(`${metricName}_bucket{le="${h.buckets[i]}"} ${cumulative}`);
      }
      cumulative += h.counts[h.counts.length -1];
      lines.push(`${metricName}_bucket{le="+Inf"} ${cumulative}`);
      lines.push(`${metricName}_sum ${h.sum}`);
      lines.push(`${metricName}_count ${h.count}`);
    }
    return lines.join('\n') + '\n';
  }
}
