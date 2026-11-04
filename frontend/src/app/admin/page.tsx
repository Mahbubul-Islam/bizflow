import { AdminPanel } from "@/components/admin/admin-panel";
import { ConfirmationProvider } from "@/components/feedback/modal-feedback";

export default function AdminPage() {
  return <ConfirmationProvider><AdminPanel /></ConfirmationProvider>;
}
