const readWith: Record<string, string[]> = {
	"organizations.view": ["organizations.update"],
	"inventory.view": ["inventory.manage", "sales.manage"],
	"customers.view": ["customers.manage"],
	"crm.view": ["crm.manage"],
	"sales.view": [
		"sales.manage",
		"sales.confirm",
		"sales.cancel",
		"sales.invoice",
	],
};

export function hasWorkspacePermission(
	permissions: ReadonlySet<string>,
	permission: string,
) {
	return (
		permissions.has(permission) ||
		(readWith[permission] ?? []).some((other) => permissions.has(other))
	);
}
