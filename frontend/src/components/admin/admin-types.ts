import type {
	AuditLog,
	Member,
	RolePermissions,
} from "@/lib/utils";

export type AdminData = {
	members: Member[];
	permissions: RolePermissions;
	audit: AuditLog[];
	auditCount: number;
	auditNext: number | null;
};

export type AdminAction = (
	label: string,
	operation: () => Promise<unknown>,
) => Promise<boolean>;
