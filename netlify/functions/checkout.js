/*
 * POST /.netlify/functions/checkout
 * Body: { items: [{ id, qty }], date: "2026-11-28", start: "10:00", name, phone }
 * Returns: { url } — a Square-hosted checkout page for exactly this order,
 * set up as a PICKUP order at the chosen collection time.
 *
 * Prices are taken from site/shop.json here on the server, never from the
 * browser, so nobody can change what they pay.
 *
 * Settings (Netlify > Site configuration > Environment variables):
 *   SQUARE_ACCESS_TOKEN   secret token from the Square Developer Console
 *   SQUARE_LOCATION_ID    the location the orders belong to
 *   SQUARE_ENVIRONMENT    "sandbox" while testing, "production" for real money
 *   COLLECTION_ADDRESS    optional: full collection address, printed on the
 *                         customer's Square receipt (kept off the public site)
 */
const shop = require('../../site/shop.json');

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TZ = (shop.collection && shop.collection.timezone) || 'Europe/London';

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

// Today's date where the shop is, as "YYYY-MM-DD".
function shopToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// "2026-11-28" + "10:00" in UK time -> ISO timestamp (correct in GMT and BST).
function ukTimeToIso(isoDate, hhmm) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess)).forEach((p) => { parts[p.type] = Number(p.value); });
  const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (seen - guess)).toISOString();
}

function slotEnd(start) {
  const [h, m] = start.split(':').map(Number);
  const mins = h * 60 + m + (shop.collection.slotMinutes || 60);
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}

// Checks the chosen day and time are a real collection slot.
function validSlot(date, start, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(start || '')) return false;
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCMonth() !== m - 1) return false;
  const [ty, tm, td] = shopToday(now).split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  const daysAhead = (day.getTime() - today) / 86400000;
  if (daysAhead < 1 || daysAhead > 7 * (shop.collection.weeksAhead || 8)) return false;
  const starts = shop.collection.days[DAY_NAMES[day.getUTCDay()]] || [];
  return starts.includes(start);
}

function buildRequest(body, env) {
  const items = Array.isArray(body.items) ? body.items : [];
  const lineItems = [];
  for (const it of items) {
    const p = shop.products.find((x) => x.id === it.id);
    const qty = Number(it.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > 24) return { error: 'Your basket has something we don\'t recognise. Please refresh and try again.' };
    if (p.squareVariationId) {
      lineItems.push({ catalog_object_id: p.squareVariationId, quantity: String(qty) });
    } else {
      if (!Number.isInteger(p.price) || p.price <= 0) return { error: 'Online ordering isn\'t open yet: prices haven\'t been set.', status: 503 };
      lineItems.push({ name: p.name + (p.detail && p.detail !== 'Candle' ? ', ' + p.detail : ''), quantity: String(qty),
        base_price_money: { amount: p.price, currency: shop.currency || 'GBP' } });
    }
  }
  if (!lineItems.length) return { error: 'Your basket is empty.' };
  if (!validSlot(body.date, body.start)) return { error: 'That collection time isn\'t available any more. Please pick another.' };
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) return { error: 'Please add a name for the order.' };
  // UK numbers to international format (07700 900123 -> +447700900123), which Square expects.
  let phone = String(body.phone || '').replace(/[^\d+]/g, '');
  if (/^0\d{9,10}$/.test(phone)) phone = '+44' + phone.slice(1);
  else if (/^44\d{9,10}$/.test(phone)) phone = '+' + phone;
  if (!/^\+\d{8,15}$/.test(phone)) phone = '';

  const [y, m, d] = body.date.split('-').map(Number);
  const dayName = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const when = dayName[0].toUpperCase() + dayName.slice(1, 3) + ' ' + d + ' ' + MONTHS[m - 1] + ', ' + body.start + '–' + slotEnd(body.start);
  const where = (env.COLLECTION_ADDRESS || shop.collection.postcode || '').trim();
  const recipient = { display_name: name };
  if (phone) recipient.phone_number = phone;

  const siteUrl = (env.SITE_URL || env.URL || '').replace(/\/$/, '');
  return {
    request: {
      idempotency_key: require('crypto').randomUUID(),
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems,
        fulfillments: [{
          type: 'PICKUP',
          state: 'PROPOSED',
          pickup_details: {
            schedule_type: 'SCHEDULED',
            pickup_at: ukTimeToIso(body.date, body.start),
            prep_time_duration: 'PT30M',
            note: 'Collection ' + when,
            recipient,
          },
        }],
      },
      checkout_options: Object.assign({ ask_for_shipping_address: false }, siteUrl ? { redirect_url: siteUrl + '/thank-you.html' } : {}),
      payment_note: ('Collect ' + when + (where ? ' from ' + where : '') + '. Questions: 07814 854 517').slice(0, 500),
    },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  const env = process.env;
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    console.error('Missing SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID');
    return reply(500, { error: 'Payments aren\'t set up yet.' });
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad request.' }); }

  const built = buildRequest(body, env);
  if (built.error) return reply(built.status || 400, { error: built.error });

  const base = (env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase() === 'production'
    ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  try {
    const res = await fetch(base + '/v2/online-checkout/payment-links', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.SQUARE_ACCESS_TOKEN,
        'Content-Type': 'application/json',
        'Square-Version': env.SQUARE_VERSION || '2026-11-18',
      },
      body: JSON.stringify(built.request),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.payment_link || !data.payment_link.url) {
      console.error('Square error', res.status, JSON.stringify(data.errors || data));
      return reply(502, { error: 'We couldn\'t start the payment just now.' });
    }
    return reply(200, { url: data.payment_link.url });
  } catch (e) {
    console.error('Square request failed', e);
    return reply(502, { error: 'We couldn\'t reach the payment service.' });
  }
};

// Exposed for the local test script.
exports._test = { buildRequest, validSlot, ukTimeToIso, shopToday };
