export default function RoleBadge({ role }: { role: string }) {
  return <span className={`role-badge role-${role.replace(/\s+/g, "-")}`}>{role}</span>;
}
