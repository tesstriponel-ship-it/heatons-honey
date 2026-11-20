# Heatons Honey website

The live version of the Heatons Honey design: shop, product pages, About, a basket that
remembers what people add, a collection day picker, and payment through **Square**.

When a customer presses **Pay**, the site asks Square for a checkout page for that exact
order, marked as a **pick-up order at the chosen day and time**. They pay on Square's page
(card, Apple Pay or Google Pay) and come back to a thank-you page. The order and its
collection time appear in Michael's Square account like any other order.

---

## What's in the folder

| | |
|---|---|
| `site/` | The website itself (the pages, images and scripts) |
| `site/shop.json` | **Prices, products and collection times. The one file you'll edit.** |
| `netlify/functions/checkout.js` | The small server function that talks to Square |
| `netlify.toml` | Tells Netlify where everything is |

---

## Setting it up (about 30 minutes)

### 1. Set the prices

Open `site/shop.json` in any text editor. For each product, change `"price": null` to the
price **in pence**. For example £8.50 is `850`:

```json
"price": 850,
```

Online ordering stays switched off until every product has a price.

While you're in there you can change the collection days and times. The `days` section lists
the start time of each one-hour slot:

```json
"days": {
  "saturday": ["10:00", "11:00", "12:00"],
  "sunday": ["10:00", "11:00"]
}
```

Add `"friday": ["16:00"]` to open a Friday slot, for example. `weeksAhead` is how far ahead
people can book.

### 2. Get the Square details

1. Go to **developer.squareup.com**, sign in with the Heatons Honey Square account.
2. Open **Applications** and create one, called something like *Heatons Honey website*.
3. In the app, find these three things:
   - **Sandbox access token** (for testing, on the Credentials page)
   - **Production access token** (for real payments, same page)
   - **Location ID** (on the Locations page; there's a sandbox one and a production one)

**Keep the access tokens secret.** Don't paste them into any file in this folder, an email
or a chat. They only go into Netlify, in step 4.

### 3. Put the site online with Netlify

Netlify's drag-and-drop upload only handles plain pages and leaves out the checkout function,
so use GitHub. No terminal needed:

1. Make a free account at **github.com**, create a new **private** repository (e.g.
   `heatons-honey`), choose **uploading an existing file**, and drag in the *contents* of this
   folder (`site`, `netlify`, `netlify.toml`, `README.md`). Commit.
2. Make a free account at **netlify.com** (sign in with GitHub), choose **Add new site →
   Import an existing project → GitHub**, and pick that repository. Netlify reads
   `netlify.toml`, so leave the build settings as they are and press **Deploy**.

From then on, any change you commit on GitHub (a new price, say) goes live by itself in a
minute or so.

(If you're comfortable with a terminal: `npm install -g netlify-cli`, then `netlify deploy
--prod` from inside this folder does the same thing.)

### 4. Add the Square details to Netlify

In Netlify go to **Site configuration → Environment variables** and add:

| Name | Value |
|---|---|
| `SQUARE_ACCESS_TOKEN` | the **Sandbox** access token (for now) |
| `SQUARE_LOCATION_ID` | the **Sandbox** location ID |
| `SQUARE_ENVIRONMENT` | `sandbox` |
| `COLLECTION_ADDRESS` | *optional:* the full collection address. It's printed on the customer's Square receipt, and kept off the public website. |

Then redeploy the site (**Deploys → Trigger deploy**) so it picks them up.

### 5. Test it

Place an order on the site. You'll land on Square's **sandbox** page, where no real money
moves. Pay with one of Square's sandbox test cards (Square's "Sandbox test values" page lists
them; Visa **4111 1111 1111 1111** with any future expiry date usually works). Check that:

- you come back to the Thank you page
- the order shows in the **sandbox** Square dashboard (open it from the Developer Console) as
  a pick-up order at the right day and time

### 6. Go live

Swap the three values in Netlify for the **Production** token, the **Production** location
ID and `production`, then redeploy. Place one small real order to check, and refund it from
the Square Dashboard.

### 7. Optional: your own web address

In Netlify, **Domain management** lets you buy or connect something like
`heatonshoney.co.uk`.

---

## Day to day

- **New orders** show in Square (Dashboard → Orders) with the customer's name, phone number if
  they gave one, and collection time. Mark them complete when they've been collected.
- **Changing a price or slot**: edit `site/shop.json` and redeploy.
- **Using Square's item library instead**: if the products are set up as items in Square, put
  each item variation's ID in `squareVariationId` in `shop.json`. Square then uses its own
  price and stock for that product. The price in `shop.json` is still shown on the website,
  so keep the two the same.

## Good to know

- Each checkout link Square makes is used once, and these links don't show in the Square
  Dashboard's list of payment links. The orders and payments themselves do.
- Square asks for the customer's email on its checkout page and sends the receipt. The
  receipt includes the collection day and time, and `COLLECTION_ADDRESS` if you set it.
- If someone leaves Square's page without paying, their basket is still there when they come
  back.
- Prices are always checked on the server, so nobody can change what they pay by editing the
  page.
- Still to fill in on the pages: the candle descriptions and specs, a few lines from Michael on
  the About page, and the Instagram handle in the footer (search the pages for `[`).

## Previewing on your own computer

With the Netlify CLI installed, run `netlify dev` inside this folder and open the address it
prints. Add the sandbox values to a `.env` file first (never upload that file anywhere).
