/* Shared shop logic: product list, basket (saved in the browser), prices,
   collection days and the "added to basket" pop-up. */
(function () {
  var KEY = 'hh-basket-v1';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function read() {
    try { var b = JSON.parse(localStorage.getItem(KEY) || '{}'); return b && typeof b === 'object' ? b : {}; }
    catch (e) { return {}; }
  }
  function write(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }

  var HH = {
    shop: null,
    DAYS: DAYS,
    MONTHS: MONTHS,
    load: function () {
      return fetch('shop.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (s) { HH.shop = s; return s; });
    },
    product: function (id) { return (HH.shop.products || []).filter(function (p) { return p.id === id; })[0]; },
    money: function (pence) { return pence == null ? '£[PRICE]' : '£' + (pence / 100).toFixed(2); },
    priceLabel: function (id) { var p = HH.product(id); return HH.money(p ? p.price : null); },

    basket: read,
    setQty: function (id, qty) {
      var b = read(); qty = Math.max(0, Math.min(24, qty | 0));
      if (qty) b[id] = qty; else delete b[id];
      write(b); return b;
    },
    add: function (id, qty) { var b = read(); return HH.setQty(id, (b[id] || 0) + (qty || 1)); },
    clear: function () { write({}); },
    count: function () { var b = read(), n = 0; for (var k in b) if (HH.product(k)) n += b[k]; return n; },
    countText: function (n) { return n + (n === 1 ? ' item' : ' items'); },

    /* Header + pop-up values every page passes to its template. */
    headerVals: function (pop) {
      var n = HH.count(), p = pop && HH.product(pop.id);
      return {
        basketCount: n,
        basketLabel: 'Basket, ' + HH.countText(n),
        basketItemsText: HH.countText(n),
        popOpen: !!p,
        popName: p ? p.name : '',
        popImg: p ? p.tile : '',
        popDetail: p ? p.detail + ' · ' + HH.money(p.price) + ' · Qty ' + pop.qty : ''
      };
    },

    /* Collection days: the days listed in shop.json, from tomorrow up to N weeks ahead. */
    today: function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d; },
    lastDay: function () { var d = HH.today(); d.setDate(d.getDate() + 7 * (HH.shop.collection.weeksAhead || 8)); return d; },
    startsFor: function (d) { return HH.shop.collection.days[DAYS[d.getDay()].toLowerCase()] || []; },
    isOpen: function (d) { return HH.startsFor(d).length > 0 && d > HH.today() && d <= HH.lastDay(); },
    iso: function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    fromIso: function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); },
    slotLabel: function (start) {
      var m = start.split(':').map(Number), mins = m[0] * 60 + m[1] + (HH.shop.collection.slotMinutes || 60);
      return start + ' – ' + String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    },
    dateLong: function (d) { return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; },

    /* "2026-11-28" + "10:00" in UK time -> a real moment (handles GMT/BST). */
    ukTime: function (isoDate, hhmm) {
      var p = isoDate.split('-').map(Number), t = hhmm.split(':').map(Number);
      var guess = Date.UTC(p[0], p[1] - 1, p[2], t[0], t[1]);
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: HH.shop.collection.timezone || 'Europe/London', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      var o = {}; f.formatToParts(new Date(guess)).forEach(function (x) { o[x.type] = +x.value; });
      var seen = Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute);
      return new Date(guess - (seen - guess));
    }
  };
  window.HH = HH;
})();
