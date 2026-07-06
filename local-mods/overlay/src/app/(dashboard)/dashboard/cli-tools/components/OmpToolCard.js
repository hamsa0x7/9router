"use client";

import { useState, useEffect } from "react";
import ToolSummaryCard from "./ToolSummaryCard";

export default function OmpToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  hasActiveProviders,
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/cli-tools/omp-settings");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isExpanded) refreshStatus();
  }, [isExpanded]);

  const handleApply = async () => {
    if (!selectedKey) {
      setMessage({ type: "error", text: "Please select an API key first." });
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/cli-tools/omp-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: selectedKey })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        refreshStatus();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to apply Oh My Pi settings" });
    }
    setLoading(false);
  };

  const handleRemove = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/cli-tools/omp-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        refreshStatus();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to remove Oh My Pi settings" });
    }
    setLoading(false);
  };

  return (
    <ToolSummaryCard
      tool={tool}
      isExpanded={isExpanded}
      onToggle={onToggle}
      status={{ installed: status?.installed, has9Router: status?.has9Router }}
    >
      <div className="flex flex-col gap-4 mt-4 border-t border-divider pt-4">
        <p className="text-sm text-text-muted">{tool.description}</p>

        {tool.notes?.map((note, idx) => (
          <div key={idx} className={`p-3 rounded-md text-sm ${note.type === 'warning' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
            {note.text}
          </div>
        ))}

        {!hasActiveProviders && (
          <div className="p-3 rounded-md bg-amber-500/10 text-amber-500 text-sm">
            Warning: You have no active providers configured. Models will not load.
          </div>
        )}

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-text-main">API Key</label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="p-2 rounded-md bg-surface border border-divider text-sm focus:outline-none focus:border-primary"
          >
            <option value="">Select an API key</option>
            {apiKeys.map((k) => (
              <option key={k.id} value={k.key}>{k.name}</option>
            ))}
          </select>
        </div>

        {message && (
          <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleApply}
            disabled={loading || !selectedKey}
            className="flex-1 py-2 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply 9Router Settings
          </button>
          {status?.has9Router && (
            <button
              onClick={handleRemove}
              disabled={loading}
              className="py-2 px-4 rounded-md bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </ToolSummaryCard>
  );
}
