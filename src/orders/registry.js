export async function getOrderRegistry() {
	const { orderRegistry } = await chrome.storage.local.get('orderRegistry');

	return orderRegistry ?? {};
}

export async function setOrderRegistry(orderRegistry) {
	await chrome.storage.local.set({ orderRegistry });
}

export async function markOrdersPending(orders) {
	const registry = await getOrderRegistry();
	const submittedAt = new Date().toISOString();

	for (const order of orders) {
		if (!order.orderNumber) {
			continue;
		}

		const existing = registry[order.orderNumber] ?? {};

		registry[order.orderNumber] = {
			...existing,
			status: 'pending',
			submittedAt,
			settledAt: null,
			orderDate: order.orderDate ?? existing.orderDate ?? null,
			detailUrl: order.detailUrl ?? existing.detailUrl ?? null,
			error: null,
		};
	}

	await setOrderRegistry(registry);

	return registry;
}

export function classifySummaryOrders(registry, orders) {
	const catalogued = [];
	const pending = [];
	const failed = [];
	const toScrape = [];

	for (const order of orders) {
		const row = order.orderNumber ? registry[order.orderNumber] : null;

		if (!row) {
			toScrape.push(order);
			continue;
		}

		if (row.status === 'success') {
			catalogued.push(order);
			continue;
		}

		if (row.status === 'pending') {
			pending.push(order);
			continue;
		}

		failed.push(order);
		toScrape.push(order);
	}

	return {
		catalogued,
		pending,
		failed,
		toScrape,
	};
}

export function getCoverage(registry) {
	const successes = Object.values(registry).filter(
		(row) => row.status === 'success',
	);

	if (!successes.length) {
		return {
			count: 0,
			oldestOrderDate: null,
			newestOrderDate: null,
			lastSettledAt: null,
		};
	}

	const byDate = [...successes].sort((left, right) => {
		return (Date.parse(left.orderDate) || 0) - (Date.parse(right.orderDate) || 0);
	});

	const lastSettledAt = successes.reduce((latest, row) => {
		if (!row.settledAt) {
			return latest;
		}

		return !latest || row.settledAt > latest ? row.settledAt : latest;
	}, null);

	return {
		count: successes.length,
		oldestOrderDate: byDate[0].orderDate ?? null,
		newestOrderDate: byDate[byDate.length - 1].orderDate ?? null,
		lastSettledAt,
	};
}

export function getFailedOrders(registry) {
	return Object.entries(registry)
		.filter(([, row]) => row.status === 'failure')
		.map(([orderNumber, row]) => ({
			orderNumber,
			...row,
		}));
}

export function buildRegistryState(registry) {
	return {
		coverage: getCoverage(registry),
		failed: getFailedOrders(registry),
		pendingOrderNumbers: Object.entries(registry)
			.filter(([, row]) => row.status === 'pending')
			.map(([orderNumber]) => orderNumber),
	};
}
