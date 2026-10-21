<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<main
	class="flex min-h-screen items-center justify-center bg-[#070d1f] px-4 py-12 font-mono text-[#dce1fb]"
>
	<div
		class="w-full max-w-md space-y-4 rounded-lg border border-[#f43f5e]/40 bg-[#0f172a] p-6 text-center"
	>
		<div
			class="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#f43f5e]/50 bg-[#881337]/30 text-xl font-bold text-[#ff7886]"
		>
			!
		</div>
		<h1 class="font-sans text-lg font-bold tracking-tight text-white">System Diagnostics Error</h1>
		<p
			class="overflow-auto rounded border border-[#f43f5e]/30 bg-[#881337]/20 p-2.5 text-left text-xs text-[#ff7886]"
		>
			{page.error?.message ?? 'An unexpected error occurred.'}
		</p>
		<p class="text-[11px] text-[#64748b]">Status Code: {page.status}</p>
		<a
			href={resolve('/')}
			class="inline-block rounded border border-[#334155] bg-[#151b2d] px-4 py-2 text-xs text-white transition-colors hover:bg-[#1e293b]"
		>
			Reload Dashboard
		</a>
	</div>
</main>
