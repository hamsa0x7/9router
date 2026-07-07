"use client";

import { Input } from "@/shared/components";

const BADGE_COLORS = {
  Local:     "bg-green-500/10 text-green-600 dark:text-green-400",
  Tunnel:    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Tailscale: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "LM Studio":   "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "llama.cpp":   "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

const DEFAULT_COLOR = "bg-surface-2 text-text-muted";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  const colorClass = BADGE_COLORS[label] || (badge ? "bg-primary/10 text-primary" : DEFAULT_COLOR);

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[88px] text-center ${colorClass}`}>{label}</span>
      <Input value={url} readOnly className="flex-1 font-mono text-sm" />
      <button
        onClick={() => onCopy(url, copyId)}
        className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
      >
        <span className="material-symbols-outlined text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
      </button>
      {actions}
    </div>
  );
}
