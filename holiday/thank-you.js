// Shared by /holiday/thank-you/ and /holiday/thank-you-plus/.
// Stripe returns here with ?payment_intent=…&payment_intent_client_secret=…
// The order is verified server-side before any download link is shown.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STATES = ['loading', 'ok', 'processing', 'failed', 'missing'];
  var lead = document.body.getAttribute('data-lead'); // which download gets "Start here"
  var THUMB = {
    pack: '<div class="dl-thumb"><i>The Ultimate</i><b>Holiday Prompt Pack</b></div>',
    muse: '<div class="dl-thumb berry"><i>Holiday</i><b>Muse Setup</b></div>'
  };
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>';

  document.querySelectorAll('.yr').forEach(function (n) { n.textContent = new Date().getFullYear(); });

  function show(state, title, sub) {
    STATES.forEach(function (s) { var el = $('st-' + s); if (el) el.hidden = s !== state; });
    if (title) $('heroTitle').textContent = title;
    if (sub !== undefined) $('heroSub').innerHTML = sub;
  }
  var esc = function (s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var q = new URLSearchParams(location.search);
  var pi = q.get('payment_intent'), cs = q.get('payment_intent_client_secret');
  if (!pi || !cs) {
    return show('missing', 'Thank you.', 'If you just completed an order, your downloads are on their way to your inbox.');
  }

  var tries = 0;
  function load() {
    fetch('/.netlify/functions/holiday-order?pi=' + encodeURIComponent(pi) + '&cs=' + encodeURIComponent(cs), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return show('missing', 'Thank you.', 'If you just completed an order, your downloads are on their way to your inbox.');
        // Land on the page that matches what was bought.
        if (d.path && d.path !== location.pathname) return location.replace(d.path + location.search);

        if (d.firstName) document.querySelectorAll('[data-first]').forEach(function (n) { n.textContent = ', ' + d.firstName; });
        document.querySelectorAll('[data-email]').forEach(function (n) { n.textContent = d.email; });

        if (d.status === 'succeeded') {
          var items = (d.downloads || []).slice().sort(function (a, b) { return (b.id === lead) - (a.id === lead); });
          $('dl').innerHTML = items.map(function (x) {
            var isLead = x.id === lead && items.length > 1;
            return '<div class="dl-item' + (isLead ? ' lead' : '') + '">' + (THUMB[x.id] || '') +
              '<div>' + (isLead ? '<span class="dl-tag">Start here</span>' : '') +
              '<div class="dl-name">' + esc(x.label) + '</div><div class="dl-sub">' + esc(x.sub) + '</div></div>' +
              '<a class="btn" href="' + esc(x.url) + '">' + ICON + 'Download</a></div>';
          }).join('');
          return show('ok');
        }
        if (d.status === 'processing') {
          show('processing', 'Almost there.', 'Your payment is processing. This page will update, and your downloads will be emailed to <b>' + esc(d.email) + '</b>.');
          if (tries++ < 10) setTimeout(load, 4000);
          return;
        }
        if (d.status === 'refunded') return show('failed', 'This order was refunded.', 'Questions? Write to mvw@mattvincentwalker.com.');
        show('failed', 'Your payment didn’t go through.', 'No charge was made. You can try again with another card.');
      })
      .catch(function () {
        show('missing', 'Thank you.', 'We could not load your order just now, but your downloads are on their way to your inbox.');
      });
  }
  load();
})();
