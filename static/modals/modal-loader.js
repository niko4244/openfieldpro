/**
 * modal-loader.js — async modal partial injector
 *
 * Fetches modal HTML partials from /static/modals/ and injects them into
 * <body> so the app's existing document.getElementById('...') lookups work.
 *
 * Partial files are loaded in order via fetch() and injected before the
 * deferred app.js runs (this script is loaded as a blocking <script> in
 * index.html, not async/defer).
 *
 * To add a new modal partial:
 *   1. Create static/modals/<name>.html with the exact HTML (including the
 *      outer <div id="my-modal" class="modal hidden"> container).
 *   2. Add '/static/modals/<name>.html' to the PARTIALS array below.
 *   3. Replace the inline modal HTML in index.html with the loader script.
 *   4. Restart the server.
 */
(function() {
  'use strict';

  var PARTIALS = [
    '/static/modals/brain-modal.html',
    '/static/modals/theme-popup.html',
  ];

  /**
   * Inject partial HTML at the end of <body> using a synchronous XHR.
   * Synchronous requests are deprecated but acceptable here:
   *   - The partials are small (~21KB + ~15KB)
   *   - This runs once at page load
   *   - It guarantees the DOM is ready before any deferred <script>
   *     (app.js and friends) queries getElementById('memory-modal').
   * Upgrade path: once the app's modal-show functions are wrapped to
   * await an injected promise, switch to async fetch().
   */
  function injectPartial(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);  // synchronous
      xhr.overrideMimeType('text/html; charset=utf-8');
      xhr.send();
      if (xhr.status === 200 || xhr.status === 304) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = xhr.responseText;
        // Append each top-level node to <body>
        while (wrapper.firstChild) {
          document.body.appendChild(wrapper.firstChild);
        }
        return true;
      }
      console.warn('[modal-loader] ' + url + ' returned HTTP ' + xhr.status);
    } catch (e) {
      console.error('[modal-loader] Failed to load ' + url, e);
    }
    return false;
  }

  // Inject all partials sequentially
  for (var i = 0; i < PARTIALS.length; i++) {
    injectPartial(PARTIALS[i]);
  }
})();
