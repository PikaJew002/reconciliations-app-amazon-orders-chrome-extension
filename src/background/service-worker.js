import { getReconciliationsToken, postAmazonImport } from '../orders/api.js';
import { reconcilePendingOrders } from '../orders/reconcile.js';
import {
	buildRegistryState,
	classifySummaryOrders,
	getFailedOrders,
	markOrdersPending,
} from '../orders/registry.js';

let scrapeJob = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleMessage(message)
		.then((result) => {
			sendResponse({
				success: true,
				...result,
			});
		})
		.catch((error) => {
			console.error(error);

			sendResponse({
				success: false,
				error: error.message,
				stack: error.stack,
			});
		});

	return true;
});

async function handleMessage(message) {
	switch (message.type) {
		case 'START_SCRAPE':
			return {
				data: await startScrapeJob(message.tabId),
			};

		case 'SUBMIT_IMPORT':
			return submitImport(message.data);

		case 'RECONCILE':
			return getReconciledState();

		case 'RETRY_FAILED':
			return retryFailedOrders();

		default:
			throw new Error(`Unknown message type: ${message.type}`);
	}
}

async function getReconciledState() {
	const registry = await reconcilePendingOrders();

	return buildRegistryState(registry);
}

async function startScrapeJob(sourceTabId) {
	if (!sourceTabId) {
		throw new Error('No source tab ID was provided.');
	}

	const registry = await reconcilePendingOrders();

	const summaryResponse = await sendTabMessage(sourceTabId, {
		type: 'SCRAPE_SUMMARY',
	});

	if (!summaryResponse?.success) {
		throw new Error(
			summaryResponse?.error || 'Failed to scrape the summary page.',
		);
	}

	const summary = summaryResponse.data;
	const classified = classifySummaryOrders(registry, summary.orders);
	const detailUrls = uniqueDetailUrls(classified.toScrape);

	let details = [];

	if (detailUrls.length) {
		details = await withScrapeTab((tabId) => {
			return scrapeDetailPages(tabId, summary, detailUrls);
		});
	}

	return {
		scrapedAt: new Date().toISOString(),
		summary,
		details,
		stats: {
			onPage: summary.orders.length,
			catalogued: classified.catalogued.length,
			pending: classified.pending.length,
			failed: classified.failed.length,
			scraped: detailUrls.length,
		},
	};
}

async function retryFailedOrders() {
	const registry = await reconcilePendingOrders();
	const failed = getFailedOrders(registry).filter((row) => row.detailUrl);

	if (!failed.length) {
		throw new Error('No failed orders with a details URL to retry.');
	}

	const summary = {
		page: 'retry',
		orders: failed.map((row) => ({
			orderNumber: row.orderNumber,
			orderDate: row.orderDate,
			detailUrl: row.detailUrl,
		})),
	};

	const detailUrls = uniqueDetailUrls(summary.orders);

	const details = await withScrapeTab((tabId) => {
		return scrapeDetailPages(tabId, summary, detailUrls);
	});

	const payload = {
		scrapedAt: new Date().toISOString(),
		summary,
		details,
	};

	const successful = details.filter((detail) => detail.success);

	if (!successful.length) {
		return {
			data: payload,
			submittedOrderNumbers: [],
			...buildRegistryState(registry),
		};
	}

	const submitResult = await submitImport(payload);

	return {
		data: payload,
		...submitResult,
	};
}

async function submitImport(payload) {
	const token = await getReconciliationsToken();

	if (!token) {
		throw new Error('Not connected to Reconciliations.');
	}

	const details = (payload.details ?? []).filter((detail) => detail.success);

	if (!details.length) {
		throw new Error('No scraped order details to send.');
	}

	const summaryOrders = (payload.summary?.orders ?? []).filter((order) =>
		details.some((detail) => detail.orderNumber === order.orderNumber),
	);

	const submitPayload = {
		scrapedAt: payload.scrapedAt ?? new Date().toISOString(),
		summary: {
			...payload.summary,
			orders: summaryOrders,
			orderCount: details.length,
		},
		details,
	};

	await postAmazonImport(token, submitPayload);

	const pendingRows = details.map((detail) => {
		const summaryOrder = summaryOrders.find(
			(order) => order.orderNumber === detail.orderNumber,
		);

		return {
			orderNumber: detail.orderNumber,
			orderDate: detail.data?.orderDate ?? summaryOrder?.orderDate ?? null,
			detailUrl: detail.url ?? summaryOrder?.detailUrl ?? null,
		};
	});

	const registry = await markOrdersPending(pendingRows);

	return {
		submittedOrderNumbers: pendingRows
			.map((row) => row.orderNumber)
			.filter(Boolean),
		...buildRegistryState(registry),
	};
}

async function withScrapeTab(work) {
	if (scrapeJob) {
		throw new Error('A scrape is already in progress.');
	}

	scrapeJob = {
		scrapeTabId: null,
		startedAt: new Date().toISOString(),
	};

	try {
		const scrapeTab = await chrome.tabs.create({
			url: 'about:blank',
			active: false,
		});

		scrapeJob.scrapeTabId = scrapeTab.id;

		return await work(scrapeTab.id);
	} finally {
		if (scrapeJob?.scrapeTabId) {
			try {
				await chrome.tabs.remove(scrapeJob.scrapeTabId);
			} catch {
				// The tab may already have been closed.
			}
		}

		scrapeJob = null;
	}
}

async function scrapeDetailPages(tabId, summary, detailUrls) {
	const details = [];

	for (let index = 0; index < detailUrls.length; index++) {
		const detailUrl = detailUrls[index];

		console.log(
			`Scraping detail page ${index + 1}/${detailUrls.length}:`,
			detailUrl,
		);

		try {
			await navigateTabAndWaitForLoad(tabId, detailUrl);
			await waitForDetailsPage(tabId);

			const response = await sendTabMessage(tabId, {
				type: 'SCRAPE_DETAILS',
			});

			if (!response?.success) {
				details.push({
					success: false,
					orderNumber: getOrderNumberFromSummary(summary, detailUrl),
					url: detailUrl,
					error: response?.error || 'Failed to scrape detail page.',
				});

				continue;
			}

			const data = response.data;

			details.push({
				success: true,
				orderNumber: data.orderNumber,
				url: detailUrl,
				data,
			});
		} catch (error) {
			console.error(`Failed to scrape detail page: ${detailUrl}`, error);

			details.push({
				success: false,
				orderNumber: getOrderNumberFromSummary(summary, detailUrl),
				url: detailUrl,
				error: error.message,
			});
		}

		if (index < detailUrls.length - 1) {
			await sleep(randomDelay(750, 1750));
		}
	}

	return details;
}

function uniqueDetailUrls(orders) {
	return [
		...new Set(orders.map((order) => order.detailUrl).filter(Boolean)),
	];
}

function navigateTabAndWaitForLoad(tabId, url) {
	return new Promise((resolve, reject) => {
		let timeoutId = null;

		const cleanup = () => {
			chrome.tabs.onUpdated.removeListener(listener);

			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};

		const listener = (updatedTabId, changeInfo) => {
			if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
				return;
			}

			cleanup();

			resolve();
		};

		chrome.tabs.onUpdated.addListener(listener);

		timeoutId = setTimeout(() => {
			cleanup();

			reject(new Error(`Timed out waiting for Amazon page to load: ${url}`));
		}, 30000);

		chrome.tabs
			.update(tabId, {
				url,
			})
			.catch((error) => {
				cleanup();
				reject(error);
			});
	});
}

async function waitForDetailsPage(tabId) {
	const maxAttempts = 30;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const response = await sendTabMessage(tabId, {
				type: 'CHECK_DETAILS_READY',
			});

			if (response?.success && response.ready) {
				await sleep(500);

				return;
			}
		} catch {
			// The content script may not have been injected yet. Keep waiting.
		}

		await sleep(250);
	}

	throw new Error(
		'Timed out waiting for Amazon order details to become ready.',
	);
}

function sendTabMessage(tabId, message) {
	return new Promise((resolve, reject) => {
		chrome.tabs.sendMessage(tabId, message, (response) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));

				return;
			}

			resolve(response);
		});
	});
}

function getOrderNumberFromSummary(summary, detailUrl) {
	return (
		summary.orders.find((order) => order.detailUrl === detailUrl)
			?.orderNumber ?? null
	);
}

function randomDelay(minimum, maximum) {
	return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
