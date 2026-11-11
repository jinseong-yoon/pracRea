// CPU warning rule from the analysed app: warn when CPU% exceeds 80% of the engine's CPU count
// (docker reports CPU% per core, so a full machine is ncpu * 100%).
export const CPU_WARN_FRACTION = 0.8
export const cpuWarnThreshold = (ncpu: number): number => CPU_WARN_FRACTION * 100 * Math.max(1, ncpu)
export const isCpuHigh = (cpuPercent: number, ncpu: number): boolean => cpuPercent > cpuWarnThreshold(ncpu)
