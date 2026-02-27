"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

const API = "http://localhost:8000";

type AgentStatus = "pending" | "running" | "done" | "error";

interface Agent {
  agent: string;
  status: AgentStatus;
}

const AGENT_LABELS: Record<string, string> = {
  ingestor: "Ingestor",
  summarizer: "Summarizer",
  prioritizer: "Prioritizer",
  formatter: "Formatter",
};

function StatusBadge({ status }: { status: AgentStatus }) {
  const styles: Record<AgentStatus, string> = {
    pending: "bg-zinc-700 text-zinc-400",
    running: "bg-blue-900 text-blue-300 animate-pulse",
    done: "bg-green-900 text-green-300",
    error: "bg-red-900 text-red-300",
  };
  const labels: Record<AgentStatus, string> = {
    pending: "Pending",
    running: "Running…",
    done: "Done",
    error: "Error",
  };
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function StepIcon({ status }: { status: AgentStatus }) {
  if (status === "done")
    return <span className="text-green-400 text-lg">✓</span>;
  if (status === "running")
    return (
      <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    );
  if (status === "error")
    return <span className="text-red-400 text-lg">✕</span>;
  return <span className="w-4 h-4 rounded-full border border-zinc-600 inline-block" />;
}

export default function Home() {
  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = async () => {
    try {
      const [statusRes, outputRes] = await Promise.all([
        fetch(`${API}/status`),
        fetch(`${API}/output`),
      ]);
      const statusData = await statusRes.json();
      const outputData = await outputRes.json();

      setAgents(statusData.agents);

      if (outputData.ready && outputData.content) {
        setOutput(outputData.content);
        setRunning(false);
        stopPolling();
      }

      const hasError = statusData.agents.some((a: Agent) => a.status === "error");
      if (hasError) {
        setRunning(false);
        setError("One or more agents failed. Check Docker logs for details.");
        stopPolling();
      }
    } catch {
      // API not yet ready, keep polling
    }
  };

  const handleRun = async () => {
    if (!content.trim()) return;
    setError("");
    setOutput("");
    setRunning(true);
    setAgents([
      { agent: "ingestor", status: "pending" },
      { agent: "summarizer", status: "pending" },
      { agent: "prioritizer", status: "pending" },
      { agent: "formatter", status: "pending" },
    ]);

    try {
      const res = await fetch(`${API}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to start pipeline");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reach API");
      setRunning(false);
      return;
    }

    stopPolling();
    pollRef.current = setInterval(pollStatus, 1500);
  };

  useEffect(() => () => stopPolling(), []);

  const pipelineDone = agents.length > 0 && agents.every((a) => a.status === "done");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Multi-Agent Digest</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Paste any text and the AI pipeline will summarize, prioritize, and format it into a digest.
          </p>
        </div>

        {/* Input */}
        <section className="space-y-3">
          <label className="text-sm font-medium text-zinc-300">Input Content</label>
          <textarea
            className="w-full h-44 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            placeholder="Paste articles, notes, or any text you want digested…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={running}
          />
          <button
            onClick={handleRun}
            disabled={running || !content.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors"
          >
            {running ? "Running pipeline…" : "Run Pipeline"}
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </section>

        {/* Agent Status */}
        {agents.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Pipeline Status
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              {agents.map((a, i) => (
                <div key={a.agent} className="flex items-center gap-4 px-4 py-3">
                  <span className="text-zinc-500 text-xs w-4">{i + 1}</span>
                  <span className="w-5 flex justify-center">
                    <StepIcon status={a.status} />
                  </span>
                  <span className="flex-1 text-sm font-medium">
                    {AGENT_LABELS[a.agent] ?? a.agent}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Output */}
        {output && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-widest">
              {pipelineDone ? "Your Daily Digest" : "Output"}
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{output}</ReactMarkdown>
            </div>
            <button
              onClick={() => {
                const blob = new Blob([output], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "daily_digest.md";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-1.5 text-xs font-medium border border-zinc-700 hover:border-zinc-500 rounded-lg transition-colors"
            >
              Download .md
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
