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

Use **Products** to add catalog items and upload, replace, or remove a JPEG, PNG, or WebP product image. In **Inventory**, sold-out and lower-stock products appear first by default; choose a product, enter a required reason and optional note, and save the stock movement. Changes of 50 units or more require confirmation and are recorded in the large-change archive. Check the movement history after saving; do not make manual database stock edits.

## Settings and reports

In **Settings**, update the delivery fee, GCash recipient name/number and QR, and enable or disable GCash, delivery COD, and pickup cash. Verify checkout only offers enabled methods. Use **Reports** to select Week, Month, or Year; review the period before exporting CSV or printing.

## Notifications and problems

Open the bell or **Notifications** to review new orders, GCash proofs, order updates, low-stock alerts, and payment reminders. If an order, proof, stock figure, payment setting, or report looks wrong, stop processing it and contact the site administrator. Do not share passwords, reset links, private configuration, or customer data in public messages.
