export type CustomRole = {
  id: string;
  name: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  icon?: string | null;
};

export default function CustomRoleBadge({
  role,
  size = "md",
  onRemove,
}: {
  role: CustomRole;
  size?: "sm" | "md";
  onRemove?: () => void;
}) {
  const small = size === "sm";
  return (
    <span
      className="custom-role-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "1px 7px" : "2px 9px",
        borderRadius: 8,
        fontSize: small ? 10.5 : 12,
        lineHeight: 1.6,
        background: `${role.color}1a`,
        border: `1px solid ${role.color}55`,
        color: role.color,
        fontWeight: role.bold ? 700 : 500,
        fontStyle: role.italic ? "italic" : "normal",
        textDecoration: [
          role.underline ? "underline" : "",
          role.strikethrough ? "line-through" : "",
        ]
          .filter(Boolean)
          .join(" "),
        whiteSpace: "nowrap",
      }}
      title={role.name}
    >
      {role.icon && <span>{role.icon}</span>}
      {role.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            color: role.color,
            opacity: 0.7,
            fontSize: small ? 10 : 11,
            marginLeft: 2,
            lineHeight: 1,
          }}
          title={`Remove ${role.name}`}
        >
          ✕
        </button>
      )}
    </span>
  );
}
