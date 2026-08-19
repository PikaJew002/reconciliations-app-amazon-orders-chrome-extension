# Amazon Order Scraper

A Chrome extension that scrapes Amazon order history from the **Your Orders** summary page, then visits each order’s detail page to collect line items, payment info, and shipment data.

Scraped results can be reviewed in the popup as JSON, or sent to [Reconciliations](https://reconciliations.laravel.cloud) (Spendable) after connecting an account.

## How it works

1. Open [Your Orders](https://www.amazon.com/gp/css/order-history) on amazon.com while signed in.
2. Click the extension icon and choose **Scrape Current Page**.
3. The content script reads every order card on that summary page (order number, date, total, status, and the “order details” URL).
4. A background tab then opens each detail URL in turn, waits for Amazon’s page to finish rendering, and scrapes:
   - Order number and date
   - Payment method
   - Charge summary (subtotal, shipping, tax, grand total, and similar line items)
   - Shipments, including status and purchased items (title, ASIN, URL, quantity, unit price, seller, return eligibility)
5. The popup shows the combined JSON and a count of orders scraped.

Detail pages are loaded one at a time in a hidden tab, with a short random delay between visits, then that tab is closed.

## Requirements

- Google Chrome (Manifest V3)
- An Amazon.com account, signed in
- The active tab must be `https://www.amazon.com/gp/css/order-history`

The extension only runs on `https://www.amazon.com/*`. It does not paginate through older order history on its own; it scrapes whatever orders are currently visible on the summary page.

## Load the extension

1. Clone this repository.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this directory.

## Usage

### Scrape orders

1. Go to [Your Orders](https://www.amazon.com/gp/css/order-history).
2. Open the extension popup and click **Scrape Current Page**.
3. Wait until the status reports how many orders were scraped. JSON output appears in the popup.

### Optional: send to Spendable

1. Click **Connect to Reconciliations** and complete the sign-in flow.
2. After a successful scrape, click **Send to Spendable** to POST the payload to Reconciliations.

The connection token is stored locally in Chrome storage for this install.
