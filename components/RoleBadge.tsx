export default function RoleBadge({ role }: { role: string }) {
  return <span className={`role-badge role-${role}`}>{role}</span>;
}
