const DISPLAY_LABEL: Record<string, string> = {
  Admin: "Co-Owner",
};

export default function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`role-badge role-${role}`}>{DISPLAY_LABEL[role] ?? role}</span>
  );
}
