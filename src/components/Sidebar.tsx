import React from 'react';
import {
  Activity,
  BarChart3,
  HardDrive,
  Link2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ActiveTab, TelemetryConfig } from '../types/pulsevault';
import { computeNetSurplusMb } from '../data/seedData';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  telemetry: TelemetryConfig;
  vaultCount: number;
  sourcesCount: number;
  onOpenWizard: () => void;
  onOpenTasteSetup: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'radar', label: 'Quota Radar', icon: Activity },
  { id: 'connectors', label: 'Connector Hub', icon: Link2 },
  { id: 'vault', label: 'Offline Vault', icon: HardDrive },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  telemetry,
  vaultCount,
  sourcesCount,
  onOpenWizard,
  onOpenTasteSetup,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const netSurplus = computeNetSurplusMb(telemetry);
  const surplusPositive = netSurplus > 0;

  const content = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-[#E2E8F0] w-[240px]">
      <div>
        <div className="flex h-16 items-center justify-between px-6 border-b border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => {
              onSelectTab('radar');
              onCloseMobile();
            }}
            className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] rounded-md"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" fill="#0284C7" />
              <path
                d="M6.5 13.5H9L10.8 8.5L13.2 15.5L15 11.5H17.5"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-display text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap">
              PulseVault
            </span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 text-[#475569] hover:text-[#0F172A] rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1" aria-label="Primary sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const badgeCount =
              item.id === 'connectors'
                ? sourcesCount
                : item.id === 'vault'
                  ? vaultCount
                  : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] ${
                  isActive
                    ? 'bg-[#F0F9FF] text-[#0284C7]'
                    : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-[#0284C7]' : 'text-[#64748B]'
                    }`}
                  />
                  <span>{item.label}</span>
                </span>
                {badgeCount !== null && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isActive ? 'text-[#0284C7]' : 'text-[#94A3B8]'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-[#F1F5F9] space-y-4">
        <div className="space-y-2.5 px-2">
          <div className="flex items-center justify-between text-xs text-[#475569]">
            <span>Reset Window</span>
            <span className="font-mono font-medium tabular-nums text-[#0F172A]">
              {telemetry.reset_time}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#475569]">
            <span>Net Surplus</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                surplusPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {netSurplus > 0 ? `+${netSurplus}` : netSurplus} MB
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#475569]">
            <span>Disk Headroom</span>
            <span
              className={`font-mono font-medium tabular-nums ${
                telemetry.free_storage_gb < 2.0 ? 'text-[#EF4444]' : 'text-[#0F172A]'
              }`}
            >
              {telemetry.free_storage_gb.toFixed(1)} GB
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              onOpenTasteSetup();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-[#0284C7]/30 bg-[#F0F9FF] text-xs font-semibold text-[#0369A1] hover:bg-[#E0F2FE] transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
          >
            <span>Edit Tastes & Languages</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenWizard();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#475569]" />
            <span>Carrier Policy Setup</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#0F172A]/30 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
