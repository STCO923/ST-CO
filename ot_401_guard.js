// OT_401_GUARD.JS — Global 401 interceptor for all pages
// Wraps window.fetch to automatically refresh JWT and retry on Supabase REST 401 errors.
// Does NOT disconnect the user. Works independently of each page's inline OT module.

(function() {
  var SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  var _originalFetch = window.fetch.bind(window);
  var _refreshPromise = null;

  function _getSession() {
    var raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  function _saveSession(s) {
    var store = localStorage.getItem('ot_session') ? localStorage : sessionStorage;
    store.setItem('ot_session', JSON.stringify(s));
  }

  // Refresh the JWT token using the refresh_token stored in session
  function _refreshJWT() {
    var s = _getSession();
    if (!s || !s.refresh_token) return Promise.resolve(false);

    return _originalFetch(SB + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function(r) {
      if (!r.ok) return false;
      return r.json().then(function(data) {
        if (!data.access_token) return false;
        var updated = Object.assign({}, _getSession(), {
          token: data.access_token,
          refresh_token: data.refresh_token || s.refresh_token,
          token_expires_at: Date.now() + (data.expires_in || 3600) * 1000
        });
        _saveSession(updated);
        return true;
      });
    }).catch(function() { return false; });
  }

  // Copy headers from init object (supports both plain objects and Headers instances)
  function _cloneHeaders(init) {
    var h = {};
    if (init && init.headers) {
      if (typeof init.headers.forEach === 'function') {
        init.headers.forEach(function(v, k) { h[k] = v; });
      } else {
        Object.keys(init.headers).forEach(function(k) { h[k] = init.headers[k]; });
      }
    }
    return h;
  }

  window.fetch = async function(input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
    var resp = await _originalFetch(input, init);

    // Only intercept Supabase REST API 401s (skip auth endpoints to avoid loops)
    if (resp.status !== 401) return resp;
    if (url.indexOf('/rest/v1/') === -1) return resp;

    // Deduplicate concurrent refresh calls (all 401s wait for the same refresh)
    if (!_refreshPromise) {
      _refreshPromise = _refreshJWT().finally(function() {
        _refreshPromise = null;
      });
    }
    var refreshed = await _refreshPromise;
    if (!refreshed) return resp;

    // Retry with fresh token
    var s = _getSession();
    if (!s || !s.token) return resp;

    var newHeaders = _cloneHeaders(init);
    newHeaders['Authorization'] = 'Bearer ' + s.token;

    return _originalFetch(url, Object.assign({}, init || {}, { headers: newHeaders }));
  };
})();
