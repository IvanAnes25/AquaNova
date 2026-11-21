# Owner guide

## Process orders

Open the single **Orders** inbox. Tabs show **Needs action**, **Preparing**, **Ready**, **Completed**, and **Cancelled** counts; Needs action is ordered oldest first. Review the customer, fulfillment, items, and payment method before using the primary next action.

- **GCash:** open the proof and compare the amount and reference. Approve only after confirming the payment. If it does not match, reject it with a clear reason so the customer can submit corrected proof.
- **Cash on delivery:** confirm the cash order, prepare it, mark it ready/with the delivery person, then use **Delivered and paid** after handoff.
- **Pickup cash:** confirm the order, prepare it, mark it ready, then use **Handed over and paid** when the customer collects.
- Use **Next order** to move through the current tab. Once an order leaves that tab, the inbox selects another order automatically. Pickup orders show the pickup location, not a delivery address.
- Confirm that stock changes and order history are correct before moving to the next order. There is no packing-slip or order-email generator in the current app.

Order status and payment status are separate. GCash approval marks payment Paid, moves the order to Preparing, deducts stock once, records the stock movement, and notifies the customer.

## Products and inventory

Use **Products** to add catalog items and upload, replace, or remove a JPEG, PNG, or WebP product image. In **Inventory**, sold-out and lower-stock products appear first by default; choose a product, enter a reason, and save the stock movement. The reason **Other** and large changes require a note. In **Settings**, configure the large-change threshold (default 20 units); a change is large at the smaller of this threshold or 50% of the product's pre-change stock. Large changes require confirmation. Every owner movement is archived; filter the archive by product, type, reason, date range, or large changes only, export the filtered CSV, or open a product's movement history. Do not make manual database stock edits.

## Settings and reports

In **Settings**, set each weekday's opening and closing times in Asia/Manila time, or mark that day closed. Closing must be later than opening. The manual Open/Closed switch takes precedence over the weekday schedule until you select **Follow weekday hours**. **Accept orders when closed** is on by default; when enabled, checkout accepts orders and displays a closed-shop notice, and customers are told the order will be processed when the shop opens. Turn it off to block checkout while retaining the cart. The public Home page and header show the server-computed status, and the visit section shows the configured hours.

You can also update the delivery fee, GCash recipient name/number and QR, and enable or disable GCash, delivery COD, and pickup cash. Verify checkout only offers enabled methods. Use **Reports** to select Week, Month, or Year; review the period before exporting CSV or printing.

## Notifications and problems

Open the bell or **Notifications** to review important events: orders placed, payment proofs submitted, approvals/rejections, order confirmations and status changes, cancellations (including automatic cancellations), and low-stock alerts. Messages are grouped by order; unrelated messages appear under **Other**. You can mark one message or a whole group read, use **Mark all as read**, and delete read messages per group or with **Delete all read**. Unread messages cannot be deleted. Deletion is a soft delete, and the badge counts unread messages rather than groups. If an order, proof, stock figure, payment setting, or report looks wrong, stop processing it and contact the site administrator. Do not share passwords, reset links, private configuration, or customer data in public messages.
