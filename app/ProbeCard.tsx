"use client";

import { useRef, useState, useEffect } from "react";
import { Tag, Button, Popover, ActionMenu } from "@navikt/ds-react";
import {
  PlayIcon,
  PauseIcon,
  ArrowCirclepathIcon,
  MenuElipsisVerticalIcon,
  XMarkOctagonIcon,
  CheckmarkCircleIcon,
  CheckmarkIcon,
  XMarkIcon,
  ExclamationmarkTriangleIcon,
} from "@navikt/aksel-icons";
import type { ProbeStateData, RunData, TipData } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function fmtTs(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function relTime(ts: number, now: number): string {
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return diff + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

export function formatInterval(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  const mins = Math.floor(ms / 60_000);
  const secs = (ms % 60_000) / 1000;
  return `${mins}m ${secs}s`;
}

function makeTip(run: RunData): TipData {
  return {
    status: run.ok ? "OK" : "FAILED",
    startedAt: run.timestamp,
    durationMs: run.durationMs,
    probeId: run.probeId ?? "",
    msg: run.ok ? "" : (run.message ?? ""),
    errorDetails: run.ok ? "" : (run.errorDetails ?? ""),
    ingressDetails: run.ingressDetails ?? "",
    bqDetails: run.bqDetails ?? "",
  };
}

function makeRunningTip(startedAt: number): TipData {
  return {
    status: "IN PROGRESS",
    startedAt,
    durationMs: null,
    probeId: "",
    msg: "",
    errorDetails: "",
    ingressDetails: "",
    bqDetails: "",
  };
}

// ── DotPopoverContent ─────────────────────────────────────────────────────

function DotPopoverContent({ tip }: { tip: TipData }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (tip.status !== "IN PROGRESS") return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [tip.status]);

  const now = Date.now();
  const statusCls =
    tip.status === "OK"
      ? "dot-popover-status ok"
      : tip.status === "IN PROGRESS"
      ? "dot-popover-status running"
      : "dot-popover-status fail";

  const durationLabel =
    tip.durationMs != null
      ? fmt(tip.durationMs)
      : fmt(now - tip.startedAt) + " elapsed";

  return (
    <>
      <div className={statusCls}>{tip.status}</div>
      <div className="dot-popover-row">
        <span>Started</span>
        <span>{fmtTs(tip.startedAt)}</span>
      </div>
      <div className="dot-popover-row">
        <span>Duration</span>
        <span>{durationLabel}</span>
      </div>
      {tip.probeId ? (
        <div className="dot-popover-row">
          <span>Probe ID</span>
          <span className="dot-popover-probe-id">{tip.probeId}</span>
        </div>
      ) : (
        <div className="dot-popover-row dot-popover-row-muted">
          <span>Probe ID</span>
          <span>pending…</span>
        </div>
      )}
      {tip.msg && <div className="dot-popover-msg">{tip.msg}</div>}
      {tip.errorDetails && (
        <pre className="dot-popover-details">{tip.errorDetails}</pre>
      )}
      {tip.ingressDetails && (
        <>
          <div className="dot-popover-section-label">Ingress request + response</div>
          <pre className="dot-popover-details dot-popover-ingress">{tip.ingressDetails}</pre>
        </>
      )}
      {tip.bqDetails && (
        <>
          <div className="dot-popover-section-label">BigQuery response</div>
          <pre className="dot-popover-details dot-popover-bq">{tip.bqDetails}</pre>
        </>
      )}
    </>
  );
}

// ── Dot ───────────────────────────────────────────────────────────────────

function Dot({ tip }: { tip: TipData }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const cls =
    tip.status === "OK"
      ? "dot dot-ok"
      : tip.status === "IN PROGRESS"
      ? "dot dot-running"
      : "dot dot-fail";

  return (
    <>
      <span
        ref={anchorRef}
        className={cls}
        tabIndex={0}
        role={tip.status === "IN PROGRESS" ? "status" : "button"}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorEl={anchorRef.current}
        placement="top"
      >
        <Popover.Content className="dot-popover-content">
          <DotPopoverContent tip={tip} />
        </Popover.Content>
      </Popover>
    </>
  );
}

// ── KebabMenu ─────────────────────────────────────────────────────────────

type FeedbackState = { text: string; ok: boolean } | null;

function KebabMenu({ name, paused }: { name: string; paused: boolean }) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function handleTestAlert(type: string) {
    try {
      const res = await fetch(
        `/admin/test-alert/${encodeURIComponent(name)}/${type}`,
        { method: "POST" },
      );
      setFeedback({ text: res.ok ? "Sent to Slack" : "Failed", ok: res.ok });
    } catch {
      setFeedback({ text: "Network error", ok: false });
    }
    setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <div className="card-actions">
      {feedback && (
        <output
          className="test-feedback"
          aria-live="polite"
          style={{ color: feedback.ok ? "#68d391" : "#fc8181" }}
        >
          {feedback.ok ? <CheckmarkIcon aria-hidden /> : <XMarkIcon aria-hidden />}
          {feedback.text}
        </output>
      )}
      <ActionMenu>
        <ActionMenu.Trigger>
          <Button
            size="small"
            variant="tertiary-neutral"
            icon={<MenuElipsisVerticalIcon aria-hidden />}
            aria-label="Test Slack alerts"
          />
        </ActionMenu.Trigger>
        <ActionMenu.Content>
          <ActionMenu.Item onSelect={() => handleTestAlert("failure")} icon={<XMarkOctagonIcon aria-hidden />}>
            Simulate failure
          </ActionMenu.Item>
          <ActionMenu.Item onSelect={() => handleTestAlert("recovery")} icon={<CheckmarkCircleIcon aria-hidden />}>
            Simulate recovery
          </ActionMenu.Item>
          <ActionMenu.Item onSelect={() => handleTestAlert("throttle")} icon={<PauseIcon aria-hidden />}>
            Simulate throttle
          </ActionMenu.Item>
        </ActionMenu.Content>
      </ActionMenu>
      <form method="POST" action={`/admin/run/${encodeURIComponent(name)}`}>
        <Button size="small" variant="secondary" icon={<PlayIcon aria-hidden={true} />}>
          Run now
        </Button>
      </form>
      {paused ? (
        <form method="POST" action={`/admin/resume/${encodeURIComponent(name)}`}>
          <Button size="small" variant="secondary" icon={<ArrowCirclepathIcon aria-hidden={true} />}>
            Resume
          </Button>
        </form>
      ) : (
        <form method="POST" action={`/admin/pause/${encodeURIComponent(name)}`}>
          <Button size="small" variant="secondary" icon={<PauseIcon aria-hidden={true} />}>
            Pause
          </Button>
        </form>
      )}
    </div>
  );
}

// ── ProbeCard ─────────────────────────────────────────────────────────────

interface ProbeCardProps {
  name: string;
  scheduleMs: number | null;
  state: ProbeStateData;
}

export function ProbeCard({ name, scheduleMs, state }: ProbeCardProps) {
  const { paused, latest, activeRuns, history, now } = state;

  let cardClass = "card";
  if (paused) cardClass += " card-paused";
  else if (activeRuns.length > 0) cardClass += " card-running";
  else if (latest && !latest.ok) cardClass += " card-fail";

  let badge: React.ReactNode = null;
  if (paused) {
    badge = <Tag variant="warning-moderate" size="small">PAUSED</Tag>;
  } else if (latest == null) {
    badge = null;
  } else if (latest.ok) {
    badge = <Tag variant="success-moderate" size="small">OK</Tag>;
  } else {
    badge = <Tag variant="error-moderate" size="small">FAILING</Tag>;
  }

  const completedDots = [...history].reverse().map(makeTip);
  const runningDots = activeRuns.map((r) => makeRunningTip(r.startedAt));
  const allDots = [...completedDots, ...runningDots];

  return (
    <div className={cardClass}>
      <div className="card-header">
        <div className="card-title">
          <code>{name}</code>
          <span>{badge}</span>
        </div>
        <KebabMenu name={name} paused={paused} />
      </div>

      <div>
        {latest && !latest.ok && !paused && (
          <>
            <div className="fail-msg"><ExclamationmarkTriangleIcon aria-hidden /> {latest.message ?? "unknown error"}</div>
            {latest.errorDetails && (
              <pre className="error-details">{latest.errorDetails}</pre>
            )}
          </>
        )}
      </div>

      <div>
        {latest ? (
          <div className="meta">
            Last run: <strong>{relTime(latest.timestamp, now)}</strong> ·{" "}
            {fmtTs(latest.timestamp)} · Duration:{" "}
            <strong>{fmt(latest.durationMs)}</strong> · Ingress:{" "}
            <strong>{latest.ingressStatusCode}</strong>
          </div>
        ) : (
          <div className="meta">No runs recorded yet.</div>
        )}
      </div>

      {scheduleMs != null && (
        <div className="meta">
          Scheduled every <strong>{formatInterval(scheduleMs)}</strong>
        </div>
      )}

      <div className="history-label">Last {history.length} runs:</div>
      <div className="history-dots">
        {allDots.length === 0 ? (
          <span className="meta">—</span>
        ) : (
          allDots.map((tip, i) => (
            <Dot key={`${tip.startedAt}-${i}`} tip={tip} />
          ))
        )}
      </div>
    </div>
  );
}
