<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Types
	type LogItem = {
		id: number;
		adcValue: number;
		status: 'NORMAL' | 'PERINGATAN';
		createdAt: string;
	};

	type ChartPoint = {
		time: string;
		adc: number;
	};

	type TimeRange = '5m' | '10m' | '1h' | '24h' | '7d' | 'all';

	// ── Time Range Configuration ─────────────────────────────────────
	const timeRanges: { id: TimeRange; label: string; desc: string }[] = [
		{ id: '5m', label: '5m', desc: 'Last 5 minutes' },
		{ id: '10m', label: '10m', desc: 'Last 10 minutes' },
		{ id: '1h', label: '1h', desc: 'Last 1 hour' },
		{ id: '24h', label: '24h', desc: 'Last 24 hours' },
		{ id: '7d', label: '7d', desc: 'Last 7 days' },
		{ id: 'all', label: 'All', desc: 'All recorded history' }
	];

	let selectedRange = $state<TimeRange>('10m');
	let isLoadingHistory = $state(false);
	let activeRequestId = 0;

	let currentRangeDesc = $derived(
		timeRanges.find((r) => r.id === selectedRange)?.desc ?? 'Last 10 minutes'
	);

	// ── Format helpers ───────────────────────────────────────────────
	function formatTableTime(isoStr: string): string {
		try {
			const d = new Date(isoStr);
			if (isNaN(d.getTime())) return isoStr;
			const pad = (n: number) => String(n).padStart(2, '0');
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		} catch {
			return isoStr;
		}
	}

	function formatChartTime(isoStr: string, range: TimeRange = selectedRange): string {
		try {
			const d = new Date(isoStr);
			if (isNaN(d.getTime())) return isoStr;
			const pad = (n: number) => String(n).padStart(2, '0');
			if (range === '7d' || range === 'all') {
				return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
			}
			if (range === '24h') {
				return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
			}
			return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		} catch {
			return isoStr;
		}
	}

	function calcPercentage(val: number): string {
		return ((val / 4095) * 100).toFixed(1);
	}

	// ── Build Initial Data from Server Logs ─────────────────────────
	function buildInitialChart(initialLogs: LogItem[], range: TimeRange = '10m'): ChartPoint[] {
		if (initialLogs.length >= 2) {
			const safeLogs = [...initialLogs].reverse();
			return safeLogs.map((l) => ({
				time: formatChartTime(l.createdAt, range),
				adc: l.adcValue
			}));
		}

		if (initialLogs.length === 1) {
			const l = initialLogs[0];
			const t = new Date(l.createdAt);
			const tPrev = new Date(t.getTime() - 30_000);
			return [
				{ time: formatChartTime(tPrev.toISOString(), range), adc: l.adcValue },
				{ time: formatChartTime(l.createdAt, range), adc: l.adcValue }
			];
		}

		// Initial cold start baseline before first reading arrives
		const now = Date.now();
		const points: ChartPoint[] = [];
		for (let i = 10; i >= 0; i--) {
			const t = new Date(now - i * 30_000);
			points.push({
				time: formatChartTime(t.toISOString(), range),
				adc: 420 + ((i * 13) % 40)
			});
		}
		return points;
	}

	// ── Reactive State (Initialized directly from initial server data) ─
	let isConnected = $state(false);
	// svelte-ignore state_referenced_locally
	let logs = $state<LogItem[]>(data.logs ?? []);
	// svelte-ignore state_referenced_locally
	let currentAdc = $state(data.latest?.adcValue ?? 0);
	// svelte-ignore state_referenced_locally
	let currentStatus = $state<'NORMAL' | 'PERINGATAN'>(data.latest?.status ?? 'NORMAL');
	// svelte-ignore state_referenced_locally
	let chartPoints = $state<ChartPoint[]>(buildInitialChart(data.logs ?? []));

	// ── Switch Time Filter with Race Condition Prevention ───────────
	async function setTimeRange(range: TimeRange) {
		selectedRange = range;
		isLoadingHistory = true;
		const thisRequestId = ++activeRequestId;

		try {
			const res = await fetch(`/api/history?range=${range}&_t=${Date.now()}`, {
				cache: 'no-store'
			});

			if (thisRequestId !== activeRequestId) {
				// User switched to another filter while this request was in flight
				return;
			}

			if (res.ok) {
				const json = await res.json();
				if (json.points && Array.isArray(json.points)) {
					if (json.points.length >= 2) {
						chartPoints = json.points.map((p: { adc: number; createdAt: string }) => ({
							time: formatChartTime(p.createdAt, range),
							adc: p.adc
						}));
					} else if (json.points.length === 1) {
						const p = json.points[0];
						const t = new Date(p.createdAt);
						const tPrev = new Date(t.getTime() - 60_000);
						chartPoints = [
							{ time: formatChartTime(tPrev.toISOString(), range), adc: p.adc },
							{ time: formatChartTime(p.createdAt, range), adc: p.adc }
						];
					} else {
						// 0 records in selected range
						chartPoints = [];
					}
				}
			}
		} catch (err) {
			console.error('Failed to load history for range:', range, err);
		} finally {
			if (thisRequestId === activeRequestId) {
				isLoadingHistory = false;
			}
		}
	}

	// ── SSE Real-time Listener (Always updates UI & Chart) ────────────
	onMount(() => {
		let eventSource: EventSource | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function connectSSE() {
			try {
				eventSource = new EventSource('/api/sse');

				eventSource.onopen = () => {
					isConnected = true;
				};

				eventSource.onmessage = (event) => {
					try {
						const payload = JSON.parse(event.data);
						const adc = typeof payload.adc === 'number' ? payload.adc : payload.adcValue;
						const status = payload.status as 'NORMAL' | 'PERINGATAN';
						const createdAt = payload.createdAt || new Date().toISOString();

						// 1. Update live cards
						currentAdc = adc;
						currentStatus = status;

						// 2. Prepend to logs table (keep max 15)
						logs = [
							{
								id: Date.now(),
								adcValue: adc,
								status,
								createdAt
							},
							...logs.slice(0, 14)
						];

						// 3. ALWAYS append point to chart under ANY active filter
						const sliceLimits: Record<TimeRange, number> = {
							'5m': -29,
							'10m': -59,
							'1h': -59,
							'24h': -59,
							'7d': -59,
							all: -79
						};
						const maxSlice = sliceLimits[selectedRange] ?? -29;

						const newPoint: ChartPoint = {
							time: formatChartTime(createdAt, selectedRange),
							adc
						};

						chartPoints = [...chartPoints.slice(maxSlice), newPoint];
					} catch (err) {
						console.error('Failed to parse SSE payload:', err);
					}
				};

				eventSource.onerror = () => {
					isConnected = false;
					if (eventSource) {
						eventSource.close();
						eventSource = null;
					}
					reconnectTimer = setTimeout(connectSSE, 3000);
				};
			} catch (err) {
				console.error('Failed to initialize SSE:', err);
			}
		}

		connectSSE();

		return () => {
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (eventSource) eventSource.close();
		};
	});

	// ── Derived Hardware States ──────────────────────────────────────
	let isWarning = $derived(currentStatus === 'PERINGATAN' || currentAdc >= 2000);
	let buzzerState = $derived(isWarning ? 'ON' : 'OFF');
	let redLedState = $derived(isWarning ? 'ON' : 'OFF');
	let greenLedState = $derived(isWarning ? 'OFF' : 'ON');

	// ── SVG Chart Dimensions & Helpers ───────────────────────────────
	const viewBoxWidth = 840;
	const viewBoxHeight = 220;
	const padLeft = 45;
	const padRight = 30;
	const padTop = 15;
	const padBottom = 30;
	const chartW = viewBoxWidth - padLeft - padRight;
	const chartH = viewBoxHeight - padTop - padBottom;
	const maxAdcScale = 4041;

	function scaleX(index: number, total: number): number {
		if (total <= 1) return padLeft + chartW / 2;
		return padLeft + (index / (total - 1)) * chartW;
	}

	function scaleY(val: number): number {
		const clamped = Math.max(0, Math.min(maxAdcScale, val));
		return padTop + chartH - (clamped / maxAdcScale) * chartH;
	}

	let thresholdY = $derived(scaleY(2000));

	// Compute smooth SVG curve path and gradient area
	let chartPathData = $derived.by(() => {
		if (chartPoints.length === 0) return { line: '', area: '', lastX: 0, lastY: 0 };

		const coords = chartPoints.map((pt, i) => ({
			x: scaleX(i, chartPoints.length),
			y: scaleY(pt.adc)
		}));

		if (coords.length === 1) {
			const pt = coords[0];
			return {
				line: `M ${pt.x} ${pt.y}`,
				area: `M ${pt.x} ${pt.y} L ${pt.x} ${padTop + chartH} Z`,
				lastX: pt.x,
				lastY: pt.y
			};
		}

		// Build smooth path using cubic Bezier curve
		let lineD = `M ${coords[0].x} ${coords[0].y}`;
		for (let i = 0; i < coords.length - 1; i++) {
			const p0 = coords[i === 0 ? 0 : i - 1];
			const p1 = coords[i];
			const p2 = coords[i + 1];
			const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;
			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;

			lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
		}

		const firstX = coords[0].x;
		const lastPt = coords[coords.length - 1];
		const bottomY = padTop + chartH;
		const areaD = `${lineD} L ${lastPt.x.toFixed(1)} ${bottomY} L ${firstX.toFixed(1)} ${bottomY} Z`;

		return {
			line: lineD,
			area: areaD,
			lastX: lastPt.x,
			lastY: lastPt.y
		};
	});

	// Safe evenly distributed X-axis labels (guarded against division by zero)
	let displayedXLabels = $derived.by(() => {
		const total = chartPoints.length;
		if (total === 0) return [];
		if (total === 1) {
			return [{ text: chartPoints[0]?.time ?? '', x: padLeft + chartW / 2 }];
		}
		const count = Math.min(6, total);
		const indices: number[] = [];
		for (let i = 0; i < count; i++) {
			const idx = Math.round((i * (total - 1)) / (count - 1));
			if (!indices.includes(idx)) indices.push(idx);
		}
		return indices
			.filter((idx) => idx >= 0 && idx < total && chartPoints[idx])
			.map((idx) => ({
				text: chartPoints[idx].time,
				x: scaleX(idx, total)
			}));
	});

	// ── Interactive Chart Hover / Tooltip ────────────────────────────
	type HoverInfo = {
		x: number;
		y: number;
		adc: number;
		time: string;
		percentage: string;
		isWarning: boolean;
	};

	let hoveredPoint = $state<HoverInfo | null>(null);

	function handleChartHover(e: MouseEvent) {
		const svg = e.currentTarget as SVGSVGElement | null;
		if (!svg || chartPoints.length === 0) return;

		const rect = svg.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const normalizedX = (mouseX / rect.width) * viewBoxWidth;

		let closestIdx = 0;
		let minDiff = Infinity;

		for (let i = 0; i < chartPoints.length; i++) {
			const ptX = scaleX(i, chartPoints.length);
			const diff = Math.abs(ptX - normalizedX);
			if (diff < minDiff) {
				minDiff = diff;
				closestIdx = i;
			}
		}

		const pt = chartPoints[closestIdx];
		if (!pt) return;

		const x = scaleX(closestIdx, chartPoints.length);
		const y = scaleY(pt.adc);

		hoveredPoint = {
			x,
			y,
			adc: pt.adc,
			time: pt.time,
			percentage: calcPercentage(pt.adc),
			isWarning: pt.adc >= 2000
		};
	}

	function handleChartLeave() {
		hoveredPoint = null;
	}
</script>

<main class="flex min-h-screen justify-center bg-[#070d1f] px-4 py-8 text-[#dce1fb] md:py-12">
	<div class="w-full max-w-5xl space-y-6">
		<!-- ── Header ─────────────────────────────────────────────── -->
		<header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="font-sans text-2xl font-bold tracking-tight text-white md:text-3xl">
					GasGuard IoT - Kel 2
				</h1>
				<p class="mt-1 font-sans text-xs text-[#94a3b8] md:text-sm">
					Read-Only Monitoring Dashboard
				</p>
			</div>

			<!-- MQTT Connection Status Badge -->
			<div class="flex items-center">
				<div
					class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs transition-all duration-300 {isConnected
						? 'border-[#10b981]/40 bg-[#064e3b]/40 text-[#4edea3]'
						: 'border-[#334155]/60 bg-[#151b2d] text-[#94a3b8]'}"
				>
					<span class="relative flex h-2 w-2">
						{#if isConnected}
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4edea3] opacity-75"
							></span>
						{/if}
						<span
							class="relative inline-flex h-2 w-2 rounded-full {isConnected
								? 'bg-[#4edea3]'
								: 'bg-amber-400'}"
						></span>
					</span>
					<span>{isConnected ? 'MQTT Connected' : 'Connecting...'}</span>
				</div>
			</div>
		</header>

		<!-- ── 3 Top Cards ────────────────────────────────────────── -->
		<section class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<!-- Card 1: Current Gas Level -->
			<div
				class="flex flex-col justify-between rounded-lg border border-[#1e293b] bg-[#0f172a] p-5 shadow-sm transition-colors duration-300 {isWarning
					? 'ring-1 ring-[#f43f5e]/40'
					: ''}"
			>
				<div>
					<p class="text-[11px] font-semibold tracking-wider text-[#94a3b8] uppercase">
						Current Gas Level
					</p>
					<div class="mt-3 flex items-baseline gap-2">
						<span class="font-mono text-4xl font-bold tracking-tight text-white md:text-5xl">
							{currentAdc}
						</span>
						<span class="font-mono text-sm text-[#94a3b8]">
							/ {maxAdcScale}
						</span>
					</div>
				</div>
				<p class="mt-4 font-mono text-xs text-[#64748b]">
					Raw 12-bit ADC Reading ({calcPercentage(currentAdc)}% FS)
				</p>
			</div>

			<!-- Card 2: System Status -->
			<div
				class="flex flex-col justify-between rounded-lg border border-[#1e293b] bg-[#0f172a] p-5 shadow-sm transition-colors duration-300 {isWarning
					? 'ring-1 ring-[#f43f5e]/40'
					: ''}"
			>
				<div>
					<p class="text-[11px] font-semibold tracking-wider text-[#94a3b8] uppercase">
						System Status
					</p>
					<div class="mt-3">
						{#if isWarning}
							<span
								class="inline-block rounded border border-[#f43f5e]/60 bg-[#881337]/50 px-3 py-1 font-mono text-xs font-bold tracking-wider text-[#ff7886] uppercase"
							>
								PERINGATAN
							</span>
						{:else}
							<span
								class="inline-block rounded border border-[#10b981]/50 bg-[#064e3b]/50 px-3 py-1 font-mono text-xs font-bold tracking-wider text-[#4edea3] uppercase"
							>
								NORMAL
							</span>
						{/if}
					</div>
				</div>
				<p class="mt-4 font-mono text-xs text-[#64748b]">
					{isWarning ? 'Dangerous Gas Level (>= 2000 ADC)' : 'Threshold Safe (< 2000 ADC)'}
				</p>
			</div>

			<!-- Card 3: Local Hardware State -->
			<div
				class="flex flex-col justify-between rounded-lg border border-[#1e293b] bg-[#0f172a] p-5 shadow-sm"
			>
				<div>
					<p class="text-[11px] font-semibold tracking-wider text-[#94a3b8] uppercase">
						Local Hardware State
					</p>
					<div class="mt-3 space-y-1.5 font-mono text-xs">
						<!-- Buzzer -->
						<div class="flex items-center gap-2">
							<span
								class="h-1.5 w-1.5 rounded-full {buzzerState === 'ON'
									? 'bg-[#ff7886]'
									: 'bg-[#475569]'}"
							></span>
							<span class="text-[#94a3b8]">Buzzer:</span>
							<span
								class="font-semibold {buzzerState === 'ON' ? 'text-[#ff7886]' : 'text-[#94a3b8]'}"
							>
								{buzzerState}
							</span>
						</div>

						<!-- Red LED -->
						<div class="flex items-center gap-2">
							<span
								class="h-1.5 w-1.5 rounded-full {redLedState === 'ON'
									? 'bg-[#ff7886]'
									: 'bg-[#475569]'}"
							></span>
							<span class="text-[#94a3b8]">Red LED:</span>
							<span
								class="font-semibold {redLedState === 'ON' ? 'text-[#ff7886]' : 'text-[#94a3b8]'}"
							>
								{redLedState}
							</span>
						</div>

						<!-- Green LED -->
						<div class="flex items-center gap-2">
							<span
								class="h-1.5 w-1.5 rounded-full {greenLedState === 'ON'
									? 'bg-[#4edea3]'
									: 'bg-[#475569]'}"
							></span>
							<span class="text-[#94a3b8]">Green LED:</span>
							<span
								class="font-semibold {greenLedState === 'ON' ? 'text-[#4edea3]' : 'text-[#94a3b8]'}"
							>
								{greenLedState}
							</span>
						</div>
					</div>
				</div>
				<p class="mt-4 font-mono text-xs text-[#64748b]">Actuator bus synced</p>
			</div>
		</section>

		<!-- ── Middle Card: ADC Telemetry Chart + Time Filter ─────── -->
		<section class="rounded-lg border border-[#1e293b] bg-[#0f172a] p-5 shadow-sm">
			<div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-semibold tracking-tight text-white md:text-base">
							Gas Sensor ADC Telemetry (12-bit)
						</h2>
						{#if isLoadingHistory}
							<span
								class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#4cd7f6] border-t-transparent"
							></span>
						{/if}
					</div>
					<p class="mt-0.5 font-mono text-xs text-[#94a3b8]">
						ADC Value vs Time ({currentRangeDesc})
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<!-- Time Range Selector Buttons -->
					<div class="inline-flex rounded-md border border-[#1e293b] bg-[#070d1f] p-0.5">
						{#each timeRanges as tr (tr.id)}
							<button
								type="button"
								onclick={() => setTimeRange(tr.id)}
								class="rounded px-2.5 py-1 font-mono text-[11px] transition-all {selectedRange ===
								tr.id
									? 'border border-[#4cd7f6]/40 bg-[#1e293b] font-semibold text-[#4cd7f6] shadow-sm'
									: 'text-[#94a3b8] hover:bg-[#151b2d] hover:text-white'}"
							>
								{tr.label}
							</button>
						{/each}
					</div>

					<!-- Legend -->
					<div class="flex items-center gap-3 border-l border-[#1e293b] pl-1 font-mono text-xs">
						<div class="flex items-center gap-1.5 text-[#ff7886]">
							<span class="inline-block h-0 w-3.5 border-t border-dashed border-[#ff7886]"></span>
							<span class="text-[11px]">2000 ADC</span>
						</div>
						<div class="flex items-center gap-1.5 text-[#4cd7f6]">
							<span class="inline-block h-0.5 w-3 bg-[#4cd7f6]"></span>
							<span class="text-[11px]">MQ-2</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Telemetry Waveform Oscilloscope SVG -->
			<div class="w-full overflow-hidden rounded border border-[#1e293b]/60 bg-[#070d1f]/60 p-2">
				<svg
					role="application"
					aria-label="Interactive Gas Sensor ADC Telemetry Oscilloscope Chart"
					viewBox="0 0 {viewBoxWidth} {viewBoxHeight}"
					class="h-48 w-full cursor-crosshair select-none md:h-56"
					preserveAspectRatio="none"
					onmousemove={handleChartHover}
					onmouseleave={handleChartLeave}
				>
					<defs>
						<!-- Cyan area fill gradient -->
						<linearGradient id="adcGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="#4cd7f6" stop-opacity="0.32" />
							<stop offset="60%" stop-color="#4cd7f6" stop-opacity="0.08" />
							<stop offset="100%" stop-color="#4cd7f6" stop-opacity="0" />
						</linearGradient>

						<!-- Pulse glow filter for live point -->
						<filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="3" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					<!-- Horizontal Grid Lines & Y-axis Labels -->
					{#each [4000, 3000, 2000, 1000, 0] as gridVal (gridVal)}
						{@const yPos = scaleY(gridVal)}
						<g>
							<!-- Grid line -->
							<line
								x1={padLeft}
								y1={yPos}
								x2={viewBoxWidth - padRight}
								y2={yPos}
								stroke="#1e293b"
								stroke-width="1"
								stroke-opacity="0.6"
							/>
							<!-- Y label -->
							<text
								x={padLeft - 8}
								y={yPos + 3.5}
								text-anchor="end"
								font-family="JetBrains Mono, monospace"
								font-size="9"
								fill="#64748b"
							>
								{gridVal}
							</text>
						</g>
					{/each}

					<!-- Dashed Red Threshold Line at 2000 ADC -->
					<g>
						<line
							x1={padLeft}
							y1={thresholdY}
							x2={viewBoxWidth - padRight}
							y2={thresholdY}
							stroke="#ff7886"
							stroke-width="1.2"
							stroke-dasharray="4,4"
							stroke-opacity="0.75"
						/>
						<text
							x={viewBoxWidth - padRight - 4}
							y={thresholdY - 5}
							text-anchor="end"
							font-family="JetBrains Mono, monospace"
							font-size="9"
							fill="#ff7886"
							opacity="0.8"
						>
							Threshold (2000 ADC)
						</text>
					</g>

					<!-- Empty state message if no records in selected range -->
					{#if chartPoints.length === 0}
						<text
							x={viewBoxWidth / 2}
							y={viewBoxHeight / 2}
							text-anchor="middle"
							font-family="JetBrains Mono, monospace"
							font-size="11"
							fill="#64748b"
						>
							No telemetry recorded in this time range. Waiting for new packets...
						</text>
					{/if}

					<!-- Area Gradient Fill -->
					{#if chartPathData.area}
						<path d={chartPathData.area} fill="url(#adcGradient)" />
					{/if}

					<!-- Telemetry Trace Line -->
					{#if chartPathData.line}
						<path
							d={chartPathData.line}
							fill="none"
							stroke="#4cd7f6"
							stroke-width="1.75"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/if}

					<!-- Active Pulse Point on Latest Reading -->
					{#if chartPathData.lastX > 0}
						<g>
							<circle
								cx={chartPathData.lastX}
								cy={chartPathData.lastY}
								r="6"
								fill="#4cd7f6"
								opacity="0.3"
								class="animate-ping"
							/>
							<circle
								cx={chartPathData.lastX}
								cy={chartPathData.lastY}
								r="3.5"
								fill="#acedff"
								stroke="#03b5d3"
								stroke-width="1.5"
								filter="url(#pointGlow)"
							/>
						</g>
					{/if}

					<!-- Interactive Hover Crosshair & Tooltip -->
					{#if hoveredPoint}
						<!-- Vertical Crosshair Line -->
						<line
							x1={hoveredPoint.x}
							y1={padTop}
							x2={hoveredPoint.x}
							y2={padTop + chartH}
							stroke="#4cd7f6"
							stroke-width="1"
							stroke-dasharray="3,3"
							stroke-opacity="0.6"
						/>

						<!-- Target Crosshair Circle -->
						<circle
							cx={hoveredPoint.x}
							cy={hoveredPoint.y}
							r="5.5"
							fill="#070d1f"
							stroke={hoveredPoint.isWarning ? '#ff7886' : '#4cd7f6'}
							stroke-width="2"
						/>
						<circle
							cx={hoveredPoint.x}
							cy={hoveredPoint.y}
							r="2.5"
							fill={hoveredPoint.isWarning ? '#ff7886' : '#acedff'}
						/>

						<!-- Floating Telemetry Tooltip Box -->
						{@const boxW = 140}
						{@const boxH = 48}
						{@const boxX =
							hoveredPoint.x + boxW + 10 > viewBoxWidth - padRight
								? hoveredPoint.x - boxW - 10
								: hoveredPoint.x + 10}
						{@const boxY = Math.max(
							padTop + 2,
							Math.min(hoveredPoint.y - boxH / 2, padTop + chartH - boxH - 2)
						)}

						<g transform="translate({boxX}, {boxY})">
							<!-- Box Background -->
							<rect
								width={boxW}
								height={boxH}
								rx="4"
								fill="#0f172a"
								stroke={hoveredPoint.isWarning ? '#f43f5e' : '#334155'}
								stroke-width="1"
								stroke-opacity="0.9"
							/>

							<!-- Time Label -->
							<text
								x="8"
								y="14"
								fill="#94a3b8"
								font-family="JetBrains Mono, monospace"
								font-size="9"
							>
								{hoveredPoint.time}
							</text>

							<!-- ADC Readout -->
							<text
								x="8"
								y="30"
								fill={hoveredPoint.isWarning ? '#ff7886' : '#ffffff'}
								font-family="JetBrains Mono, monospace"
								font-size="12"
								font-weight="bold"
							>
								{hoveredPoint.adc} ADC
							</text>

							<!-- Status Pill -->
							<text
								x={boxW - 8}
								y="30"
								text-anchor="end"
								fill={hoveredPoint.isWarning ? '#ff7886' : '#4edea3'}
								font-family="JetBrains Mono, monospace"
								font-size="9"
								font-weight="bold"
							>
								{hoveredPoint.isWarning ? 'ALERT' : 'OK'}
							</text>

							<!-- Percentage Label -->
							<text
								x="8"
								y="41"
								fill="#64748b"
								font-family="JetBrains Mono, monospace"
								font-size="8"
							>
								({hoveredPoint.percentage}% FS)
							</text>
						</g>
					{/if}

					<!-- X-axis Labels -->
					{#each displayedXLabels as xLabel (xLabel.x + xLabel.text)}
						<text
							x={xLabel.x}
							y={viewBoxHeight - 8}
							text-anchor="middle"
							font-family="JetBrains Mono, monospace"
							font-size="9"
							fill="#64748b"
						>
							{xLabel.text}
						</text>
					{/each}
				</svg>
			</div>
		</section>

		<!-- ── Bottom Card: Telemetry & Incident Log Table ────────── -->
		<section class="rounded-lg border border-[#1e293b] bg-[#0f172a] p-5 shadow-sm">
			<div class="mb-4">
				<h2 class="text-sm font-semibold tracking-tight text-white md:text-base">
					Incident & Telemetry Log
				</h2>
				<p class="mt-0.5 font-mono text-xs text-[#94a3b8]">
					Last {logs.length} recorded state transitions
				</p>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full text-left font-mono text-xs">
					<thead>
						<tr
							class="border-b border-[#1e293b] text-[10px] tracking-wider text-[#64748b] uppercase"
						>
							<th class="px-3 py-2.5">Time</th>
							<th class="px-3 py-2.5">Gas Value</th>
							<th class="px-3 py-2.5 text-right">Event Status</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[#1e293b]/50">
						{#if logs.length === 0}
							<tr>
								<td colspan="3" class="py-6 text-center text-[#64748b]">
									Waiting for first telemetry packet from ESP32...
								</td>
							</tr>
						{:else}
							{#each logs as item (item.id)}
								{@const itemWarning = item.status === 'PERINGATAN' || item.adcValue >= 2000}
								<tr class="transition-colors hover:bg-[#151b2d]/50">
									<td class="px-3 py-2.5 whitespace-nowrap text-[#94a3b8]">
										{formatTableTime(item.createdAt)}
									</td>
									<td class="px-3 py-2.5 whitespace-nowrap">
										<span class="font-semibold {itemWarning ? 'text-[#ff7886]' : 'text-white'}">
											{item.adcValue} ADC
										</span>
										<span class="ml-1 text-[#64748b]">
											({calcPercentage(item.adcValue)}%)
										</span>
									</td>
									<td class="px-3 py-2.5 text-right whitespace-nowrap">
										{#if itemWarning}
											<span
												class="inline-block rounded border border-[#f43f5e]/50 bg-[#881337]/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#ff7886] uppercase"
											>
												WARNING
											</span>
										{:else}
											<span
												class="text-[11px] font-semibold tracking-wider text-[#4edea3] uppercase"
											>
												NORMAL
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</main>
