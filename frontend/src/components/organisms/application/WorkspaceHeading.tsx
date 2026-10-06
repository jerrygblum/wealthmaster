import type { ReactNode } from "react";
export function WorkspaceHeading({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">Your workspace</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}
