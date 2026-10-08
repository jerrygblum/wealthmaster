import type { ReactNode } from "react";
export function WorkspaceHeading({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div className="workspace-heading-copy">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="workspace-heading-actions">{actions}</div>}
    </div>
  );
}
