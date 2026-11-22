import { useState } from "react";
import type { NetWorthTrend } from "../../../types/netWorthTrend";
import { displayAmount } from "../../../utils/accountPresentation";

const colors = ["#126f72", "#7954b3", "#b65025", "#326abd", "#a53770", "#547532"];
export function TrendChart({
  report,
  currency,
  showAccounts,
}: {
  report: NetWorthTrend;
  currency: string;
  showAccounts: boolean;
}) {
  const [detail, setDetail] = useState("");
  const accounts = report.accounts.filter((a) => a.currency === currency);
  const lines = [
    {
      name: "Selected total",
      values: report.points.map(
        (p) => p.currencies.find((c) => c.currency === currency)?.value ?? null,
      ),
    },
    ...(showAccounts
      ? accounts.map((a) => ({
          name: a.name,
          values: report.points.map(
            (p) => p.accounts.find((v) => v.accountId === a.id)?.value ?? null,
          ),
        }))
      : []),
  ];
  // Floating point is confined to chart coordinates. Exact financial values remain strings.
  const numbers = lines.flatMap((l) => l.values.filter((v): v is string => v !== null).map(Number));
  if (!numbers.length)
    return <p>No complete valuation is available for this range. See missing data below.</p>;
  const low = numbers.reduce((a, b) => Math.min(a, b), 0),
    high = numbers.reduce((a, b) => Math.max(a, b), 0),
    span = high - low || 1;
  const x = (index: number) => 70 + (index * 710) / Math.max(1, report.points.length - 1);
  const y = (value: string) => 230 - ((Number(value) - low) * 200) / span;
  return (
    <>
      <svg
        className="trend-chart"
        viewBox="0 0 820 280"
        role="group"
        aria-label={`${currency} net-worth trend chart`}
      >
        <title>{currency} closing balances; gaps indicate unavailable valuations</title>
        <line x1="70" x2="780" y1={y("0")} y2={y("0")} stroke="currentColor" opacity="0.3" />
        <text x="5" y="30" fontSize="12">
          {high.toPrecision(4)}
        </text>
        <text x="5" y="235" fontSize="12">
          {low.toPrecision(4)}
        </text>
        <text x="70" y="265" fontSize="12">
          {report.points[0]?.period.endDate}
        </text>
        <text x="780" y="265" textAnchor="end" fontSize="12">
          {report.points.at(-1)?.period.endDate}
        </text>
        {lines.map((line, lineIndex) => {
          let previous = false;
          const path = line.values
            .map((v, i) => {
              if (v === null) {
                previous = false;
                return "";
              }
              const command = `${previous ? "L" : "M"}${x(i)},${y(v)}`;
              previous = true;
              return command;
            })
            .join(" ");
          return (
            <g key={line.name + lineIndex}>
              <path
                d={path}
                fill="none"
                stroke={colors[lineIndex % colors.length]}
                strokeWidth={lineIndex ? 1.5 : 3}
                strokeDasharray={lineIndex ? `${4 + lineIndex} 3` : undefined}
              />
              {line.values.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r="3"
                    fill={colors[lineIndex % colors.length]}
                    onFocus={() =>
                      setDetail(
                        `${line.name} · ${report.points[i].period.endDate}: ${currency} ${v}`,
                      )
                    }
                    onMouseEnter={() =>
                      setDetail(
                        `${line.name} · ${report.points[i].period.endDate}: ${currency} ${v}`,
                      )
                    }
                    tabIndex={0}
                    role="img"
                    aria-label={`${line.name}, ${report.points[i].period.endDate}: ${currency} ${displayAmount(v)}`}
                  >
                    <title>
                      {line.name} · {report.points[i].period.endDate}: {currency} {v}
                    </title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      <p role="status" className="help">
        {detail || "Focus or hover a chart point for its exact closing value."}
      </p>
      <ul className="trend-legend" aria-label={`${currency} chart legend`}>
        {lines.map((l, i) => (
          <li key={l.name + i}>
            <span aria-hidden="true" style={{ color: colors[i % colors.length] }}>
              ━{" "}
            </span>
            {l.name}
            {i > 0 ? ` (dashed ${i})` : ""}
          </li>
        ))}
      </ul>
    </>
  );
}
