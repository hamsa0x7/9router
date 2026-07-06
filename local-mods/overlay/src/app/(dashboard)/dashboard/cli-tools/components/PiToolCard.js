"use client";

import { useState, useEffect } from "react";
import ToolSummaryCard from "./ToolSummaryCard";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";

export default function PiToolCard({
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
  const [selectedModel, setSelectedModel] = useState("");

  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/cli-tools/pi-settings");
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
    if (!selectedModel) {
      setMessage({ type: "error", text: "Please select a model." });
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/cli-tools/pi-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: selectedKey, model: selectedModel })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        refreshStatus();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to apply Pi settings" });
    }
    setLoading(false);
  };

  const handleRemove = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/cli-tools/pi-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        refreshStatus();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to remove Pi settings" });
    }
    setLoading(false);
  };

  const getAllAvailableModels = () => {
    const models = [];
    const seenModels = new Set();
    activeProviders.forEach(conn => {
      const alias = PROVIDER_ID_TO_ALIAS[conn.provider] || conn.provider;
      const providerModels = getModelsByProviderId(conn.provider);
      providerModels.forEach(m => {
        const modelValue = `${alias}/${m.id}`;
        if (!seenModels.has(modelValue)) {
          seenModels.add(modelValue);
          models.push({ value: modelValue, label: `${alias}/${m.id}`, provider: conn.provider });
        }
      });
    });
    return models;
  };

  const availableModels = getAllAvailableModels();

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

          <label className="text-sm font-medium text-text-main mt-2">Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="p-2 rounded-md bg-surface border border-divider text-sm focus:outline-none focus:border-primary"
            disabled={!hasActiveProviders}
          >
            <option value="">Select a model</option>
            {availableModels.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
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
            disabled={loading || !selectedKey || !selectedModel}
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
