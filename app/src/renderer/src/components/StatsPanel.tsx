import { useMemo, type ReactNode } from 'react'
import { Line } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions
} from 'chart.js'
import { useAppSelector } from '../store'
import { formatBytes } from './ui'
import { cpuWarnThreshold, isCpuHigh } from '../lib/stats'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const clock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function useColors(): { accent: string; warn: string; muted: string; grid: string } {
  const css = getComputedStyle(document.documentElement)
  return {
    accent: css.getPropertyValue('--accent').trim() || '#0e7490',
    warn: css.getPropertyValue('--warn').trim() || '#b45309',
    muted: css.getPropertyValue('--muted').trim() || '#888',
    grid: css.getPropertyValue('--border').trim() || '#ddd'
  }
}

interface Series {
  label: string
  data: number[]
  color: string
}

function LineChart(props: {
  title: string
  times: number[]
  series: Series[]
  format: (v: number) => string
  colors: ReturnType<typeof useColors>
}): ReactNode {
  const { title, times, series, format, colors } = props
  const data = {
    labels: times.map(clock),
    datasets: series.map((s) => ({
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: s.color + '22',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.25,
      fill: series.length === 1
    }))
  }
  const options: ChartOptions<'line'> = {
    animation: false,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: series.length > 1, labels: { color: colors.muted } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${format(c.parsed.y ?? 0)}` } }
    },
    scales: {
      x: { ticks: { color: colors.muted, maxTicksLimit: 6 }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: colors.muted, callback: (v) => format(Number(v)) }, grid: { color: colors.grid } }
    }
  }
  return (
    <div className="card chart-card" data-testid={`chart-${title}`}>
      <h3>{title}</h3>
      <div className="chart-box">
        <Line data={data} options={options} />
      </div>
    </div>
  )
}

/** One container's time series from the stats store. */
export function StatsPanel({ containerId }: { containerId: string }): ReactNode {
  const stats = useAppSelector((s) => s.stats)
  const ncpu = useAppSelector((s) => s.engine.status?.ncpu ?? 1)
  const colors = useColors()
  const pts = stats.byContainer[containerId] ?? []
  const last = pts[pts.length - 1]
  const times = useMemo(() => pts.map((p) => p.timestamp), [pts])
  const high = !!last && isCpuHigh(last.cpuPercentage, ncpu)

  if (stats.status === 'error' && !pts.length)
    return <div className="empty card">Stats unavailable: {stats.error}</div>
  if (!pts.length)
    return <div className="empty card">No stats yet — the container must be running; samples arrive every few seconds.</div>

  const cpuColor = high ? colors.warn : colors.accent
  return (
    <>
      <div className="toolbar" data-testid="stats-summary">
        <span>
          CPU usage:{' '}
          <strong className={high ? 'cpu-warn' : ''} data-testid="cpu-now">
            {last.cpuPercentage.toFixed(2)}%
          </strong>
        </span>
        <span>
          Memory:{' '}
          <strong>
            {formatBytes(last.memoryUsageBytes)} / {formatBytes(last.memoryLimitBytes)} ({last.memoryPercentage.toFixed(2)}%)
          </strong>
        </span>
        <span className="muted">PIDs {last.pids}</span>
        <span className="muted">
          warning above {cpuWarnThreshold(ncpu)}% ({ncpu} CPU{ncpu === 1 ? '' : 's'}) · {pts.length} samples kept (max 1h)
        </span>
      </div>
      <div className="charts">
        <LineChart title="CPU (%)" times={times} colors={colors} format={(v) => `${v}%`} series={[{ label: 'CPU', data: pts.map((p) => p.cpuPercentage), color: cpuColor }]} />
        <LineChart title="Memory" times={times} colors={colors} format={formatBytes} series={[{ label: 'Usage', data: pts.map((p) => p.memoryUsageBytes), color: colors.accent }]} />
        <LineChart
          title="Disk read/write (cumulative)"
          times={times}
          colors={colors}
          format={formatBytes}
          series={[
            { label: 'Read', data: pts.map((p) => p.blockIOReadBytes), color: colors.accent },
            { label: 'Write', data: pts.map((p) => p.blockIOWriteBytes), color: '#d97706' }
          ]}
        />
        <LineChart
          title="Network I/O (cumulative)"
          times={times}
          colors={colors}
          format={formatBytes}
          series={[
            { label: 'Received', data: pts.map((p) => p.networkIOReadBytes), color: colors.accent },
            { label: 'Sent', data: pts.map((p) => p.networkIOWriteBytes), color: '#d97706' }
          ]}
        />
      </div>
    </>
  )
}
