const scrapeButton = document.querySelector('#scrape');
const sendToSpendableButton = document.querySelector('#send-to-spendable');
const clearCachedOrdersButton = document.querySelector('#clear-cached-orders');
const retryFailedButton = document.querySelector('#retry-failed');
const statusElement = document.querySelector('#status');
const coverageElement = document.querySelector('#coverage');
const failedSection = document.querySelector('#failed-section');
const failedList = document.querySelector('#failed-list');
const outputElement = document.querySelector('#output');
const connectButton = document.querySelector('#connect');

let orders = {};
let connected = false;

if (
	!scrapeButton ||
	!sendToSpendableButton ||
	!clearCachedOrdersButton ||
	!retryFailedButton ||
	!statusElement ||
	!coverageElement ||
	!failedSection ||
	!failedList ||
	!outputElement ||
	!connectButton
) {
	throw new Error('Amazon Order Scraper popup is missing required elements.');
}

(async () => {
	const { reconciliationsToken } = await chrome.storage.local.get(
		'reconciliationsToken',
	);

	if (reconciliationsToken) {
		connected = true;
		connectButton.style.display = 'none';
		statusElement.textContent = 'Connected to Spendable.';
	}

	try {
		const state = await sendRuntimeMessage({ type: 'RECONCILE' });

		renderRegistryState(state);

		if (state.pendingOrderNumbers?.length) {
			waitForSettlement(state.pendingOrderNumbers).catch((error) => {
				console.error(error);
			});
		}
	} catch (error) {
		console.error(error);
	}
})();

scrapeButton.addEventListener('click', async () => {
	setBusy(true);
	statusElement.textContent = 'Starting scrape...';
	outputElement.textContent = '';
	sendToSpendableButton.style.display = 'none';

	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});

		if (!tab?.id) {
			throw new Error('Could not determine the active tab.');
		}

		if (!isAmazonOrdersPage(tab.url)) {
			throw new Error(
				'The current tab does not appear to be an Amazon Your Orders page.',
			);
		}

		statusElement.textContent = 'Scraping orders. This may take a while...';

		const response = await sendRuntimeMessage({
			type: 'START_SCRAPE',
			tabId: tab.id,
		});

		orders = response.data;
		outputElement.textContent = JSON.stringify(response.data);
		statusElement.textContent = formatScrapeStats(response.data.stats);

		const scrapedSuccessfully = (response.data.details ?? []).some(
			(detail) => detail.success,
		);

		if (connected && scrapedSuccessfully) {
			sendToSpendableButton.style.display = 'block';
		}

		renderRegistryState(await sendRuntimeMessage({ type: 'RECONCILE' }));
	} catch (error) {
		console.error(error);

		statusElement.textContent = 'Error';
		outputElement.textContent = error.message;
	} finally {
		setBusy(false);
	}
});

connectButton.addEventListener('click', async () => {
	connectButton.disabled = true;
	statusElement.textContent = 'Connecting...';

	try {
		await connectToSpendable();

		connected = true;
		connectButton.style.display = 'none';
		statusElement.textContent = 'Connected to Spendable.';

		renderRegistryState(await sendRuntimeMessage({ type: 'RECONCILE' }));
	} catch (error) {
		console.error(error);

		statusElement.textContent = `Connection failed: ${error.message}`;
	} finally {
		connectButton.disabled = false;
	}
});

sendToSpendableButton.addEventListener('click', async () => {
	setBusy(true);
	statusElement.textContent = 'Sending to Spendable...';

	try {
		const result = await sendRuntimeMessage({
			type: 'SUBMIT_IMPORT',
			data: orders,
		});

		sendToSpendableButton.style.display = 'none';
		renderRegistryState(result);
		await waitForSettlement(result.submittedOrderNumbers);
	} catch (error) {
		console.error(error);

		statusElement.textContent = `Send failed: ${error.message}`;
	} finally {
		setBusy(false);
	}
});

clearCachedOrdersButton.addEventListener('click', async () => {
	setBusy(true);
	statusElement.textContent = 'Clearing cached orders...';

	try {
		const state = await sendRuntimeMessage({
			type: 'CLEAR_CACHED_ORDERS',
		});

		orders = {};
		outputElement.textContent = '';
		sendToSpendableButton.style.display = 'none';
		renderRegistryState(state);
		statusElement.textContent = 'Cleared cached orders.';
	} catch (error) {
		console.error(error);

		statusElement.textContent = `Clear failed: ${error.message}`;
	} finally {
		setBusy(false);
	}
});

retryFailedButton.addEventListener('click', async () => {
	setBusy(true);
	statusElement.textContent = 'Retrying failed orders...';
	sendToSpendableButton.style.display = 'none';

	try {
		const result = await sendRuntimeMessage({
			type: 'RETRY_FAILED',
		});

		if (result.data) {
			orders = result.data;
			outputElement.textContent = JSON.stringify(result.data);
		}

		renderRegistryState(result);

		if (result.submittedOrderNumbers?.length) {
			await waitForSettlement(result.submittedOrderNumbers);
		} else {
			statusElement.textContent = 'Retry scrape failed. Nothing was submitted.';
		}
	} catch (error) {
		console.error(error);

		statusElement.textContent = `Retry failed: ${error.message}`;
	} finally {
		setBusy(false);
	}
});

function renderRegistryState(state) {
	if (!state) {
		return;
	}

	coverageElement.textContent = formatCoverage(
		state.coverage,
		state.pendingOrderNumbers?.length ?? 0,
	);

	const failed = state.failed ?? [];

	if (!failed.length) {
		failedSection.style.display = 'none';
		failedList.replaceChildren();

		return;
	}

	failedSection.style.display = 'block';
	retryFailedButton.style.display = connected ? 'block' : 'none';
	failedList.replaceChildren();

	for (const row of failed) {
		const item = document.createElement('li');
		item.textContent = row.error
			? `${row.orderNumber} — ${row.error}`
			: row.orderNumber;
		failedList.append(item);
	}
}

async function waitForSettlement(submittedOrderNumbers) {
	if (!submittedOrderNumbers?.length) {
		return;
	}

	statusElement.textContent = `Importing ${submittedOrderNumbers.length} order${submittedOrderNumbers.length === 1 ? '' : 's'}...`;

	const deadline = Date.now() + 2 * 60 * 1000;

	while (Date.now() < deadline) {
		await sleep(2000);

		const state = await sendRuntimeMessage({ type: 'RECONCILE' });

		renderRegistryState(state);

		const stillPending = submittedOrderNumbers.filter((orderNumber) =>
			(state.pendingOrderNumbers ?? []).includes(orderNumber),
		);

		if (!stillPending.length) {
			const failedAgain = (state.failed ?? []).filter((row) =>
				submittedOrderNumbers.includes(row.orderNumber),
			);

			if (failedAgain.length) {
				statusElement.textContent = `${failedAgain.length} import${failedAgain.length === 1 ? '' : 's'} failed.`;
			} else {
				statusElement.textContent = `Imported ${submittedOrderNumbers.length} order${submittedOrderNumbers.length === 1 ? '' : 's'}.`;
			}

			return;
		}

		statusElement.textContent = `Importing ${stillPending.length} order${stillPending.length === 1 ? '' : 's'}...`;
	}

	statusElement.textContent =
		'Still importing. Status will update the next time you open the popup.';
}

function formatScrapeStats(stats) {
	if (!stats) {
		return 'Scrape complete.';
	}

	const parts = [`${stats.onPage} on this page`];

	if (stats.catalogued) {
		parts.push(`${stats.catalogued} catalogued`);
	}

	if (stats.pending) {
		parts.push(`${stats.pending} still importing`);
	}

	if (stats.failed) {
		parts.push(`${stats.failed} failed`);
	}

	parts.push(`scraped ${stats.scraped}`);

	return `${parts.join(', ')}.`;
}

function formatCoverage(coverage, pendingCount = 0) {
	const parts = [];

	if (coverage?.count) {
		let text = `${coverage.count} order${coverage.count === 1 ? '' : 's'} catalogued`;

		if (coverage.oldestOrderDate && coverage.newestOrderDate) {
			if (coverage.oldestOrderDate === coverage.newestOrderDate) {
				text += `, ${coverage.oldestOrderDate}`;
			} else {
				text += `, ${coverage.oldestOrderDate} – ${coverage.newestOrderDate}`;
			}
		}

		parts.push(text);
	}

	if (pendingCount) {
		parts.push(
			`${pendingCount} still importing`,
		);
	}

	return parts.length ? `${parts.join('. ')}.` : '';
}

function setBusy(busy) {
	scrapeButton.disabled = busy;
	sendToSpendableButton.disabled = busy;
	clearCachedOrdersButton.disabled = busy;
	retryFailedButton.disabled = busy;
	connectButton.disabled = busy;
}

function isAmazonOrdersPage(url) {
	if (!url) {
		return false;
	}

	const parsed = new URL(url);

	return (
		parsed.hostname === 'www.amazon.com' &&
		(parsed.pathname === '/gp/css/order-history' ||
			parsed.pathname === '/your-orders/orders')
	);
}

async function connectToSpendable() {
	const redirectUri = chrome.identity.getRedirectURL('auth');

	const authUrl = new URL(
		'https://reconciliations.laravel.cloud/extension/auth',
	);

	authUrl.searchParams.set('redirect_uri', redirectUri);

	const installId = await getOrCreateInstallId();
	authUrl.searchParams.set('client_id', installId);

	const responseUrl = await chrome.identity.launchWebAuthFlow({
		url: authUrl.toString(),
		interactive: true,
	});

	if (!responseUrl) {
		throw new Error('Authentication failed.');
	}

	const callbackUrl = new URL(responseUrl);

	const token = callbackUrl.searchParams.get('token');

	if (!token) {
		throw new Error('No authentication token was returned.');
	}

	await chrome.storage.local.set({
		reconciliationsToken: token,
	});

	return token;
}

async function getOrCreateInstallId() {
	const { installId } = await chrome.storage.local.get('installId');

	if (installId) {
		return installId;
	}

	const newInstallId = crypto.randomUUID();

	await chrome.storage.local.set({ installId: newInstallId });

	return newInstallId;
}

async function sendRuntimeMessage(message) {
	const response = await chrome.runtime.sendMessage(message);

	if (!response) {
		throw new Error('No response received from the extension.');
	}

	if (!response.success) {
		throw new Error(response.error || 'The extension request failed.');
	}

	return response;
}

function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
