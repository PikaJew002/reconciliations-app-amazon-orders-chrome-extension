function scrapeAmazonDetails() {
	return {
		page: 'details',
		url: window.location.href,
		scrapedAt: new Date().toISOString(),

		orderNumber: getOrderNumber(),
		orderDate: getOrderDate(),

		paymentMethod: getPaymentMethod(),

		summary: getOrderSummary(),

		shipments: getShipments(),
	};
}

function getOrderNumber() {
	try {
		const url = new URL(window.location.href);
		const orderId = url.searchParams.get('orderID');

		if (orderId) {
			return orderId;
		}
	} catch {
		// Fall through to DOM lookup.
	}

	const element = document.querySelector('[data-component="orderId"]');

	if (element) {
		const match = element.textContent.match(/\b\d{3}-\d{7}-\d{7}\b/);

		if (match) {
			return match[0];
		}
	}

	return null;
}

function getOrderDate() {
	return getText('[data-component="orderDate"]');
}

function getPaymentMethod() {
	const component = document.querySelector(
		'[data-component="viewPaymentPlanSummaryWidget"]',
	);

	if (!component) {
		return null;
	}

	return (
		component
			.querySelector(
				'.pmts-payments-instrument-detail-box-paystationpaymentmethod',
			)
			?.textContent.replace(/\s+/g, ' ')
			.trim() ?? null
	);
}

function getOrderSummary() {
	const component = document.querySelector('[data-component="chargeSummary"]');

	if (!component) {
		return null;
	}

	const summary = {};

	const rows = component.querySelectorAll('.od-line-item-row');

	for (const row of rows) {
		const label = row
			.querySelector('.od-line-item-row-label')
			?.textContent.trim();

		const value = row
			.querySelector('.od-line-item-row-content')
			?.textContent.trim();

		if (!label) {
			continue;
		}

		summary[normalizeSummaryLabel(label)] = parseMoney(value);
	}

	return summary;
}

function normalizeSummaryLabel(label) {
	return label
		.replace(/:$/, '')
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '');
}

function parseMoney(value) {
	if (!value) {
		return null;
	}

	const number = Number.parseFloat(value.replace(/[$,]/g, '').trim());

	return Number.isFinite(number) ? number : null;
}

function getShipments() {
	const shipmentsRoot = document.querySelector('[data-component="shipments"]');

	if (!shipmentsRoot) {
		return [];
	}

	const shipmentBoxes = shipmentsRoot.querySelectorAll('.a-box-group > .a-box');

	const shipmentElements = shipmentBoxes.length
		? shipmentBoxes
		: [shipmentsRoot];

	return Array.from(shipmentElements).map(getShipment);
}

function getShipment(shipmentElement) {
	return {
		status: getShipmentStatus(shipmentElement),
		items: getShipmentItems(shipmentElement),
	};
}

function getShipmentItems(shipmentElement) {
	return Array.from(
		shipmentElement.querySelectorAll(
			'[data-component="purchasedItems"] [data-component="itemTitle"]',
		),
	).map((titleElement) => {
		return getItem(
			titleElement.closest('.a-fixed-left-grid') ?? titleElement,
		);
	});
}

function getShipmentStatus(shipmentElement) {
	const statusComponent = shipmentElement.querySelector(
		'[data-component="shipmentStatus"]',
	);

	if (!statusComponent) {
		return null;
	}

	return (
		statusComponent
			.querySelector('.od-status-message')
			?.textContent.replace(/\s+/g, ' ')
			.trim() ?? null
	);
}

function getItem(itemElement) {
	const titleElement = itemElement.querySelector(
		'[data-component="itemTitle"] a',
	);

	const imageElement = itemElement.querySelector(
		'[data-component="itemImage"] a[href*="/dp/"]',
	);

	const productUrl = titleElement?.href ?? imageElement?.href ?? null;

	return {
		title: titleElement?.textContent.replace(/\s+/g, ' ').trim() ?? null,

		asin: extractAsin(productUrl),

		url: productUrl ? new URL(productUrl, window.location.origin).href : null,

		quantity: getItemQuantity(itemElement),

		unitPrice: getItemPrice(itemElement),

		seller: getSeller(itemElement),

		returnEligibility: getTextFrom(
			itemElement,
			'[data-component="itemReturnEligibility"]',
		),
	};
}

function getItemQuantity(itemElement) {
	const quantityText =
		itemElement.querySelector('[data-component="itemImage"] .od-item-view-qty')
			?.textContent ??
		itemElement.querySelector('[data-component="quantity"]')?.textContent;

	const match = quantityText?.match(/\d+/);

	if (!match) {
		return 1;
	}

	const quantity = Number.parseInt(match[0], 10);

	return Number.isFinite(quantity) ? quantity : 1;
}

function getItemPrice(itemElement) {
	const priceElement = itemElement.querySelector(
		'[data-component="unitPrice"] .a-offscreen',
	);

	return parseMoney(priceElement?.textContent);
}

function getSeller(itemElement) {
	const sellerComponent = itemElement.querySelector(
		'[data-component="orderedMerchant"]',
	);

	if (!sellerComponent) {
		return null;
	}

	return sellerComponent.textContent
		.replace(/^Sold by:\s*/i, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function getTextFrom(parent, selector) {
	return (
		parent.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ??
		null
	);
}

function getText(selector) {
	return (
		document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ??
		null
	);
}

function extractAsin(url) {
	if (!url) {
		return null;
	}

	const match = url.match(/\/dp\/([A-Z0-9]{10})/i);

	return match ? match[1] : null;
}
