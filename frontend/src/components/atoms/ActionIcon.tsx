export function ActionIcon({
  action,
}: {
  action:
    | "copy"
    | "add"
    | "link"
    | "unlink"
    | "skip"
    | "record"
    | "refresh"
    | "logout"
    | "previous"
    | "next"
    | "edit"
    | "archive"
    | "restore"
    | "delete"
    | "activity"
    | "settings"
    | "expand"
    | "collapse";
}) {
  const paths = {
    copy: "M9 3h12v14H9Z M5 7H3v14h12v-2",
    add: "M12 4v16 M4 12h16",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
    unlink: "M3 3l18 18 M10 13l3-3 M4 14l-1 1a5 5 0 0 0 7 7l2-2 M14 3a5 5 0 0 1 7 7l-2 2",
    skip: "M5 4l10 8-10 8Z M19 4v16",
    record: "M4 4h16v16H4Z M8 12l3 3 5-6",
    refresh: "M20 11a8 8 0 1 0-2 6 M20 4v7h-7",
    logout: "M9 4H4v16h5 M14 8l4 4-4 4 M9 12h11",
    previous: "M15 5l-7 7 7 7",
    next: "M9 5l7 7-7 7",
    activity: "M4 4h16v16H4Z M8 8h8 M8 12h8 M8 16h5",
    settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
    expand: "M9 5l7 7-7 7",
    collapse: "M5 9l7 7 7-7",
    edit: "M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7 M16 3l5 5-10 10-5 1 1-5Z",
    archive: "M3 3h18v4H3Z M5 7v14h14V7 M10 11h4",
    restore: "M3 3h18v4H3Z M5 7v14h14V7 M12 17v-6 M9 14l3-3 3 3",
    delete: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  };
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[action]} />
    </svg>
  );
}
