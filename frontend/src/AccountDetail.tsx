import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { FinancialAccount, LedgerInput, LedgerKind, Operation } from "./api";

export function AccountDetail({id, onBack, onExpired}: {id: string; onBack: () => void; onExpired: () => void}) {
 const [accounts,setAccounts]=useState<FinancialAccount[]>([]);
 const [account,setAccount]=useState<FinancialAccount>();
 const [items,setItems]=useState<Operation[]>([]);
 const [page,setPage]=useState(0); const [more,setMore]=useState(false);
 const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const [form,setForm]=useState<LedgerInput>(); const [editing,setEditing]=useState<Operation>();
 const [deleting,setDeleting]=useState<Operation>(); const [pending,setPending]=useState(false); const [stale,setStale]=useState(false);
 const fail=useCallback((err: unknown)=>{ if(err instanceof ApiError && err.status===401) onExpired(); else {setError(err instanceof Error?err.message:"Unable to load activity."); if(err instanceof ApiError && err.status===412) setStale(true);} },[onExpired]);
 const load=useCallback(async()=>{setLoading(true);setError("");try {const [a,all,activity]=await Promise.all([api.account(id),api.accounts(),api.activity(id,page)]);setAccount(a);setAccounts(all);setItems(activity.items);setMore(activity.hasMore);}catch(err){fail(err);}finally{setLoading(false);}},[id,page,fail]);
 useEffect(()=>{void load();},[load]);
 function start(kind: LedgerKind, op?: Operation) {setError("");setStale(false);setEditing(op);setForm(op ? {...op} : {accountId:id,kind,amount:"",transactionDate:account?.balanceAsOf ?? new Date().toISOString().slice(0,10),valueDate:null,payee:"",description:"",notes:"",destinationAccountId:""});}
 async function save(event: FormEvent) {event.preventDefault();if(!form)return;setPending(true);setError("");try {await api.saveActivity(form,editing);setForm(undefined);setEditing(undefined);await load();}catch(err){fail(err);}finally{setPending(false);}}
 async function remove(){if(!deleting)return;setPending(true);try{await api.deleteActivity(deleting);setDeleting(undefined);await load();}catch(err){fail(err);}finally{setPending(false);}}
 const active=accounts.filter(a=>a.active); const source=accounts.find(a=>a.id===form?.accountId);
 const destinations=active.filter(a=>a.id!==form?.accountId && a.currency===source?.currency);
 const canChange=(op:Operation)=>[op.accountId,op.destinationAccountId].filter(Boolean).every(a=>accounts.some(x=>x.id===a && x.active));
 const balance=account?.currentBalance ?? account?.openingBalance ?? "0";
 return <main className="workspace"><button className="secondary" disabled={pending} onClick={onBack}>Back to accounts</button>
 {account && <><h1>{account.name}</h1><p className="balance">{account.currency} {account.type==="CREDIT_CARD" && balance.startsWith("-")?balance.slice(1):balance}</p><p>{account.type==="CREDIT_CARD" && balance.startsWith("-")?"Amount owed":account.type==="INVESTMENT"?"Current cash balance":"Current balance"} · {account.balanceAsOf}</p><p>Opening {account.type==="INVESTMENT"?"cash balance":"balance"}: {account.currency} {account.openingBalance} · {account.openingDate}</p>
 {!account.active && <p className="notice">Archived activity is read-only. Restore this account from Accounts to make changes.</p>}
 <div className="form-actions"><button disabled={!account.active || pending} onClick={()=>start("EXPENSE")}>Add transaction</button><button disabled={!account.active || pending || !active.some(a=>a.id!==id && a.currency===account.currency)} onClick={()=>start("TRANSFER")}>Transfer money</button></div>
 {!active.some(a=>a.id!==id && a.currency===account.currency) && <p>No other active account uses {account.currency}. Create or restore one to transfer money.</p>}</>}
 {error && <div role="alert" className="error"><p>{error}</p><button onClick={()=>void load()}>Retry / reload activity</button></div>}
 {form && <section className="panel"><h2>{editing?"Edit activity":form.kind==="TRANSFER"?"Transfer money":"Add transaction"}</h2><form onSubmit={e=>void save(e)}><fieldset disabled={pending} className="form-grid">
 <div><label htmlFor="ledger-account">{form.kind==="TRANSFER"?"Source account":"Account"}</label><select id="ledger-account" value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value,destinationAccountId:""})}>{active.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
 {form.kind==="TRANSFER"?<div><label htmlFor="ledger-destination">Destination account</label><select id="ledger-destination" required value={form.destinationAccountId ?? ""} onChange={e=>setForm({...form,destinationAccountId:e.target.value})}><option value="">Choose account</option>{destinations.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>:<div><label htmlFor="ledger-kind">Kind</label><select id="ledger-kind" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as LedgerKind})}><option value="INCOME">Income</option><option value="EXPENSE">Expense</option><option value="REFUND">Refund (reduces spending)</option></select></div>}
 <div><label htmlFor="ledger-amount">Amount ({source?.currency})</label><input id="ledger-amount" inputMode="decimal" required pattern="[0-9]{1,20}(\.[0-9]{1,8})?" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div>
 <div><label htmlFor="ledger-date">Transaction date</label><input id="ledger-date" type="date" required min={source?.openingDate} max={account?.balanceAsOf} value={form.transactionDate} onChange={e=>setForm({...form,transactionDate:e.target.value})}/></div>
 {form.kind!=="TRANSFER" && <><div><label htmlFor="ledger-value">Value date (optional)</label><input id="ledger-value" type="date" value={form.valueDate ?? ""} onChange={e=>setForm({...form,valueDate:e.target.value || null})}/></div><div><label htmlFor="ledger-payee">Payee (optional)</label><input id="ledger-payee" maxLength={200} value={form.payee ?? ""} onChange={e=>setForm({...form,payee:e.target.value})}/></div></>}
 <div><label htmlFor="ledger-description">Description</label><input id="ledger-description" required maxLength={500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
 <div><label htmlFor="ledger-notes">Notes (optional)</label><textarea id="ledger-notes" maxLength={2000} value={form.notes ?? ""} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
 {stale && <p>Activity changed. Cancel and reload before editing again. Your input is retained here.</p>}
 <div className="form-actions"><button disabled={stale}>Save activity</button><button type="button" className="secondary" onClick={()=>{setForm(undefined);void load();}}>Cancel</button></div></fieldset></form></section>}
 {deleting && <section className="panel"><h2>Delete {deleting.description}?</h2><p>{deleting.kind==="TRANSFER"?"Both sides of this transfer will be removed from account balances.":"This entry will be removed from the account balance."} Audit history is retained.</p><button disabled={pending || stale} onClick={()=>void remove()}>Confirm deletion</button><button className="secondary" disabled={pending} onClick={()=>{setDeleting(undefined);setStale(false);}}>Cancel deletion</button></section>}
 <h2>Activity</h2>{loading?<p role="status">Loading activity…</p>:items.length===0?<p>No activity yet.</p>:items.map(op=><article className="panel" key={op.id}><h3>{op.description}</h3><p>{op.transactionDate} · {op.kind} · {op.currency} {op.amount}</p>{op.kind==="TRANSFER" && <p>{op.accountId===id?"To":"From"} {accounts.find(a=>a.id===(op.accountId===id?op.destinationAccountId:op.accountId))?.name}</p>}{op.valueDate && <p>Value date: {op.valueDate}</p>}{op.payee && <p>{op.payee}</p>}{op.notes && <p>{op.notes}</p>}<div className="form-actions"><button className="secondary" disabled={!canChange(op) || pending || !!form} onClick={()=>start(op.kind,op)}>Edit entry</button><button className="secondary" disabled={!canChange(op) || pending || !!form} onClick={()=>{setDeleting(op);setStale(false);setError("");}}>Delete entry</button></div>{!canChange(op) && <p>Restore all affected accounts to change this activity.</p>}</article>)}
 <div className="form-actions"><button disabled={page===0 || loading || pending || !!form} onClick={()=>setPage(page-1)}>Previous page</button><span>Page {page+1}</span><button disabled={!more || loading || pending || !!form} onClick={()=>setPage(page+1)}>Next page</button></div></main>;
}
