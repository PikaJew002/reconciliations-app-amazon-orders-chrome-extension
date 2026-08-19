import { fetchOrderStatuses, getReconciliationsToken } from './api.js';
import { getOrderRegistry, setOrderRegistry } from './registry.js';

const STALE_PENDING_MS = 24 * 60 * 60 * 1000;

export async function reconcilePendingOrders() {
	const registry = await getOrderRegistry();

	markStalePendingAsFailed(registry);

	const pendingOrderNumbers = Object.entries(registry)
		.filter(([, row]) => row.status === 'pending')
		.map(([orderNumber]) => orderNumber);

	if (!pendingOrderNumbers.length) {
		await setOrderRegistry(registry);

		return registry;
	}

	const token = await getReconciliationsToken();

	if (!token) {
		await setOrderRegistry(registry);

		return registry;
	}

	try {
		const results = await fetchOrderStatuses(token, pendingOrderNumbers);

		applyStatusResults(registry, results);
	} catch (error) {
		console.error('Failed to reconcile order statuses:', error);
	}

	await setOrderRegistry(registry);

	return registry;
}

function markStalePendingAsFailed(registry) {
	const now = Date.now();

	for (const [orderNumber, row] of Object.entries(registry)) {
		if (row.status !== 'pending' || !row.submittedAt) {
			continue;
		}

		const submittedAt = Date.parse(row.submittedAt);

		if (!Number.isFinite(submittedAt) || now - submittedAt < STALE_PENDING_MS) {
			continue;
		}

		registry[orderNumber] = {
			...row,
			status: 'failure',
			settledAt: new Date().toISOString(),
			error: 'Import timed out after 24 hours.',
		};
	}
}

function applyStatusResults(registry, results) {
	const settledAt = new Date().toISOString();

	for (const result of results) {
		const existing = registry[result.orderNumber];

		if (!existing || existing.status !== 'pending') {
			continue;
		}

		if (result.status === 'pending') {
			continue;
		}

		registry[result.orderNumber] = {
			...existing,
			status: result.status,
			settledAt,
			error: result.status === 'failure' ? result.error : null,
		};
	}
}
