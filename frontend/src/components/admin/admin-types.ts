import type { AuditLog, Category, Customer, Member, Order, Organization, Product, RolePermissions, StockMovement } from "@/lib/utils";

export type AdminData = {
  organization: Organization;
  members: Member[];
  permissions: RolePermissions;
  categories: Category[];
  products: Product[];
  movements: StockMovement[];
  customers: Customer[];
  orders: Order[];
  audit: AuditLog[];
};

export type AdminAction = (label: string, operation: () => Promise<unknown>) => Promise<boolean>;
