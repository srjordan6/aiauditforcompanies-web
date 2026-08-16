/*
 * SRJ marketing-site analytics + consent — single implementation.
 * aiauditforcompanies.com
 *
 * Loaded by src/components/Analytics.astro (Astro pages) and by a single
 * <script src="/srj-analytics.js"> tag in each raw page under public/.
 * Before this file existed, every tag was pasted inline into four separate
 * places and Analytics.astro carried a comment warning that changing an ID
 * meant remembering to edit three other files. That is now impossible: the
 * IDs live here once.
 *
 * WHAT LOADS WHEN
 *
 *   GA4 (G-6LM3EMLLZN) loads immediately under Google Consent Mode v2 with
 *   every signal denied. It stores no identifiers and sends only cookieless
 *   pings until the visitor accepts, which keeps modelled traffic data
 *   without setting a cookie on someone who has not agreed.
 *
 *   Microsoft Clarity (session recording), StatCounter and the LinkedIn
 *   Insight Tag have no consent-mode equivalent. They are not loaded at all
 *   until the visitor accepts.
 *
 *   Both <noscript> tracking pixels (StatCounter, LinkedIn) were removed. A
 *   bare <img> fires on page load and cannot be gated, so keeping them would
 *   have made this whole file cosmetic.
 *
 * CUSTOM DIMENSIONS
 *
 *   `pillar` = first path segment, or "home" at the root.
 *   `section` = first two segments joined by "/", falling back to pillar.
 *   Astro passes build-time values via data attributes on the script tag;
 *   the raw public/ pages have no build step, so they fall back to deriving
 *   the same values from location.pathname. Both routes produce identical
 *   values — verified in verify_marketing.mjs.
 *
 *   Both must also be registered in the GA4 admin (Admin -> Data display ->
 *   Custom definitions, scope Event) or they are collected but invisible.
 *
 * CROSS-DOMAIN LINKING
 *
 *   The domains list must be identical on every SRJ property. Cross-domain
 *   linking is not one setting: each property has to name every partner, or
 *   a visitor arriving from a site missing from the list starts a new
 *   unattributed session and the funnel is lost in that direction. Do not
 *   shorten it to "the ones this site links to".
 */
(function () {
  'use strict';

  var GA4_ID = 'G-6LM3EMLLZN';
  var CLARITY_ID = 'xta7r2l6l3';
  var STATCOUNTER_PROJECT = 13338525;
  var STATCOUNTER_SECURITY = 'd5ff6432';
  var LINKEDIN_PARTNER_ID = '9681908';

  var LINKER_DOMAINS = [
    'theworldofai.org',
    'srjconsultingservices.com',
    'aiauditforcompanies.com',
    'outcomestar.app'
  ];

  var STORAGE_KEY = 'srj_consent_v1';
  var PRIVACY_URL = '/privacy.html';

  // ---------------------------------------------------------------------
  // Dimensions
  // ---------------------------------------------------------------------
  var script = document.currentScript;
  var dataset = (script && script.dataset) || {};

  function deriveDimensions(pathname) {
    var segments = String(pathname || '').split('/').filter(Boolean);
    if (!segments.length) return { pillar: 'home', section: 'home' };
    var pillar = segments[0];
    return {
      pillar: pillar,
      section: segments.length >= 2 ? segments.slice(0, 2).join('/') : pillar
    };
  }

  var derived = deriveDimensions(window.location.pathname);
  var PILLAR = dataset.pillar || derived.pillar;
  var SECTION = dataset.section || derived.section;

  // ---------------------------------------------------------------------
  // Consent state
  // ---------------------------------------------------------------------
  var pending = [];

  function readState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.state ? parsed.state : null;
    } catch (e) {
      return null; // Safari private mode, storage disabled by policy
    }
  }

  function writeState(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: state,
        at: new Date().toISOString(),
        version: 1
      }));
    } catch (e) {
      /* choice holds for this page view only */
    }
  }

  function flush() {
    var queued = pending;
    pending = [];
    queued.forEach(function (fn) {
      try { fn(); } catch (e) { /* one bad tag must not block the rest */ }
    });
  }

  window.srjConsent = {
    state: readState,

    onGrant: function (fn) {
      if (typeof fn !== 'function') return;
      if (readState() === 'granted') {
        try { fn(); } catch (e) {}
        return;
      }
      pending.push(fn);
    },

    grant: function () {
      writeState('granted');
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
          analytics_storage: 'granted'
        });
      }
      flush();
      hideBanner();
    },

    deny: function () {
      writeState('denied');
      pending = []; // never load this visit
      hideBanner();
    },

    // Clears the stored decision and re-opens the banner. Wired to any
    // element carrying [data-srj-consent-reset] — the "Cookie settings"
    // footer link. Does not retract already-loaded tags; a reload does.
    reset: function () {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      showBanner();
    }
  };

  // ---------------------------------------------------------------------
  // GA4 — loaded immediately, denied by default
  // ---------------------------------------------------------------------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });

  // Returning visitor who already accepted — apply before the first hit.
  if (readState() === 'granted') {
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted'
    });
  }

  var ga = document.createElement('script');
  ga.async = true;
  ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
  document.head.appendChild(ga);

  gtag('js', new Date());
  gtag('config', GA4_ID, {
    pillar: PILLAR,
    section: SECTION,
    linker: {
      domains: LINKER_DOMAINS,
      decorate_forms: true
    }
  });

  // ---------------------------------------------------------------------
  // Intent events
  // ---------------------------------------------------------------------
  // Safe to fire before consent: Consent Mode holds these cookieless rather
  // than dropping them, so the listener needs no gate of its own.
  window.srjTrack = function (name, params) {
    if (!name) return;
    var payload = { pillar: PILLAR, section: SECTION };
    if (params) {
      Object.keys(params).forEach(function (k) { payload[k] = params[k]; });
    }
    try { gtag('event', name, payload); } catch (e) {}
  };

  function classify(anchor) {
    var raw = anchor.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#') return null;

    var lowered = raw.toLowerCase();
    if (lowered.indexOf('mailto:') === 0 || lowered.indexOf('tel:') === 0) {
      return { name: 'contact_click', detail: raw };
    }

    var url;
    try { url = new URL(anchor.href, window.location.href); }
    catch (e) { return null; }

    if (url.hostname && url.hostname !== window.location.hostname) {
      return { name: 'outbound_click', detail: url.hostname };
    }

    var p = url.pathname;
    if (p.indexOf('/aiscore') === 0 || p.indexOf('/q/score') === 0) {
      return { name: 'score_start_click', detail: p };
    }
    if (p.indexOf('/startaiaudit') === 0 || p.indexOf('/q/start') === 0) {
      return { name: 'audit_start_click', detail: p };
    }
    if (p.indexOf('/billing') === 0 || p.indexOf('/pricing') === 0) {
      return { name: 'pricing_click', detail: p };
    }
    return null;
  }

  document.addEventListener('click', function (evt) {
    var target = evt.target;
    if (!target || !target.closest) return;

    if (target.closest('[data-srj-consent-reset]')) {
      evt.preventDefault();
      window.srjConsent.reset();
      return;
    }

    var tagged = target.closest('[data-srj-event]');
    if (tagged) {
      window.srjTrack(tagged.getAttribute('data-srj-event'), {
        link_text: (tagged.textContent || '').trim().slice(0, 80)
      });
      return;
    }

    var anchor = target.closest('a[href]');
    if (!anchor) return;

    var hit = classify(anchor);
    if (!hit) return;

    window.srjTrack(hit.name, {
      link_url: hit.detail,
      link_text: (anchor.textContent || '').trim().slice(0, 80)
    });
  }, true);

  // ---------------------------------------------------------------------
  // Consent-gated trackers
  // ---------------------------------------------------------------------
  window.srjConsent.onGrant(function () {
    // Microsoft Clarity — session recording + heatmaps.
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);

    // StatCounter — invisible pageview counter.
    window.sc_project = STATCOUNTER_PROJECT;
    window.sc_invisible = 1;
    window.sc_security = STATCOUNTER_SECURITY;
    var sc = document.createElement('script');
    sc.async = true;
    sc.src = 'https://www.statcounter.com/counter/counter.js';
    document.head.appendChild(sc);

    // LinkedIn Insight Tag — advertising measurement.
    window._linkedin_partner_id = LINKEDIN_PARTNER_ID;
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(LINKEDIN_PARTNER_ID);
    (function (l) {
      if (!l) {
        window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
        window.lintrk.q = [];
      }
      var s = document.getElementsByTagName('script')[0];
      var b = document.createElement('script');
      b.async = true;
      b.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
      s.parentNode.insertBefore(b, s);
    })(window.lintrk);
  });

  // ---------------------------------------------------------------------
  // Banner
  // ---------------------------------------------------------------------
  // Injected rather than authored into each page, so the four entry points
  // (Astro layout + three raw HTML pages) stay identical by construction.
  //
  // A bottom bar, not a modal: the site stays fully usable behind it. The
  // whole pitch of this funnel is a frictionless entry, and opening with a
  // wall would contradict it.
  var STYLES = [
    '.srj-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;',
    'background:#fff;border-top:3px solid #F07800;box-shadow:0 -4px 20px rgba(0,0,0,.12);',
    "padding:16px 0;font-family:'Poppins',-apple-system,'Segoe UI',sans-serif;color:#201868}",
    '.srj-consent[hidden]{display:none}',
    '.srj-consent__inner{max-width:1040px;margin:0 auto;padding:0 24px;display:flex;',
    'align-items:center;gap:24px;flex-wrap:wrap}',
    '.srj-consent__text{flex:1 1 420px;font-size:14px;line-height:1.55}',
    '.srj-consent__title{font-family:Lora,Georgia,serif;font-size:16px;font-weight:700;',
    'margin:0 0 4px}',
    '.srj-consent__title:focus{outline:none}',
    '.srj-consent__actions{display:flex;gap:12px;flex:0 0 auto}',
    '.srj-consent__btn{font:inherit;font-weight:600;font-size:14px;padding:10px 24px;',
    'border-radius:6px;cursor:pointer;min-width:112px;border:1px solid #201868}',
    '.srj-consent__btn--accept{background:#F07800;border-color:#F07800;color:#fff}',
    '.srj-consent__btn--accept:hover{background:#d96c00;border-color:#d96c00}',
    '.srj-consent__btn--decline{background:#fff;color:#201868}',
    '.srj-consent__btn--decline:hover{background:#F4F3FA}',
    '@media(max-width:575px){.srj-consent__actions{width:100%}',
    '.srj-consent__btn{flex:1 1 0;min-width:0}}'
  ].join('');

  var banner = null;

  function buildBanner() {
    var style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.className = 'srj-consent';
    el.id = 'srj-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'srj-consent-title');
    el.hidden = true;

    var inner = document.createElement('div');
    inner.className = 'srj-consent__inner';

    var text = document.createElement('div');
    text.className = 'srj-consent__text';

    var title = document.createElement('h2');
    title.className = 'srj-consent__title';
    title.id = 'srj-consent-title';
    title.tabIndex = -1;
    title.textContent = 'Cookies and measurement';

    var body = document.createElement('p');
    body.style.margin = '0';
    body.textContent = 'We use analytics cookies to understand how people find and '
      + 'use this site, including session recording and advertising measurement. '
      + 'Nothing is loaded until you choose. Decline and the site works exactly the same. ';

    var link = document.createElement('a');
    link.href = PRIVACY_URL;
    link.textContent = 'Privacy Policy';
    link.style.color = '#201868';
    body.appendChild(link);

    text.appendChild(title);
    text.appendChild(body);

    var actions = document.createElement('div');
    actions.className = 'srj-consent__actions';

    var decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'srj-consent__btn srj-consent__btn--decline';
    decline.id = 'srj-consent-decline';
    decline.textContent = 'Decline';
    decline.addEventListener('click', function () { window.srjConsent.deny(); });

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'srj-consent__btn srj-consent__btn--accept';
    accept.id = 'srj-consent-accept';
    accept.textContent = 'Accept';
    accept.addEventListener('click', function () { window.srjConsent.grant(); });

    actions.appendChild(decline);
    actions.appendChild(accept);

    inner.appendChild(text);
    inner.appendChild(actions);
    el.appendChild(inner);
    document.body.appendChild(el);

    return el;
  }

  // The banner is fixed to the bottom, so it sits on top of whatever the page
  // ends with. On the homepage at common viewport heights that is the primary
  // "Start Your AI Audit Now" button — verified clipped in a real browser at
  // 1280x720. Reserve the space instead of covering it, and keep the reserve
  // correct when the bar rewraps on resize.
  var priorPaddingBottom = null;

  function reserveSpace() {
    if (!banner || banner.hidden) return;
    var height = banner.offsetHeight;
    if (!height) return;
    if (priorPaddingBottom === null) {
      priorPaddingBottom = document.body.style.paddingBottom || '';
    }
    document.body.style.paddingBottom = height + 'px';
  }

  function releaseSpace() {
    if (priorPaddingBottom === null) return;
    document.body.style.paddingBottom = priorPaddingBottom;
    priorPaddingBottom = null;
  }

  function showBanner() {
    if (!document.body) return;
    if (!banner) banner = buildBanner();
    banner.hidden = false;
    reserveSpace();
    var title = document.getElementById('srj-consent-title');
    if (title) { try { title.focus(); } catch (e) {} }
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
    releaseSpace();
  }

  window.addEventListener('resize', reserveSpace);

  function initBanner() {
    if (readState() === null) showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBanner);
  } else {
    initBanner();
  }
})();
