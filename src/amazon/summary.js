function scrapeAmazonSummary() {
	const cards = document.querySelectorAll('.order-card.js-order-card');

	return {
		page: 'summary',
		url: window.location.href,
		scrapedAt: new Date().toISOString(),
		orderCount: cards.length,

		orders: Array.from(cards).map(scrapeOrderCard),
	};
}

function scrapeOrderCard(card) {
	const detailUrl = getDetailUrl(card);

	return {
		orderNumber: getOrderNumber(card) ?? orderNumberFromDetailUrl(detailUrl),
		orderDate: getOrderDate(card),
		total: getOrderTotal(card),
		status: getOrderStatus(card),
		detailUrl,
	};
}

function getOrderNumber(card) {
	const element = card.querySelector('.yohtmlc-order-id');

	if (!element) {
		return null;
	}

	const match = element.textContent.match(/\b\d{3}-\d{7}-\d{7}\b/);

	return match ? match[0] : null;
}

function orderNumberFromDetailUrl(detailUrl) {
	if (!detailUrl) {
		return null;
	}

	try {
		return new URL(detailUrl).searchParams.get('orderID');
	} catch {
		return null;
	}
}

function getOrderDate(card) {
	return getOrderHeaderValue(card, 'Order placed');
}

function getOrderTotal(card) {
	return parseMoney(getOrderHeaderValue(card, 'Total'));
}

function getOrderHeaderValue(card, label) {
	const headerItems = card.querySelectorAll('.order-header__header-list-item');

	for (const item of headerItems) {
		const labelElement = item.querySelector('.a-size-mini');

		const itemLabel = labelElement?.textContent.trim();

		if (itemLabel?.toLowerCase() !== label.toLowerCase()) {
			continue;
		}

		const rows = item.querySelectorAll('.a-row');

		return rows[1]?.textContent.trim() ?? null;
	}

	return null;
}

function getOrderStatus(card) {
	const element = card.querySelector('.yohtmlc-shipment-status-primaryText');

	return element?.textContent.replace(/\s+/g, ' ').trim() ?? null;
}

function getDetailUrl(card) {
	const links = card.querySelectorAll('a');

	for (const link of links) {
		const url = new URL(link.href, window.location.origin);

		if (
			url.hostname === 'www.amazon.com' &&
			url.pathname === '/your-orders/order-details' &&
			url.searchParams.has('orderID')
		) {
			return url.href;
		}
	}

	return null;
}

function parseMoney(value) {
	if (!value) {
		return null;
	}

	const number = Number.parseFloat(value.replace(/[$,]/g, '').trim());

	return Number.isFinite(number) ? number : null;
}
