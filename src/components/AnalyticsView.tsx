import React, { useState } from 'react';
import {
  DailyRescuePoint,
  ExecutionRunRecord,
  LocalVaultItem,
  TelemetryConfig,
} from '../types/pulsevault';

interface AnalyticsViewProps {
  history: DailyRescuePoint[];
  executionLog: ExecutionRunRecord[];
  vaultItems: LocalVaultItem[];
  telemetry: TelemetryConfig;
}

export function AnalyticsView({
  history,
  executionLog,
  vaultItems,
  telemetry,
}: AnalyticsViewProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalRescuedMb = history.reduce((sum, p) => sum + p.rescued_mb, 0);
  const totalRescuedGb = totalRescuedMb / 1024;
  const totalValueSaved = Math.round(totalRescuedGb * telemetry.rate_per_gb);

  const totalAvailableSurplusMb = history.reduce(
    (sum, p) => sum + Math.max(0, p.daily_limit_mb - p.used_mb - telemetry.safety_buffer_mb),
    0
  );
  const avgEfficiency =
    totalAvailableSurplusMb > 0
      ? Math.min(100, Math.round((totalRescuedMb / totalAvailableSurplusMb) * 100))
      : 0;

  // Estimate ~420 MB per hour of mixed 720p/audio playback banked
  const vaultMinutes = vaultItems.reduce((sum, v) => sum + v.duration_min, 0);
  const historicalHours = Math.round((totalRescuedMb / 420) * 10) / 10;
  const totalPlaybackHours = (historicalHours + vaultMinutes / 60).toFixed(1);

  const categoryTotals = vaultItems.reduce(
    (acc, item) => {
      acc[item.category] += item.size_mb;
      return acc;
    },
    { Audio: 0, Lecture: 0, PersonalDrive: 0 }
  );
  const totalCatMb = Math.max(
    1,
    categoryTotals.Audio + categoryTotals.Lecture + categoryTotals.PersonalDrive
  );

  const maxBarLimit = Math.max(...history.map((d) => d.daily_limit_mb), 2560);
  const hoveredPoint = hoveredIdx !== null ? history[hoveredIdx] : null;

  return (
    <div className="space-y-6">
      {/* Data-to-Value KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="telemetry-card p-6">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Cumulative Data Rescued
          </span>
          <div className="mt-2 font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums text-[#0F172A]">
            {totalRescuedGb.toFixed(2)} GB
          </div>
          <p className="mt-2 text-xs text-[#10B981] font-mono tabular-nums">
            {totalRescuedMb.toLocaleString()} MB reclaimed over {history.length} cycles
          </p>
        </div>

        <div className="telemetry-card p-6">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Estimated Value Saved
          </span>
          <div className="mt-2 font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums text-[#0F172A]">
            {telemetry.currency_symbol}
            {totalValueSaved.toLocaleString()}
          </div>
          <p className="mt-2 text-xs text-[#475569] font-mono tabular-nums">
            At {telemetry.currency_symbol}
            {telemetry.rate_per_gb}/GB carrier rate
          </p>
        </div>

        <div className="telemetry-card p-6">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Offline Playback Banked
          </span>
          <div className="mt-2 font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums text-[#0F172A]">
            {totalPlaybackHours} hrs
          </div>
          <p className="mt-2 text-xs text-[#475569] tabular-nums">
            Zero-buffer commute & flight media ready
          </p>
        </div>

        <div className="telemetry-card p-6">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Surplus Capture Efficiency
          </span>
          <div className="mt-2 font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums text-[#0284C7]">
            {avgEfficiency}%
          </div>
          <p className="mt-2 text-xs text-[#475569] tabular-nums">
            Target envelope: 95%–100% net surplus fit
          </p>
        </div>
      </div>

      {/* 14-Day Bandwidth Rescue Chart + Category Allocation Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 telemetry-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0F172A]">
                Daily Quota Rescue Ledger
              </h2>
              <p className="text-xs text-[#475569] mt-0.5">
                Interactive cellular consumption vs. PulseVault pre-reset capture (MB)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-[#475569]">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#64748B]" />
                <span>Consumed</span>
              </span>
              <span className="flex items-center gap-1.5 text-[#475569]">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0284C7]" />
                <span>Rescued</span>
              </span>
              <span className="flex items-center gap-1.5 text-[#475569]">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#E2E8F0]" />
                <span>Safety Reserve</span>
              </span>
            </div>
          </div>

          {/* Hover Tooltip Summary Strip */}
          <div className="h-9 px-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-2 text-xs overflow-hidden">
            {hoveredPoint ? (
              <>
                <span className="font-mono font-semibold text-[#0F172A] shrink-0">
                  {hoveredPoint.date_label} · {hoveredPoint.execution_status}
                </span>
                <span className="font-mono tabular-nums text-[#475569] truncate">
                  Used {hoveredPoint.used_mb} MB · Rescued{' '}
                  <strong className="text-[#0284C7]">{hoveredPoint.rescued_mb} MB</strong> (
                  {hoveredPoint.items_fetched_count} files) · Reserve {hoveredPoint.wasted_mb} MB
                </span>
              </>
            ) : (
              <span className="text-[#64748B]">
                Hover over any day column to inspect exact megabyte rescue breakdown.
              </span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${history.length * 48 + 30} 210`}
              className="w-full min-w-[540px] h-[210px]"
              role="img"
              aria-label="Daily bandwidth rescue bar chart"
            >
              {[0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = 175 - ratio * 155;
                return (
                  <g key={ratio}>
                    <line
                      x1="0"
                      y1={y}
                      x2={history.length * 48 + 20}
                      y2={y}
                      stroke="#F1F5F9"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}

              {history.map((point, idx) => {
                const x = idx * 48 + 16;
                const barWidth = 26;
                const totalHeight = (point.daily_limit_mb / maxBarLimit) * 155;
                const usedH = (point.used_mb / maxBarLimit) * 155;
                const rescuedH = (point.rescued_mb / maxBarLimit) * 155;
                const reserveH = Math.max(0, totalHeight - usedH - rescuedH);
                const isHovered = hoveredIdx === idx;

                return (
                  <g
                    key={point.date_iso || point.date_label}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={175 - usedH - rescuedH - reserveH}
                      width={barWidth}
                      height={reserveH}
                      rx="2"
                      fill="#E2E8F0"
                      opacity={isHovered ? 1 : 0.8}
                    />
                    <rect
                      x={x}
                      y={175 - usedH - rescuedH}
                      width={barWidth}
                      height={rescuedH}
                      fill={isHovered ? '#0369A1' : '#0284C7'}
                    />
                    <rect
                      x={x}
                      y={175 - usedH}
                      width={barWidth}
                      height={usedH}
                      rx="2"
                      fill="#64748B"
                      opacity={isHovered ? 1 : 0.85}
                    />
                    <text
                      x={x + barWidth / 2}
                      y="196"
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      fill={isHovered ? '#0F172A' : '#64748B'}
                      fontWeight={isHovered ? '600' : '400'}
                    >
                      {point.date_label.replace('Nov ', '')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right 4 cols: Vault Distribution & Policy Targets */}
        <div className="lg:col-span-4 telemetry-card p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#0F172A]">
              Vault Category Balance
            </h2>
            <p className="text-xs text-[#475569]">
              Actual cached footprint vs. configured allocation targets
            </p>

            <div className="space-y-4 pt-1">
              {(
                [
                  { key: 'Audio', label: 'Audio (RSS Podcasts)', color: 'bg-[#0284C7]' },
                  { key: 'Lecture', label: 'Lecture (OpenCourseWare)', color: 'bg-[#0F172A]' },
                  {
                    key: 'PersonalDrive',
                    label: 'PersonalDrive (Google Drive)',
                    color: 'bg-[#10B981]',
                  },
                ] as const
              ).map((item) => {
                const actualPct = Math.round(
                  (categoryTotals[item.key] / totalCatMb) * 100
                );
                const targetPct = telemetry.category_weights[item.key];
                return (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#0F172A]">{item.label}</span>
                      <span className="font-mono tabular-nums text-[#475569]">
                        {categoryTotals[item.key]} MB ({actualPct}% · target {targetPct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div
                        style={{ width: `${actualPct}%` }}
                        className={`h-full ${item.color} transition-all duration-200`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[#F1F5F9] space-y-2 text-xs text-[#475569]">
            <div className="flex items-center justify-between">
              <span>FIFO Retention Ceiling</span>
              <span className="font-mono font-medium text-[#0F172A]">48 hours</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Disk Safety Threshold</span>
              <span className="font-mono font-medium text-[#0F172A]">2.0 GB free</span>
            </div>
          </div>
        </div>
      </div>

      {/* Execution Audit Log Table */}
      <div className="telemetry-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="font-display text-lg font-semibold text-[#0F172A]">
            Autonomous Manifest Execution Audit Log
          </h2>
          <p className="text-xs text-[#475569] mt-0.5">
            Recorded daemon evaluation windows, net surplus calculations, and purged file counts
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] h-10">
                <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  Timestamp
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  Execution Status
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  Net Surplus
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  Allocated
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  Manifest Items
                </th>
                <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  Engine
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {executionLog.map((run) => (
                <tr key={run.id} className="h-[50px] hover:bg-[#F8FAFC]">
                  <td className="px-6 font-mono text-xs tabular-nums text-[#475569] whitespace-nowrap">
                    {run.timestamp}
                  </td>
                  <td className="px-4 font-mono text-xs font-semibold whitespace-nowrap">
                    <span
                      className={
                        run.execution_status === 'READY_TO_FETCH'
                          ? 'text-[#10B981]'
                          : run.execution_status === 'DEFER_THERMAL_THROTTLE'
                            ? 'text-[#D97706]'
                            : 'text-[#EF4444]'
                      }
                    >
                      {run.execution_status}
                    </span>
                  </td>
                  <td className="px-4 font-mono text-xs tabular-nums text-[#0F172A] text-right whitespace-nowrap">
                    {run.net_surplus_mb} MB
                  </td>
                  <td className="px-4 font-mono text-xs tabular-nums text-[#0284C7] font-medium text-right whitespace-nowrap">
                    {run.allocated_mb} MB
                  </td>
                  <td className="px-4 font-mono text-xs tabular-nums text-[#475569] text-right whitespace-nowrap">
                    {run.items_count}
                  </td>
                  <td className="px-6 font-mono text-xs text-[#64748B] whitespace-nowrap">
                    {run.engine}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
