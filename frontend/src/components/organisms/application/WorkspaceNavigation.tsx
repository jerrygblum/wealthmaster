import { Link } from "../../atoms/Controls";
export function WorkspaceNavigation({ page, demo = false }: { page: string; demo?: boolean }) {
  return (
    <nav className="workspace-nav" aria-label="Workspace">
      {[
        { id: "net-worth", name: "Net worth" },
        { id: "net-worth/trends", name: "Trends" },
        { id: "accounts", name: "Accounts" },
        { id: "spending", name: "Spending" },
        { id: "expected", name: "Expected" },
        { id: "categories", name: "Categories" },
        { id: "imports", name: "Migration" },
        { id: "category-mapping", name: "Category mapping" },
        { id: "settings", name: demo ? "Preferences" : "Settings" },
      ]
        .filter((item) => !demo || !["imports", "category-mapping"].includes(item.id))
        .map((item) => (
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
