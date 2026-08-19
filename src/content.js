chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	try {
		switch (message.type) {
			case 'SCRAPE_SUMMARY':
				sendResponse({
					success: true,
					data: scrapeAmazonSummary(),
				});
				break;

			case 'SCRAPE_DETAILS':
				sendResponse({
					success: true,
					data: scrapeAmazonDetails(),
				});
				break;

			case 'CHECK_DETAILS_READY':
				sendResponse({
					success: true,
					ready: isDetailsPageReady(),
				});
				break;

			default:
				sendResponse({
					success: false,
					error: `Unknown message type: ${message.type}`,
				});
		}
	} catch (error) {
		console.error('Amazon scraper error:', error);

		sendResponse({
			success: false,
			error: error.message,
			stack: error.stack,
		});
	}
});

function isDetailsPageReady() {
	return Boolean(
		document.querySelector('[data-component="orderId"]') &&
		document.querySelector('[data-component="chargeSummary"]') &&
		document.querySelector('[data-component="shipments"]'),
	);
}
