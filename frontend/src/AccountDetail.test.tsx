import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountDetail } from "./AccountDetail";
import { api, ApiError } from "./api";
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), api: { account: vi.fn(), accounts: vi.fn(), activity: vi.fn(), saveActivity: vi.fn(), deleteActivity: vi.fn() } }));
const account={id:"a",name:"Synthetic cash",type:"CASH" as const,currency:"CHF",openingBalance:"0",currentBalance:"-2.00000001",balanceAsOf:"2026-10-04",openingDate:"2020-01-01",active:true,institution:null,createdAt:"",version:0,hasActivity:true};
const entry={id:"op",accountId:"a",kind:"EXPENSE" as const,amount:"2.00000001",currency:"CHF",transactionDate:"2026-10-04",valueDate:null,payee:"",description:"Synthetic purchase",notes:"",version:0,createdAt:""};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.account).mockResolvedValue(account);vi.mocked(api.accounts).mockResolvedValue([account,{...account,id:"b",name:"Synthetic bank"}]);vi.mocked(api.activity).mockResolvedValue({items:[entry],page:0,hasMore:false});});
it("shows exact balances and preserves failed form input",async()=>{
 render(<AccountDetail id="a" onBack={()=>{}} onExpired={()=>{}}/>);
 await screen.findByText("CHF -2.00000001");fireEvent.click(screen.getByText("Add transaction"));
 fireEvent.change(screen.getByLabelText("Amount (CHF)"),{target:{value:"1.12345678"}});fireEvent.change(screen.getByLabelText("Description"),{target:{value:"Synthetic refund"}});fireEvent.change(screen.getByLabelText("Kind"),{target:{value:"REFUND"}});
 vi.mocked(api.saveActivity).mockRejectedValue(new ApiError(400,"Check date"));fireEvent.click(screen.getByText("Save activity"));
 await screen.findByText("Check date");expect(screen.getByLabelText("Amount (CHF)")).toHaveValue("1.12345678");expect(screen.getByLabelText("Description")).toHaveValue("Synthetic refund");
});
it("confirms both transfer sides and sends the paired deletion",async()=>{
 const transfer={...entry,kind:"TRANSFER" as const,destinationAccountId:"b"};vi.mocked(api.activity).mockResolvedValue({items:[transfer],page:0,hasMore:false});
 render(<AccountDetail id="a" onBack={()=>{}} onExpired={()=>{}}/>);await screen.findByText("Synthetic purchase");fireEvent.click(screen.getByText("Delete entry"));await screen.findByText(/Both sides of this transfer/);fireEvent.click(screen.getByText("Confirm deletion"));await waitFor(()=>expect(api.deleteActivity).toHaveBeenCalledWith(transfer));
});
it("keeps archived activity readable and disables editing",async()=>{
 vi.mocked(api.account).mockResolvedValue({...account,active:false});vi.mocked(api.accounts).mockResolvedValue([{...account,active:false}]);render(<AccountDetail id="a" onBack={()=>{}} onExpired={()=>{}}/>);await screen.findByText("Synthetic purchase");expect(screen.getByText("Add transaction")).toBeDisabled();expect(screen.getByText("Edit entry")).toBeDisabled();
});
it("requires reload after a stale edit",async()=>{
 render(<AccountDetail id="a" onBack={()=>{}} onExpired={()=>{}}/>);await screen.findByText("Synthetic purchase");fireEvent.click(screen.getByText("Edit entry"));vi.mocked(api.saveActivity).mockRejectedValue(new ApiError(412,"Activity changed"));fireEvent.click(screen.getByText("Save activity"));await screen.findByText("Activity changed");expect(screen.getByText("Save activity")).toBeDisabled();
});
it("loads the next group of activity and expires unauthorized sessions",async()=>{
 vi.mocked(api.activity).mockResolvedValueOnce({items:[entry],page:0,hasMore:true}).mockResolvedValueOnce({items:[],page:1,hasMore:false});
 const expired=vi.fn();render(<AccountDetail id="a" onBack={()=>{}} onExpired={expired}/>);await screen.findByText("Synthetic purchase");fireEvent.click(screen.getByText("Next page"));await screen.findByText("No activity yet.");expect(api.activity).toHaveBeenLastCalledWith("a",1);
 vi.mocked(api.activity).mockRejectedValueOnce(new ApiError(401,"Expired"));fireEvent.click(screen.getByText("Previous page"));await waitFor(()=>expect(expired).toHaveBeenCalled());
});
