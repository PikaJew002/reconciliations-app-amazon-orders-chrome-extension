# Amazon Order Scraper

A Chrome extension that scrapes Amazon order history from the **Your Orders** summary page, then visits each order’s detail page to collect line items, payment info, and shipment data.

Scraped results can be reviewed in the popup as JSON, or sent to [Spendable](https://reconciliations.laravel.cloud/login) after connecting an account. Spendable imports those orders so they can be matched against card transactions.

This is a private, unpacked extension for local use. It is not published to the Chrome Web Store. Load it in Developer mode as described below.

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

If you are connected to Spendable, orders that already imported successfully are skipped on later scrapes. Orders still importing are also skipped. Failed imports are scraped again.

## Requirements

- Google Chrome (Manifest V3)
- An Amazon.com account, signed in
- The active tab must be `https://www.amazon.com/gp/css/order-history` or `https://www.amazon.com/your-orders/orders`
- Optional: a [Spendable](https://reconciliations.laravel.cloud/login) account, to import scraped orders

The extension only runs on `https://www.amazon.com/*`. It does not paginate through older order history on its own; it scrapes whatever orders are currently visible on the summary page.

## Load the extension

This project is meant to run locally as an unpacked extension. There is no packaged release or store listing.

1. Clone this repository.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this directory.

Chrome will keep the extension available on this machine until you remove it. After code changes, click **Reload** on the extension card at `chrome://extensions`.

## Usage

### Scrape orders

1. Go to [Your Orders](https://www.amazon.com/gp/css/order-history).
2. Open the extension popup and click **Scrape Current Page**.
3. Wait until the status reports how many orders were scraped. JSON output appears in the popup.

Status includes how many orders were on the page, already catalogued in Spendable, still importing, failed, and newly scraped.

### Send to Spendable

Spendable is hosted at [reconciliations.laravel.cloud](https://reconciliations.laravel.cloud/login). Connecting an account lets the extension POST scraped Amazon orders into Spendable and then poll until each import succeeds or fails.

1. Click **Connect to Spendable**. Chrome opens Spendable’s extension sign-in page (`/extension/auth`) with this install’s ID as the client. After you sign in, Spendable redirects back with a bearer token.
2. After a successful scrape, click **Send to Spendable**. Only orders whose detail pages scraped successfully are included.
3. The popup polls Spendable for up to two minutes and updates coverage as imports settle. If they are still pending, status continues the next time you open the popup.

The connection token and a per-install ID are stored locally in Chrome storage for this install. Host permission for `https://reconciliations.laravel.cloud/*` is required so the extension can call Spendable’s API.

#### What gets sent

The import payload is a JSON POST to `/api/amazon/import`:

- `scrapedAt` — when the scrape finished
- `summary` — order cards from the Your Orders page (order number, date, total, status, details URL), limited to orders that scraped successfully
- `details` — per-order data from each details page (payment method, charge summary, shipments and line items)

#### Import status

After submit, those orders are marked **pending** locally. The extension asks Spendable (`/api/amazon/orders/status`) whether each pending order succeeded or failed.

The popup shows:

- How many orders are catalogued, plus the oldest and newest order dates in that set
- How many are still importing
- Failed imports, with the error from Spendable when one is available

Pending imports older than 24 hours are treated as failed locally (“Import timed out after 24 hours.”).

#### Retry failed imports

When any imports have failed, the popup lists them and shows **Retry failed**. That re-scrapes those orders from their stored details URLs and submits them to Spendable again. Retry is available only while connected.

## License

This project is licensed under the [MIT License](LICENSE).
