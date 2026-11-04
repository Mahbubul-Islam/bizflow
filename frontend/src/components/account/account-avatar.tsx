import Image from "next/image";
import type { User } from "@/lib/utils";

export function AccountAvatar({ user, size = 36 }: { user: Pick<User, "avatar_url" | "first_name" | "email">; size?: number }) {
	const initial = user.first_name?.[0] || user.email[0] || "?";
	return <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary ring-2 ring-primary/15 ring-offset-2 ring-offset-card">
		{user.avatar_url ? <Image src={user.avatar_url} alt="" width={size} height={size} unoptimized className="size-full object-cover" /> : initial.toUpperCase()}
	</span>;
}
