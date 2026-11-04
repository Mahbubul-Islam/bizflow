"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/forms/app-select";
import { ProductPicker } from "@/components/orders/product-picker";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useConfirmation } from "@/components/feedback/modal-feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authApi, categoriesApi, customersApi, inventoryApi, ordersApi, organizationsApi, productsApi, type AvailableMember, type Category, type Customer, type DraftOrderInput, type Order, type Product, type Role } from "@/lib/utils";
import type { AdminAction, AdminData } from "./admin-types";

type SectionProps = { data: AdminData; orgId: string; action: AdminAction; busy: boolean };
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const submit = (event: FormEvent<HTMLFormElement>, callback: (form: FormData, element: HTMLFormElement) => unknown) => {
  event.preventDefault();
  const element = event.currentTarget;
  void callback(new FormData(element), element);
};

export function OrganizationSection({ data, orgId, action, busy }: SectionProps) {
  const router = useRouter();
  const organization = data.organization;
  return <>
    <Card><CardHeader><CardTitle>Organization details</CardTitle><CardDescription>Update the information used across your workspace and invoices.</CardDescription></CardHeader><CardContent><form key={organization.id + organization.name + organization.currency} onSubmit={(event) => submit(event, (form) => action("Organization update", () => organizationsApi.update(orgId, { name: text(form, "name"), slug: text(form, "slug"), email: text(form, "email"), phone: text(form, "phone"), address: text(form, "address"), currency: text(form, "currency").toUpperCase() })))} className="grid gap-4 sm:grid-cols-2"><Field label="Name" name="name" defaultValue={organization.name} required /><Field label="Slug" name="slug" defaultValue={organization.slug} required /><Field label="Email" name="email" type="email" defaultValue={organization.email} /><Field label="Phone" name="phone" defaultValue={organization.phone} /><Field label="Currency" name="currency" defaultValue={organization.currency} maxLength={3} required /><div className="sm:col-span-2"><Label htmlFor="org-address">Address</Label><Textarea id="org-address" name="address" defaultValue={organization.address} className="mt-2" /></div><div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save organization</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Your password</CardTitle><CardDescription>Changing your password signs you out of all sessions.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => submit(event, async (form) => { const ok = await action("Password change", () => authApi.changePassword({ old_password: text(form, "old_password"), new_password: text(form, "new_password"), new_password_confirm: text(form, "new_password_confirm") })); if (ok) router.push("/login"); })} className="grid gap-4 sm:grid-cols-2"><Field label="Current password" name="old_password" type="password" autoComplete="current-password" required /><Field label="New password" name="new_password" type="password" autoComplete="new-password" required /><Field label="Confirm new password" name="new_password_confirm" type="password" autoComplete="new-password" required /><div className="flex items-end"><Button type="submit" variant="outline" disabled={busy}>Change password</Button></div></form></CardContent></Card>
  </>;
}

export function MembersSection({ data, orgId, action, busy }: SectionProps) {
  const confirmAction = useConfirmation();
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [matches, setMatches] = useState<AvailableMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  useEffect(() => {
    if (search.trim().length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      organizationsApi.searchMembers(orgId, search.trim()).then((users) => {
        if (!cancelled) { setMatches(users); setSearching(false); }
      }).catch(() => {
        if (!cancelled) { setSearchError(true); setSearching(false); }
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [orgId, search]);
  const updateSearch = (value: string) => {
    setSearch(value);
    setMatches([]);
    setSearchError(false);
    setSearching(value.trim().length >= 2);
  };
  return <>
    <Card><CardHeader><CardTitle>Add a member</CardTitle><CardDescription>Search registered users by email or username, then choose a role. Owner access can manage roles and members.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="member-search">Search users by email or username</Label><Input id="member-search" type="search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Enter at least 2 characters" autoComplete="off" className="mt-2" /><div aria-live="polite" className="mt-2 text-sm text-muted-foreground">{searching ? "Searching users..." : searchError ? "Could not search users. Try again." : search.trim().length >= 2 && matches.length === 0 ? "No available users found." : null}</div>{matches.length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border" aria-label="Available users">{matches.map((user) => <button key={user.email} type="button" onClick={() => { setEmail(user.email); updateSearch(""); }} className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><span className="font-medium">{`${user.first_name} ${user.last_name}`.trim() || user.username || user.email}</span><span className="text-muted-foreground">{user.email}</span></button>)}</div>}</div><form onSubmit={(event) => submit(event, async (form, element) => { const ok = await action("Member added", () => organizationsApi.addMember(orgId, { email: text(form, "email"), role: text(form, "role") as Role })); if (ok) { element.reset(); setEmail(""); updateSearch(""); } })} className="flex flex-wrap items-end gap-3"><div className="min-w-48 flex-1"><Field label="Account email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="w-36"><Label htmlFor="member-role">Role</Label><AppSelect id="member-role" name="role" defaultValue="STAFF" options={[{ value: "STAFF", label: "Staff" }, { value: "MANAGER", label: "Manager" }, { value: "OWNER", label: "Owner" }]} placeholder="Select role" className="mt-2 w-full" /></div><Button type="submit" disabled={busy}><Plus className="size-4" /> Add member</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Members</CardTitle><CardDescription>{data.members.length} active members in this organization.</CardDescription></CardHeader><CardContent>{data.members.length ? <Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{data.members.map((member) => <TableRow key={member.id}><TableCell className="font-medium"><div className="flex items-center gap-3"><AccountAvatar user={member} size={36} /><span>{`${member.first_name} ${member.last_name}`.trim() || "Member"}</span></div></TableCell><TableCell>{member.email}</TableCell><TableCell><AppSelect ariaLabel={`Role for ${member.email}`} value={member.role} disabled={busy} onValueChange={(next) => { void action("Member role updated", () => organizationsApi.changeMemberRole(orgId, member.id, next as Role)); }} options={[{ value: "OWNER", label: "Owner" }, { value: "MANAGER", label: "Manager" }, { value: "STAFF", label: "Staff" }]} placeholder="Select role" className="w-32" /></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.email}`} disabled={busy} onClick={() => confirmAction(`Remove ${member.email} from this organization?`, () => { void action("Member removed", () => organizationsApi.removeMember(orgId, member.id)); })}><Trash2 className="size-4" /></Button></TableCell></TableRow>)}</TableBody></Table> : <Empty text="No members yet." />}</CardContent></Card>
  </>;
}

export function PermissionsSection({ data, orgId, action, busy }: SectionProps) {
  const permissions = Object.entries(data.permissions.available_permissions);
  return <div className="grid gap-6 xl:grid-cols-2">
    {(["MANAGER", "STAFF"] as const).map((role) => <Card key={role}>
      <CardHeader><CardTitle>{role === "MANAGER" ? "Manager" : "Staff"} permissions</CardTitle><CardDescription>Choose which actions this role may perform. Owners always have full access.</CardDescription></CardHeader>
      <CardContent><form key={`${role}-${data.permissions.roles[role].join(",")}`} onSubmit={(event) => submit(event, (form) => action(`${role.toLowerCase()} permissions updated`, () => organizationsApi.updateRolePermissions(orgId, role, form.getAll("permission").map(String))))} className="space-y-4">
        <div className="max-h-[440px] space-y-3 overflow-y-auto pr-2">
          {permissions.map(([code, label]) => <label key={code} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" name="permission" value={code} defaultChecked={data.permissions.roles[role].includes(code)} className="size-4 accent-primary" />
            <span className="font-medium">{label}</span>
          </label>)}
        </div>
        <Button type="submit" disabled={busy}>Save {role.toLowerCase()} access</Button>
      </form></CardContent>
    </Card>)}
  </div>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} className="mt-2" {...props} /></div>;
}
function Empty({ text: message }: { text: string }) { return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>; }

export function InventorySection({ data, orgId, action, busy }: SectionProps) {
  const confirmAction = useConfirmation();
  const [editingCategory, setEditingCategory] = useState<Category>();
  const [editingProduct, setEditingProduct] = useState<Product>();
  const activeCategories = data.categories.filter((item) => item.is_active);
  const activeProducts = data.products.filter((item) => item.is_active);
  return <>
    <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle>{editingCategory ? "Edit category" : "New category"}</CardTitle><CardDescription>Group products in your catalog.</CardDescription></CardHeader><CardContent><form key={editingCategory?.id ?? "new-category"} onSubmit={(event) => submit(event, async (form) => { const input = { name: text(form, "name"), description: text(form, "description") }; const ok = await action(editingCategory ? "Category updated" : "Category created", () => editingCategory ? categoriesApi.update(orgId, editingCategory.id, input) : categoriesApi.create(orgId, input)); if (ok) setEditingCategory(undefined); })} className="space-y-4"><Field label="Category name" name="name" defaultValue={editingCategory?.name ?? ""} required /><div><Label htmlFor="category-description">Description</Label><Textarea id="category-description" name="description" defaultValue={editingCategory?.description ?? ""} className="mt-2" /></div><div className="flex gap-2"><Button type="submit" disabled={busy}>{editingCategory ? "Save category" : "Create category"}</Button>{editingCategory && <Button variant="outline" onClick={() => setEditingCategory(undefined)}>Cancel</Button>}</div></form><div className="mt-6 space-y-2 border-t border-border pt-4">{data.categories.map((category) => <div key={category.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{category.name}</p><p className="text-xs text-muted-foreground">{category.description || "No description"}</p></div>{!category.is_active && <Badge variant="secondary">Inactive</Badge>}<Button size="xs" variant="outline" onClick={() => setEditingCategory(category)}>Edit</Button>{category.is_active && <Button size="icon-xs" variant="ghost" aria-label={`Remove category ${category.name}`} disabled={busy} onClick={() => confirmAction(`Remove ${category.name} from active categories?`, () => { void action("Category removed", () => categoriesApi.remove(orgId, category.id)); })}><Trash2 className="size-3" /></Button>}</div>)}{!data.categories.length && <Empty text="No categories yet." />}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>{editingProduct ? "Edit product" : "New product"}</CardTitle><CardDescription>Product stock is changed through adjustments below.</CardDescription></CardHeader><CardContent><form key={editingProduct?.id ?? "new-product"} onSubmit={(event) => submit(event, async (form) => { const input = { name: text(form, "name"), sku: text(form, "sku"), category: text(form, "category") || null, cost_price: text(form, "cost_price"), selling_price: text(form, "selling_price"), reorder_level: Number(text(form, "reorder_level")), description: text(form, "description") }; const ok = await action(editingProduct ? "Product updated" : "Product created", () => editingProduct ? productsApi.update(orgId, editingProduct.id, input) : productsApi.create(orgId, input)); if (ok) setEditingProduct(undefined); })} className="grid gap-4 sm:grid-cols-2"><Field label="Product name" name="name" defaultValue={editingProduct?.name ?? ""} required /><Field label="SKU" name="sku" defaultValue={editingProduct?.sku ?? ""} required /><div><Label htmlFor="product-category">Category</Label><AppSelect id="product-category" name="category" defaultValue={editingProduct?.category ?? ""} options={[{ value: "", label: "No category" }, ...activeCategories.map((category) => ({ value: category.id, label: category.name }))]} placeholder="No category" className="mt-2 w-full" /></div><Field label="Reorder level" name="reorder_level" type="number" min="0" defaultValue={editingProduct?.reorder_level ?? 5} required /><Field label="Cost price" name="cost_price" type="number" min="0" step="0.01" defaultValue={editingProduct?.cost_price ?? ""} required /><Field label="Selling price" name="selling_price" type="number" min="0" step="0.01" defaultValue={editingProduct?.selling_price ?? ""} required /><div className="sm:col-span-2"><Label htmlFor="product-description">Description</Label><Textarea id="product-description" name="description" defaultValue={editingProduct?.description ?? ""} className="mt-2" /></div><div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{editingProduct ? "Save product" : "Create product"}</Button>{editingProduct && <Button variant="outline" onClick={() => setEditingProduct(undefined)}>Cancel</Button>}</div></form></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Products</CardTitle><CardDescription>{activeProducts.length} active products.</CardDescription></CardHeader><CardContent>{data.products.length ? <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.products.map((product) => <TableRow key={product.id}><TableCell className="font-medium">{product.name}</TableCell><TableCell>{product.sku}</TableCell><TableCell><span className={product.stock_quantity <= product.reorder_level ? "font-semibold text-destructive" : ""}>{product.stock_quantity}{product.stock_quantity <= product.reorder_level ? product.stock_quantity === 0 ? " ? Out of stock" : " ? Low stock" : ""}</span></TableCell><TableCell><Badge variant={product.is_active ? "secondary" : "outline"}>{product.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="space-x-2 text-right"><Button size="xs" variant="outline" onClick={() => setEditingProduct(product)}>Edit</Button>{product.is_active && <Button size="icon-xs" variant="ghost" aria-label={`Remove product ${product.name}`} disabled={busy} onClick={() => confirmAction(`Remove ${product.name} from active products?`, () => { void action("Product removed", () => productsApi.remove(orgId, product.id)); })}><Trash2 className="size-3" /></Button>}</TableCell></TableRow>)}</TableBody></Table> : <Empty text="No products yet." />}</CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle>Adjust stock</CardTitle><CardDescription>Use a positive number to add stock, or a negative number to reduce it.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => submit(event, async (form, element) => { const quantity_delta = Number(text(form, "quantity_delta")); const ok = await action("Stock adjusted", async () => { if (!Number.isInteger(quantity_delta) || quantity_delta === 0) throw new Error("Enter a nonzero whole number."); await inventoryApi.adjustStock(orgId, { product_id: text(form, "product_id"), quantity_delta, reason: text(form, "reason") }); }); if (ok) element.reset(); })} className="space-y-4"><div><Label htmlFor="stock-product">Product</Label><AppSelect id="stock-product" name="product_id" required options={activeProducts.map((product) => ({ value: product.id, label: `${product.name} (${product.stock_quantity} in stock)` }))} placeholder="Select a product" className="mt-2 w-full" /></div><Field label="Quantity change" name="quantity_delta" type="number" step="1" required /><Field label="Reason" name="reason" required maxLength={255} /><Button type="submit" disabled={busy || !activeProducts.length}>Save adjustment</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Recent stock movements</CardTitle><CardDescription>Latest quantity changes recorded by the API.</CardDescription></CardHeader><CardContent>{data.movements.length ? <div className="max-h-80 space-y-2 overflow-y-auto">{data.movements.slice(0, 20).map((movement) => <div key={movement.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"><span className={`font-semibold ${movement.quantity_delta >= 0 ? "text-primary" : "text-destructive"}`}>{movement.quantity_delta >= 0 ? "+" : ""}{movement.quantity_delta}</span><span className="min-w-0 flex-1 truncate">{data.products.find((product) => product.id === movement.product_id)?.name ?? movement.product_id}</span><span className="text-xs text-muted-foreground">Now {movement.quantity_after}</span></div>)}</div> : <Empty text="No stock movements yet." />}</CardContent></Card></div>
  </>;
}

export function CustomersSection({ data, orgId, action, busy }: SectionProps) {
  const confirmAction = useConfirmation();
  const [editing, setEditing] = useState<Customer>();
  return <><Card><CardHeader><CardTitle>{editing ? "Edit customer" : "New customer"}</CardTitle><CardDescription>Keep customer contact details in one place.</CardDescription></CardHeader><CardContent><form key={editing?.id ?? "new-customer"} onSubmit={(event) => submit(event, async (form) => { const input = { name: text(form, "name"), email: text(form, "email"), phone: text(form, "phone"), address: text(form, "address"), notes: text(form, "notes") }; const ok = await action(editing ? "Customer updated" : "Customer created", () => editing ? customersApi.update(orgId, editing.id, input) : customersApi.create(orgId, input)); if (ok) setEditing(undefined); })} className="grid gap-4 sm:grid-cols-2"><Field label="Customer name" name="name" defaultValue={editing?.name ?? ""} required /><Field label="Email" name="email" type="email" defaultValue={editing?.email ?? ""} /><Field label="Phone" name="phone" defaultValue={editing?.phone ?? ""} /><Field label="Address" name="address" defaultValue={editing?.address ?? ""} /><div className="sm:col-span-2"><Label htmlFor="customer-notes">Notes</Label><Textarea id="customer-notes" name="notes" defaultValue={editing?.notes ?? ""} className="mt-2" /></div><div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{editing ? "Save customer" : "Create customer"}</Button>{editing && <Button variant="outline" onClick={() => setEditing(undefined)}>Cancel</Button>}</div></form></CardContent></Card><Card><CardHeader><CardTitle>Customer list</CardTitle><CardDescription>{data.customers.filter((item) => item.is_active).length} active customers.</CardDescription></CardHeader><CardContent>{data.customers.length ? <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.customers.map((customer) => <TableRow key={customer.id}><TableCell className="font-medium">{customer.name}</TableCell><TableCell>{customer.email || "—"}</TableCell><TableCell>{customer.phone || "—"}</TableCell><TableCell><Badge variant={customer.is_active ? "secondary" : "outline"}>{customer.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="space-x-2 text-right"><Button variant="outline" size="xs" onClick={() => setEditing(customer)}>Edit</Button>{customer.is_active && <Button variant="ghost" size="icon-xs" aria-label={`Remove customer ${customer.name}`} disabled={busy} onClick={() => confirmAction(`Remove ${customer.name} from active customers?`, () => { void action("Customer removed", () => customersApi.remove(orgId, customer.id)); })}><Trash2 className="size-3" /></Button>}</TableCell></TableRow>)}</TableBody></Table> : <Empty text="No customers yet." />}</CardContent></Card></>;
}

export function OrdersSection({ data, orgId, action, busy }: SectionProps) {
  const confirmAction = useConfirmation();
  const [editing, setEditing] = useState<Order>();
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([{ product_id: "", quantity: 1 }]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0.00");
  const [tax, setTax] = useState("0.00");
  const [notes, setNotes] = useState("");
  const availableProducts = data.products.filter((item) => item.is_active);
  const availableCustomers = data.customers.filter((item) => item.is_active);

  function reset() { setEditing(undefined); setItems([{ product_id: "", quantity: 1 }]); setCustomerId(""); setDiscount("0.00"); setTax("0.00"); setNotes(""); }
  function edit(order: Order) { setEditing(order); setItems(order.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity }))); setCustomerId(order.customer_id ?? ""); setDiscount(order.discount_amount); setTax(order.tax_amount); setNotes(order.notes); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: DraftOrderInput = { customer_id: customerId || null, items, discount_amount: discount, tax_amount: tax, notes };
    const ok = await action(editing ? "Draft order updated" : "Draft order created", async () => {
      if (!items.length || items.some((item) => !item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error("Add at least one product with a valid quantity.");
      if (new Set(items.map((item) => item.product_id)).size !== items.length) throw new Error("Each product may appear only once.");
      if (items.some((item) => { const product = data.products.find((candidate) => candidate.id === item.product_id); return !product || !product.is_active || product.stock_quantity < item.quantity; })) throw new Error("Choose available products and quantities within current stock.");
      if (editing) await ordersApi.update(orgId, editing.id, input);
      else await ordersApi.create(orgId, input);
    });
    if (ok) reset();
  }
  async function downloadInvoice(order: Order) {
    await action("Invoice downloaded", async () => {
      const blob = await ordersApi.invoice(orgId, order.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-${order.order_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return <><Card><CardHeader><CardTitle>{editing ? `Edit ${editing.order_number}` : "New draft order"}</CardTitle><CardDescription>Create a draft, then confirm it when stock and totals are correct.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void save(event)} className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="order-customer">Customer</Label><AppSelect id="order-customer" value={customerId} onValueChange={setCustomerId} options={[{ value: "", label: "No customer" }, ...availableCustomers.map((customer) => ({ value: customer.id, label: customer.name }))]} placeholder="No customer" className="mt-2 w-full" /></div><div><Label htmlFor="order-discount">Discount</Label><Input id="order-discount" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-2" required /></div><div><Label htmlFor="order-tax">Tax</Label><Input id="order-tax" type="number" min="0" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} className="mt-2" required /></div></div><div><Label>Items</Label><div className="mt-2 space-y-2">{items.map((item, index) => <div key={index} className="flex flex-wrap gap-2"><ProductPicker products={data.products} label={`Product for item ${index + 1}`} value={item.product_id} onChange={(next) => setItems((current) => current.map((entry, position) => position === index ? { ...entry, product_id: next } : entry))} /><Input aria-label={`Quantity for item ${index + 1}`} type="number" min="1" max={data.products.find((product) => product.id === item.product_id)?.stock_quantity} step="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry, position) => position === index ? { ...entry, quantity: Number(event.target.value) } : entry))} className="w-24" required /><Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${index + 1}`} onClick={() => setItems((current) => current.filter((_, position) => position !== index))}><Trash2 className="size-4" /></Button></div>)}</div><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setItems((current) => [...current, { product_id: "", quantity: 1 }])}><Plus className="size-4" /> Add item</Button></div><div><Label htmlFor="order-notes">Notes</Label><Textarea id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2" /></div><div className="flex gap-2"><Button type="submit" disabled={busy || !availableProducts.length}>{editing ? "Save draft" : "Create draft"}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}</div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Orders</CardTitle><CardDescription>Confirm drafts, cancel orders, or download confirmed invoices.</CardDescription></CardHeader><CardContent>{data.orders.length ? <Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.orders.map((order) => <TableRow key={order.id}><TableCell className="font-semibold">{order.order_number}</TableCell><TableCell><Badge variant={order.status === "CONFIRMED" ? "default" : order.status === "CANCELLED" ? "destructive" : "secondary"}>{order.status}</Badge></TableCell><TableCell>{order.items.length}</TableCell><TableCell>{order.total_amount} {data.organization.currency}</TableCell><TableCell className="space-x-1 text-right">{order.status === "DRAFT" && <><Button variant="outline" size="xs" onClick={() => edit(order)}>Edit</Button><Button size="xs" disabled={busy} onClick={() => confirmAction(`Confirm ${order.order_number}? Stock will be reduced.`, () => { void action("Order confirmed", () => ordersApi.confirm(orgId, order.id)); })}>Confirm</Button></>}{order.status === "CONFIRMED" && <Button variant="outline" size="xs" disabled={busy} onClick={() => void downloadInvoice(order)}><ArrowDownToLine className="size-3" /> Invoice</Button>}{order.status !== "CANCELLED" && <Button variant="ghost" size="xs" disabled={busy} onClick={() => confirmAction(`Cancel ${order.order_number}?`, () => { void action("Order cancelled", () => ordersApi.cancel(orgId, order.id)); })}>Cancel</Button>}</TableCell></TableRow>)}</TableBody></Table> : <Empty text="No orders yet." />}</CardContent></Card></>;
}

export function AuditSection({ data }: { data: AdminData }) {
  return <Card>
    <CardHeader><CardTitle>Audit log</CardTitle><CardDescription>Recorded changes and business actions for this organization.</CardDescription></CardHeader>
    <CardContent>{data.audit.length ? <Table>
      <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Changes</TableHead></TableRow></TableHeader>
      <TableBody>{data.audit.map((log) => <TableRow key={log.id}>
        <TableCell className="whitespace-nowrap text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.created_at))}</TableCell>
        <TableCell className="font-medium">{humanize(log.action)}</TableCell>
        <TableCell>{log.entity_type.replace(/([a-z])([A-Z])/g, "$1 $2")}</TableCell>
        <TableCell><AuditChanges changes={log.changes} /></TableCell>
      </TableRow>)}</TableBody>
    </Table> : <Empty text="No audit events yet." />}</CardContent>
  </Card>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatAuditValue).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${formatAuditValue(item)}`).join(", ");
  return String(value);
}

function AuditChanges({ changes }: { changes: Record<string, unknown> }) {
  const entries = Object.entries(changes);
  if (!entries.length) return <span className="text-sm text-muted-foreground">No field details</span>;
  return <div className="min-w-48 space-y-2 text-sm">{entries.map(([field, change]) => {
    const pair = change && typeof change === "object" && !Array.isArray(change) && ("old" in change || "new" in change) ? change as { old?: unknown; new?: unknown } : null;
    return <div key={field} className="leading-5"><span className="font-medium">{humanize(field)}: </span>{pair ? pair.old == null ? <span>Added {formatAuditValue(pair.new)}</span> : pair.new == null ? <span>Removed {formatAuditValue(pair.old)}</span> : <span><span className="text-muted-foreground">{formatAuditValue(pair.old)}</span> → {formatAuditValue(pair.new)}</span> : <span>{formatAuditValue(change)}</span>}</div>;
  })}</div>;
}
