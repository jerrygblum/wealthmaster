import type { ComponentType } from "react";
import type { SpendingLimitEditorProps } from "../../../types/componentProps";
import type { MonthlyLimitBreakdownViewModel } from "../../../types/viewModels";
import { Button, LoadingIndicator } from "../../atoms/Controls";

export function MonthlyLimitBreakdownView({
  data,
  loading,
  error,
  editing,
  setEditing,
  load,
  categoryId,
  label,
  currency,
  year,
  available,
  onSaved,
  onExpired,
  SpendingLimitEditor,
}: MonthlyLimitBreakdownViewModel & {
  SpendingLimitEditor: ComponentType<SpendingLimitEditorProps>;
}) {
  return (
    <details
      className="monthly-limits"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !loading) void load();
      }}
    >
      <summary>Edit months · {year}</summary>
      {loading && <LoadingIndicator role="status">Loading monthly limits…</LoadingIndicator>}
      {error && (
        <p role="alert">
          {error}
          <Button onClick={() => void load()}>Retry months</Button>
        </p>
      )}
      {data &&
        data.items.map((month) => (
          <div key={month.periodStart} className="monthly-limit-item">
            <span>
              {month.periodStart.slice(0, 7)} ·{" "}
              {month.comparison ? `${month.comparison.limit} ${currency}` : "No limit"} ·{" "}
              {month.comparison?.source === "EXCEPTION" ? "Exception" : "Normal"}
              {!month.accrued ? " · Not accrued yet" : ""}
            </span>
            <Button
              disabled={!!editing || (!available && !month.comparison?.overrideReference)}
              onClick={() => setEditing(month.periodStart)}
            >
              Edit monthly limit
            </Button>
            {editing === month.periodStart && (
              <SpendingLimitEditor
                categoryId={categoryId}
                label={label}
                currency={currency}
                periodType="MONTH"
                periodStart={month.periodStart}
                comparison={month.comparison}
                settingReference={
                  data.setting ? { id: data.setting.id, version: data.setting.version } : null
                }
                businessDate={data.businessDate}
                available={available}
                onExpired={onExpired}
                onCancel={() => setEditing(undefined)}
                onSaved={async () => {
                  setEditing(undefined);
                  await load();
                  await onSaved();
                }}
              />
            )}
          </div>
        ))}
    </details>
  );
}
