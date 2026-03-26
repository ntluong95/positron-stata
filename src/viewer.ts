import { DataViewResponse } from './server-client';

function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatCell(value: unknown): string {
	if (value === null || value === undefined) {
		return '<span class="missing">.</span>';
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? String(value) : '<span class="missing">.</span>';
	}
	return escapeHtml(value);
}

export function renderDataViewerHtml(response: DataViewResponse, filter?: string): string {
	const headers = response.columns.map((column) => {
		const type = response.dtypes[column] || '';
		return `<th><div class="name">${escapeHtml(column)}</div><div class="type">${escapeHtml(type)}</div></th>`;
	}).join('');

	const rows = response.data.map((row, rowIndex) => {
		const observation = (response.index[rowIndex] ?? rowIndex) + 1;
		const cells = row.map(cell => `<td>${formatCell(cell)}</td>`).join('');
		return `<tr><th class="obs">${observation}</th>${cells}</tr>`;
	}).join('');

	const summary = response.total_rows > response.displayed_rows
		? `${response.displayed_rows} of ${response.total_rows} observations`
		: `${response.rows} observations`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Stata Data Viewer</title>
	<style>
		:root {
			color-scheme: light dark;
			--bg: #f7f6f1;
			--surface: #ffffff;
			--line: #d8d2c5;
			--text: #1f2428;
			--muted: #6b7280;
			--head: #ece7da;
			--accent: #0c6b70;
		}
		@media (prefers-color-scheme: dark) {
			:root {
				--bg: #121619;
				--surface: #1b2126;
				--line: #2f3941;
				--text: #e5e7eb;
				--muted: #94a3b8;
				--head: #20272d;
				--accent: #6ac5b8;
			}
		}
		body {
			margin: 0;
			padding: 24px;
			font-family: "SF Mono", "Menlo", "Consolas", monospace;
			background: linear-gradient(180deg, var(--bg), color-mix(in srgb, var(--bg) 60%, var(--surface)));
			color: var(--text);
		}
		.layout {
			display: grid;
			gap: 16px;
		}
		.summary {
			padding: 16px 18px;
			border: 1px solid var(--line);
			background: var(--surface);
			border-radius: 14px;
		}
		.summary h1 {
			margin: 0 0 8px;
			font-size: 18px;
		}
		.summary p {
			margin: 4px 0;
			color: var(--muted);
			font-size: 13px;
		}
		.table-wrap {
			overflow: auto;
			border: 1px solid var(--line);
			border-radius: 14px;
			background: var(--surface);
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
		}
		table {
			border-collapse: collapse;
			width: 100%;
			min-width: 720px;
		}
		thead th {
			position: sticky;
			top: 0;
			background: var(--head);
			z-index: 1;
		}
		th, td {
			padding: 10px 12px;
			border-bottom: 1px solid var(--line);
			vertical-align: top;
			text-align: left;
			font-size: 12px;
		}
		th.obs {
			background: var(--head);
			width: 76px;
			color: var(--muted);
		}
		.name {
			font-weight: 700;
			color: var(--text);
		}
		.type {
			margin-top: 2px;
			color: var(--accent);
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}
		.missing {
			color: var(--muted);
			font-style: italic;
		}
	</style>
</head>
<body>
	<div class="layout">
		<section class="summary">
			<h1>Stata Data Viewer</h1>
			<p>${escapeHtml(summary)}</p>
			<p>${escapeHtml(response.columns.length)} variables</p>
			${filter ? `<p>Filter: <strong>${escapeHtml(filter)}</strong></p>` : ''}
		</section>
		<section class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="obs">Obs</th>
						${headers}
					</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>
		</section>
	</div>
</body>
</html>`;
}
