import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { TelemetryConfig } from '../types/pulsevault';

interface PolicyWizardModalProps {
  open: boolean;
  telemetry: TelemetryConfig;
  onClose: () => void;
  onSave: (updated: Partial<TelemetryConfig>) => void;
}

export function PolicyWizardModal({
  open,
  telemetry,
  onClose,
  onSave,
}: PolicyWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dailyLimit, setDailyLimit] = useState(telemetry.daily_limit_mb);
  const [safetyBuffer, setSafetyBuffer] = useState(telemetry.safety_buffer_mb);
  const [resetTime, setResetTime] = useState(telemetry.reset_time);
  const [evalWindow, setEvalWindow] = useState(telemetry.prefetch_window_offset_mins);
  const [minBattery, setMinBattery] = useState(telemetry.min_battery_percent);
  const [maxVaultGb, setMaxVaultGb] = useState(telemetry.max_vault_gb);
  const [ratePerGb, setRatePerGb] = useState(telemetry.rate_per_gb);
  const [currencySymbol, setCurrencySymbol] = useState(telemetry.currency_symbol);
  const [weights, setWeights] = useState(telemetry.category_weights);

  if (!open) return null;

  const weightSum = weights.Audio + weights.Lecture + weights.PersonalDrive;

  const handleWeightChange = (
    key: 'Audio' | 'Lecture' | 'PersonalDrive',
    val: number
  ) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
  };

  const normalizeAndSave = () => {
    const total = Math.max(1, weights.Audio + weights.Lecture + weights.PersonalDrive);
    const audio = Math.round((weights.Audio / total) * 100);
    const lecture = Math.round((weights.Lecture / total) * 100);
    const personalDrive = Math.max(0, 100 - audio - lecture);
    onSave({
      daily_limit_mb: dailyLimit,
      safety_buffer_mb: safetyBuffer,
      reset_time: resetTime,
      prefetch_window_offset_mins: evalWindow,
      min_battery_percent: minBattery,
      max_vault_gb: maxVaultGb,
      rate_per_gb: ratePerGb,
      currency_symbol: currencySymbol,
      category_weights: {
        Audio: audio,
        Lecture: lecture,
        PersonalDrive: personalDrive,
      },
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-wizard-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E2E8F0] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.08),0_8px_10px_-6px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2
              id="policy-wizard-title"
              className="font-display text-lg font-semibold text-[#0F172A]"
            >
              Quota Config & Guardrail Policy
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Step {step} of 3 · SQLite quota_config singleton parameters
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close policy wizard"
            className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx as 1 | 2 | 3)}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  idx <= step ? 'bg-[#0284C7]' : 'bg-[#E2E8F0]'
                }`}
                aria-label={`Jump to step ${idx}`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Daily Carrier Data Cap (MB)
                </label>
                <input
                  type="number"
                  min={250}
                  max={10240}
                  step={64}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value) || 0)}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Carrier Reset Time
                  </label>
                  <input
                    type="time"
                    value={resetTime}
                    onChange={(e) => setResetTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Safety Buffer (MB)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1024}
                    step={20}
                    value={safetyBuffer}
                    onChange={(e) => setSafetyBuffer(Number(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A]"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#475569]">
                  Category Allocation Weights
                </span>
                <span className="font-mono tabular-nums text-[#0284C7]">
                  Sum: {weightSum}% (auto-normalized)
                </span>
              </div>
              {(['Audio', 'Lecture', 'PersonalDrive'] as const).map((cat) => (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#0F172A]">
                      {cat === 'PersonalDrive' ? 'Personal Google Drive' : cat}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#475569]">
                      {weights[cat]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={weights[cat]}
                    onChange={(e) => handleWeightChange(cat, Number(e.target.value))}
                    className="w-full telemetry-slider"
                  />
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Pre-Reset Window (mins)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    step={15}
                    value={evalWindow}
                    onChange={(e) => setEvalWindow(Number(e.target.value) || 90)}
                    className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Min Battery Threshold (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={50}
                    step={5}
                    value={minBattery}
                    onChange={(e) => setMinBattery(Number(e.target.value) || 20)}
                    className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Rolling Vault Cap (GB)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={32}
                    step={1}
                    value={maxVaultGb}
                    onChange={(e) => setMaxVaultGb(Number(e.target.value) || 8)}
                    className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">
                    Carrier Cost per GB
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={currencySymbol}
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                      className="h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A]"
                    >
                      <option value="₹">₹</option>
                      <option value="$">$</option>
                      <option value="€">€</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={ratePerGb}
                      onChange={(e) => setRatePerGb(Number(e.target.value) || 1)}
                      className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((s) => (s - 1) as 1 | 2 | 3) : onClose())}
            className="h-10 px-4 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#475569] hover:text-[#0F172A]"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              className="h-10 px-4 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1]"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={normalizeAndSave}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1]"
            >
              <Check className="h-4 w-4" />
              <span>Save Config</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
