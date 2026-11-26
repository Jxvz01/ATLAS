/**
 * ATLAS Field Network State Detector
 * Distinguishes ONLINE, LOW_BANDWIDTH (2G/degraded), OFFLINE, and SYNCING
 * using actual API latency, consecutive failures, navigator.onLine, and Network Information API.
 */
export type NetworkState = 'ONLINE' | 'LOW_BANDWIDTH' | 'OFFLINE' | 'SYNCING';

class NetworkMonitor {
  private consecutiveFailures = 0;
  private lastLatencyMs: number | null = null;
  private isSyncing = false;
  private manualLowBandwidth: boolean = localStorage.getItem('atlas_low_bw') === 'true';

  public isManualLowBandwidth(): boolean {
    return this.manualLowBandwidth;
  }

  public setManualLowBandwidth(enabled: boolean): void {
    this.manualLowBandwidth = enabled;
    localStorage.setItem('atlas_low_bw', enabled ? 'true' : 'false');
  }

  public recordSuccess(latencyMs: number): void {
    this.consecutiveFailures = 0;
    this.lastLatencyMs = latencyMs;
  }

  public recordFailure(): void {
    this.consecutiveFailures += 1;
  }

  public setSyncing(syncing: boolean): void {
    this.isSyncing = syncing;
  }

  public getLastLatencyMs(): number | null {
    return this.lastLatencyMs;
  }

  public getEffectiveConnectionType(): string | null {
    const nav = navigator as any;
    return nav?.connection?.effectiveType || null;
  }

  public getState(): NetworkState {
    if (this.isSyncing) return 'SYNCING';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'OFFLINE';
    if (this.consecutiveFailures >= 2) return 'OFFLINE';

    const eff = this.getEffectiveConnectionType();
    if (
      this.manualLowBandwidth ||
      eff === 'slow-2g' ||
      eff === '2g' ||
      (this.lastLatencyMs !== null && this.lastLatencyMs > 1200)
    ) {
      return 'LOW_BANDWIDTH';
    }
    return 'ONLINE';
  }

  public getAdaptivePollIntervalMs(): number {
    const state = this.getState();
    if (state === 'OFFLINE') return 15000;
    if (state === 'LOW_BANDWIDTH') return 10000;
    return 2500;
  }
}

export const networkMonitor = new NetworkMonitor();
