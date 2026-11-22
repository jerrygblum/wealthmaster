import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { FinancialAccount } from "../../types/models";
import type { InvestmentAccount, InvestmentInput, SecurityInput } from "../../types/investments";
import type { Listing, NavEntry, NavInput } from "../../types/marketdata";
export function usePortfolio(accountId: string, onExpired: () => void) {
  const [account, setAccount] = useState<FinancialAccount>();
  const [data, setData] = useState<InvestmentAccount>();
  const [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false),
    [query, setQuery] = useState("");
  const [results, setResults] = useState<Listing[]>(),
    [securityId, setSecurityId] = useState("");
  const [quantity, setQuantity] = useState(""),
    [date, setDate] = useState("");
  const [linking, setLinking] = useState<string>();
  const [fundForm, setFundForm] = useState<{ name: string; isin: string; currency: string }>();
  const [navSecurity, setNavSecurity] = useState<string>();
  const [navForm, setNavForm] = useState<NavInput>();
  const [navEntries, setNavEntries] = useState<NavEntry[]>([]);
  const [navHistoryLoading, setNavHistoryLoading] = useState(false);
  const navGeneration = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  const generation = useRef({ version: 0 });
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : "Unable to load holdings.");
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    const version = ++generation.current.version;
    setLoading(true);
    try {
      const [a, d] = await Promise.all([api.account(accountId), api.investmentAccount(accountId)]);
      if (version !== generation.current.version) return;
      setAccount(a);
      setData(d);
      setDate((current) => current || d.asOf);
    } catch (e) {
      if (version === generation.current.version) fail(e);
    } finally {
      if (version === generation.current.version) setLoading(false);
    }
  }, [accountId, fail]);
  useEffect(() => {
    const active = generation.current;
    void load();
    return () => {
      active.version++;
    };
  }, [load]);
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  }
  async function search() {
    await run(async () => setResults(await api.searchStocks(query)));
  }
  async function select(listing: Listing) {
    await run(async () => {
      if (linking) {
        await api.linkMarketSecurity(linking, listing.symbol);
        setLinking(undefined);
        setResults(undefined);
        setQuery("");
        setNotice("Online listing linked. Refresh prices to include the account-currency value.");
      } else {
        const s = await api.addMarketSecurity(listing.symbol);
        setSecurityId(s.id);
        setResults(undefined);
        setQuery("");
        setNotice(`${s.name} selected.`);
      }
      await load();
    });
  }
  async function save() {
    if (!data) return;
    await run(async () => {
      const input: InvestmentInput = {
        requestId: requestId.current,
        accountId,
        securityId,
        kind: "OPENING",
        quantity,
        unitPrice: null,
        tradeDate: date,
        cashDate: null,
        acquiredOn: null,
        settlement: null,
        acquisitionCost: null,
        aggregateOpening: true,
        charges: [],
        reference: "",
        notes: "Existing holding entered in holdings overview",
        cashOnlyConfirmed: true,
        allocations: null,
      };
      const preview = await api.previewInvestment(input);
      if (preview.errors.length) throw new Error(preview.errors.join(" "));
      await api.commitInvestment(input, preview.token);
      setAdding(false);
      setQuantity("");
      setSecurityId("");
      requestId.current = crypto.randomUUID();
      await load();
      setNotice(
        data.securities.find((s) => s.id === securityId)?.type === "FUND"
          ? "Fund holding added. Cash is unchanged. Enter its published NAV to value the units."
          : "Holding added. Cash is unchanged. Refresh prices to update its value.",
      );
    });
  }
  async function refresh() {
    await run(async () => {
      const result = await api.refreshMarketPrices(accountId);
      await load();
      setNotice(result.messages.join(" "));
    });
  }
  async function createFund() {
    if (!fundForm) return;
    await run(async () => {
      const input: SecurityInput = {
        ...fundForm,
        symbol: fundForm.isin,
        exchange: "NAV",
        type: "FUND",
      };
      const fund = await api.createSecurity(input);
      setSecurityId(fund.id);
      setFundForm(undefined);
      await load();
      setNotice("Fund created. Enter the units already held, then save the holding.");
    });
  }
  function beginFund() {
    begin();
    setFundForm({ name: "", isin: "", currency: account?.currency ?? "CHF" });
  }
  async function openNav(id: string) {
    const version = ++navGeneration.current;
    setNavSecurity(id);
    setNavForm({
      requestId: crypto.randomUUID(),
      accountId,
      date: "",
      nav: "",
      reference: "",
    });
    setNavEntries([]);
    setNavHistoryLoading(true);
    setAdding(false);
    setFundForm(undefined);
    setLinking(undefined);
    setError(null);
    setNotice(null);
    try {
      const entries = await api.navHistory(id);
      if (version === navGeneration.current) setNavEntries(entries);
    } catch (e) {
      if (version === navGeneration.current) fail(e);
    } finally {
      if (version === navGeneration.current) setNavHistoryLoading(false);
    }
  }
  async function saveNav() {
    if (!navSecurity || !navForm) return;
    await run(async () => {
      await api.recordNav(navSecurity, navForm);
      // A committed receipt gets a new request ID before refresh, so retries cannot add a duplicate.
      setNotice("NAV saved. Fund value and net worth updated; cash is unchanged.");
      setNavForm({ ...navForm, requestId: crypto.randomUUID(), date: "", nav: "" });
      setNavEntries(await api.navHistory(navSecurity));
      await load();
      setNotice("NAV saved. Fund value and net worth updated; cash is unchanged.");
    });
  }
  function closeNav() {
    navGeneration.current++;
    setNavSecurity(undefined);
    setNavForm(undefined);
    setNavEntries([]);
  }
  function begin() {
    closeNav();
    setFundForm(undefined);
    setResults(undefined);
    setQuery("");
    setSecurityId("");
    setQuantity("");
    setNotice(null);
    setAdding(true);
    setLinking(undefined);
    setError(null);
    requestId.current = crypto.randomUUID();
  }
  function link(id: string) {
    closeNav();
    setFundForm(undefined);
    setLinking(id);
    setAdding(false);
    setResults(undefined);
    setQuery("");
    setError(null);
  }
  return {
    account,
    data,
    loading,
    pending,
    error,
    notice,
    adding,
    query,
    setQuery,
    results,
    securityId,
    setSecurityId,
    quantity,
    setQuantity,
    date,
    setDate,
    linking,
    fundForm,
    setFundForm,
    beginFund,
    createFund,
    navSecurity,
    navForm,
    setNavForm,
    navEntries,
    navHistoryLoading,
    openNav,
    saveNav,
    closeNav,
    link,
    begin,
    search,
    select,
    save,
    refresh,
    load,
    cancel: () => {
      setAdding(false);
      setFundForm(undefined);
      setLinking(undefined);
      setResults(undefined);
    },
  };
}
