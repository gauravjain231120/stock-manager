"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { formatTime12h } from "@/lib/format";

interface MyntraRtdButtonProps {
  initialCutoff: string;
  isActive?: boolean;
  onToggleFilter?: () => void;
  count?: number;
}

const PRESETS = [
  { label: "11:00 AM", value: "11:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "1:00 PM (Default)", value: "13:00" },
  { label: "2:00 PM", value: "14:00" },
  { label: "3:00 PM", value: "15:00" },
];

export function MyntraRtdButton({
  initialCutoff,
  isActive = false,
  onToggleFilter,
  count,
}: MyntraRtdButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [cutoff, setCutoff] = useState(initialCutoff || "13:00");
  const [isOpen, setIsOpen] = useState(false);
  const [tempTime, setTempTime] = useState(initialCutoff || "13:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openModal(e: React.MouseEvent) {
    e.stopPropagation();
    setTempTime(cutoff);
    setError("");
    setIsOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setIsOpen(false);
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!tempTime || !/^\d{1,2}:\d{2}$/.test(tempTime)) {
      setError("Please pick a valid time (HH:MM).");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/rtd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cutoff: tempTime }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to update cutoff time");
        return;
      }
      setCutoff(tempTime);
      toast.success(`Myntra RTD cutoff updated to ${formatTime12h(tempTime)} ✓`);
      setIsOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`inline-flex items-center rounded-lg border text-sm transition ${
          isActive
            ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-300 font-semibold shadow-sm"
            : "border-black/15 bg-transparent text-neutral-800 hover:bg-black/5 dark:border-white/20 dark:text-neutral-200 dark:hover:bg-white/10"
        }`}
      >
        <button
          type="button"
          onClick={onToggleFilter}
          title={
            isActive
              ? "Showing Myntra RTD orders (click to clear filter)"
              : `Click to filter Myntra RTD orders for today (cutoff ${formatTime12h(cutoff)})`
          }
          className="flex items-center gap-1.5 px-3 py-1.5"
        >
          <Clock size={14} className={isActive ? "text-brand-600 dark:text-brand-400" : "text-neutral-500"} />
          <span>Myntra RTD</span>
          <span className="text-xs opacity-75">({formatTime12h(cutoff)})</span>
          {count !== undefined ? (
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[11px] ${
                isActive
                  ? "bg-brand-600 text-white dark:bg-brand-500"
                  : "bg-black/10 text-neutral-700 dark:bg-white/20 dark:text-neutral-200"
              }`}
            >
              {count}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={openModal}
          title="Change Myntra RTD cutoff time"
          className="border-l border-inherit px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          <Pencil size={12} className="inline mr-1" />
          <span>Change</span>
        </button>
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/10 pb-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Clock className="text-brand-600 dark:text-brand-400" size={18} />
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Change Myntra RTD Cutoff
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="rounded-lg p-1 text-neutral-400 hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Orders placed before this cutoff time are scheduled for dispatch today. Orders placed after this time
                ship tomorrow. Default is <b>1:00 PM</b>.
              </p>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => {
                    const isSelected = tempTime === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setTempTime(p.value)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                          isSelected
                            ? "bg-brand-600 text-white"
                            : "border border-black/15 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Cutoff Time (IST)
                </label>
                <input
                  type="time"
                  value={tempTime}
                  onChange={(e) => setTempTime(e.target.value)}
                  required
                  step={60}
                  className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
                />
                <span className="mt-1 block text-[11px] text-neutral-400">
                  Selected: <b>{formatTime12h(tempTime)}</b>
                </span>
              </div>

              {error ? <div className="text-xs text-red-600 dark:text-red-400">{error}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy}
                  className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !tempTime}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check size={14} />
                  <span>{busy ? "Saving…" : "Save Cutoff"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
