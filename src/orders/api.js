const API_BASE = 'https://reconciliations.laravel.cloud';

export async function getReconciliationsToken() {
	const { reconciliationsToken } = await chrome.storage.local.get(
		'reconciliationsToken',
	);

	return reconciliationsToken ?? null;
}

export async function postAmazonImport(token, payload) {
	const response = await fetch(`${API_BASE}/api/amazon/import`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(
			`Import failed (${response.status}): ${await readErrorBody(response)}`,
		);
	}

	return response;
}

export async function fetchOrderStatuses(token, orderNumbers) {
	const response = await fetch(`${API_BASE}/api/amazon/orders/status`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ orderNumbers }),
	});

	if (!response.ok) {
		throw new Error(
			`Status check failed (${response.status}): ${await readErrorBody(response)}`,
		);
	}

	return parseStatusResponse(await response.json());
}

function parseStatusResponse(data) {
	if (Array.isArray(data)) {
		return data.map(normalizeStatusRow).filter(Boolean);
	}

	if (Array.isArray(data?.orders)) {
		return data.orders.map(normalizeStatusRow).filter(Boolean);
	}

	if (data?.orders && typeof data.orders === 'object') {
		return Object.entries(data.orders)
			.map(([orderNumber, value]) => {
				if (typeof value === 'string') {
					return normalizeStatusRow({
						orderNumber,
						status: value,
					});
				}

				return normalizeStatusRow({
					orderNumber,
					...value,
				});
			})
			.filter(Boolean);
	}

	return [];
}

function normalizeStatusRow(row) {
	if (!row) {
		return null;
	}

	const orderNumber = row.orderNumber ?? row.order_number ?? row.id ?? null;
	const status = normalizeStatus(row.status);

	if (!orderNumber || !status) {
		return null;
	}

	return {
		orderNumber,
		status,
		error: row.error ?? row.message ?? null,
	};
}

function normalizeStatus(status) {
	const value = String(status ?? '').toLowerCase();

	if (
		['success', 'succeeded', 'completed', 'complete', 'imported', 'ok'].includes(
			value,
		)
	) {
		return 'success';
	}

	if (['failure', 'failed', 'error', 'rejected'].includes(value)) {
		return 'failure';
	}

	if (
		['pending', 'processing', 'queued', 'running', 'in_progress'].includes(
			value,
		)
	) {
		return 'pending';
	}

	return null;
}

async function readErrorBody(response) {
	const text = await response.text();

	return text || response.statusText;
}
