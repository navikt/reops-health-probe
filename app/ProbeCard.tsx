"use client";

import { useRef, useState, useEffect } from "react";
import { Tag, Button, Popover, ActionMenu, Table, CopyButton, Detail } from "@navikt/ds-react";
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
import type { ProbeStateData, RunData } from "./types";

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

// ── DotPopoverContent ─────────────────────────────────────────────────────

function DotPopoverContent({ run, inProgress }: { run: RunData; inProgress?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!inProgress) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [inProgress]);

  const status = inProgress ? "IN PROGRESS" : run.ok ? "OK" : "FAILED";

  const statusCls = inProgress
    ? "dot-popover-status running"
    : run.ok
    ? "dot-popover-status ok"
    : "dot-popover-status fail";

  const durationLabel = !inProgress
    ? fmt(run.durationMs)
    : now != null
    ? fmt(now - run.timestamp) + " elapsed"
    : "…";

  return (
    <>
      <div className={statusCls}>{status}</div>
      <Table size="small" className="dot-popover-table">
        <Table.Body>
          <Table.Row>
            <Table.HeaderCell scope="row">Started</Table.HeaderCell>
            <Table.DataCell>{fmtTs(run.timestamp)}</Table.DataCell>
          </Table.Row>
          <Table.Row>
            <Table.HeaderCell scope="row">Duration</Table.HeaderCell>
            <Table.DataCell>{durationLabel}</Table.DataCell>
          </Table.Row>
          <Table.Row>
            <Table.HeaderCell scope="row">Probe ID</Table.HeaderCell>
            <Table.DataCell>
              {run.probeId ? (
                <Detail as="code" textColor="subtle">{run.probeId}</Detail>
              ) : (
                <span className="dot-popover-row-muted">pending…</span>
              )}
            </Table.DataCell>
          </Table.Row>
        </Table.Body>
      </Table>
      {!run.ok && run.message && <div className="dot-popover-msg">{run.message}</div>}
      {!run.ok && run.errorDetails && (
        <pre className="dot-popover-details">{run.errorDetails}</pre>
      )}
      {run.bqQuery && (
        <CopyButton
          copyText={run.bqQuery}
          size="small"
          text="Copy BQ query"
          activeText="Copied!"
        />
      )}
      {run.ingressDetails && (
        <>
          <div className="dot-popover-section-label">Ingress request + response</div>
          <pre className="dot-popover-details dot-popover-ingress">{run.ingressDetails}</pre>
        </>
      )}
      {run.bqDetails && (
        <>
          <div className="dot-popover-section-label">BigQuery response</div>
          <pre className="dot-popover-details dot-popover-bq">{run.bqDetails}</pre>
        </>
      )}
    </>
  );
}

// ── Dot ───────────────────────────────────────────────────────────────────

function Dot({ run, inProgress }: { run: RunData; inProgress?: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const cls = inProgress
    ? "dot dot-running"
    : run.ok
    ? "dot dot-ok"
    : "dot dot-fail";

  return (
    <>
      <span
        ref={anchorRef}
        className={cls}
        tabIndex={0}
        role={inProgress ? "status" : "button"}
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
          <DotPopoverContent run={run} inProgress={inProgress} />
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

  const completedDots = [...history].reverse();
  const runningDots = activeRuns.map(
    (r): RunData => ({
      timestamp: r.startedAt,
      ok: true,
      message: null,
      errorDetails: null,
      probeId: r.probeId ?? null,
      ingressDetails: null,
      bqDetails: null,
      bqQuery: null,
      durationMs: 0,
    }),
  );

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
            <strong>{fmt(latest.durationMs)}</strong>
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
        {completedDots.length === 0 && runningDots.length === 0 ? (
          <span className="meta">—</span>
        ) : (
          <>
            {completedDots.map((run, i) => (
              <Dot key={`${run.timestamp}-${i}`} run={run} />
            ))}
            {runningDots.map((run, i) => (
              <Dot key={`running-${run.timestamp}-${i}`} run={run} inProgress />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
