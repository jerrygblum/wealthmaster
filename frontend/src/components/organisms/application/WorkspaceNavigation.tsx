import { Link } from "../../atoms/Controls";
export function WorkspaceNavigation({ page }: { page: string }) {
  return (
    <nav className="workspace-nav" aria-label="Workspace">
      {[
        { id: "net-worth", name: "Net worth" },
        { id: "accounts", name: "Accounts" },
        { id: "spending", name: "Spending" },
        { id: "expected", name: "Expected" },
        { id: "categories", name: "Categories" },
        { id: "settings", name: "Settings" },
      ].map((item) => (
        <Link
          key={item.id}
          href={"#/" + item.id}
          aria-current={page === item.id ? "page" : undefined}
        >
          {item.name}
        </Link>
      ))}
    </nav>
  );
}
