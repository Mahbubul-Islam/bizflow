import Image from "next/image";

export function BrandLogo({ className = "" }: { className?: string }) {
	return (
		<span className={`relative block shrink-0 overflow-hidden ${className}`}>
			<Image
				src="/Bizflow_logo.png"
				alt="BizFlow"
				width={2000}
				height={2000}
				priority
				className="absolute left-0 top-0 h-auto w-[136%] max-w-none -translate-x-[13%] -translate-y-[31%]"
			/>
		</span>
	);
}
