const roadmap = [
  ['0.1', 'Core ledger', 'Accounts, transactions, transfers, MFA'],
  ['0.2', 'Importer', 'CSV/XLSX migration and data lineage'],
  ['0.3', 'Planner', 'Budgets and expected recurring costs'],
  ['0.4', 'Wealth', 'Investments, market data, portfolio value'],
];

export default function App() {
  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Portfolio project · active development</p>
        <h1>Wealth Master</h1>
        <p className="lede">
          A self-hosted personal finance application built around one promise:
          every net-worth number should be trustworthy and explainable.
        </p>
      </header>

      <section className="metrics" aria-label="Product principles">
        <article><strong>Ledger first</strong><span>Derived balances, not magic numbers.</span></article>
        <article><strong>Traceable</strong><span>Imports preserve source and lineage.</span></article>
        <article><strong>Self-hosted</strong><span>Designed for Docker on Synology.</span></article>
      </section>

      <section className="panel">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Roadmap</p>
            <h2>From spreadsheet to operational product</h2>
          </div>
          <span className="status">Scaffold ready</span>
        </div>
        <div className="roadmap">
          {roadmap.map(([version, title, detail]) => (
            <div className="roadmapRow" key={version}>
              <span className="version">v{version}</span>
              <strong>{title}</strong>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
