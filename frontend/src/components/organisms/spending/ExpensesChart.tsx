import { displayAmount } from "../../../utils/accountPresentation";
import { colors, fractions, spendingBranchId } from "../../../utils/spendingPresentation";
import { Link } from "../../atoms/Controls";
export function ExpensesChart({
  currency,
  slices,
  onSelect,
}: {
  currency: string;
  slices: { id: string | null; label: string; value: string }[];
  onSelect: (id: string | null) => void;
}) {
  const shares = fractions(slices.map((s) => s.value));
  let angle = -Math.PI / 2;
  const branchId = (id: string | null) => spendingBranchId(currency, id);
  return (
    <>
      {!slices.length ? (
        <p>No expenses to chart. Refunds and limits remain visible in the table.</p>
      ) : (
        <div className="spending-chart">
          <svg
            viewBox="0 0 200 200"
            role="img"
            aria-labelledby={`chart-title-${currency}`}
            aria-describedby={`chart-desc-${currency}`}
          >
            <title id={`chart-title-${currency}`}>Expenses before refunds — {currency}</title>
            <desc id={`chart-desc-${currency}`}>
              Top-level totals include children; each expense is counted once.{" "}
              {slices.map((s) => `${s.label}: ${displayAmount(s.value)} ${currency}`).join("; ")}.
              Refunds are in the table.
            </desc>
            {slices.map((s, i) => {
              const from = angle;
              angle += shares[i] * Math.PI * 2;
              return shares[i] >= 0.999999999 ? (
                <circle key={s.id} cx="100" cy="100" r="90" fill={colors[i % colors.length]} />
              ) : (
                <path
                  key={s.id}
                  d={`M 100 100 L ${100 + 90 * Math.cos(from)} ${100 + 90 * Math.sin(from)} A 90 90 0 ${shares[i] > 0.5 ? 1 : 0} 1 ${100 + 90 * Math.cos(angle)} ${100 + 90 * Math.sin(angle)} Z`}
                  fill={colors[i % colors.length]}
                />
              );
            })}
          </svg>
          <ul>
            {slices.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={`#${branchId(s.id)}`}
                  style={{ color: colors[i % colors.length] }}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelect(s.id);
                  }}
                >
                  {s.label}: {displayAmount(s.value)} {currency}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
