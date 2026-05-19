// ═══════════════════════════════════════════════════════════════════
// T SERVICE & CO — ot_messaging.js v1.0
// Module de messagerie Admin ↔ Chauffeurs
//
// Fonctionnalités :
//   - Envoi de messages (1:1 ou broadcast tous les chauffeurs)
//   - Chargement des conversations (polling toutes les 5s)
//   - Marquer les messages comme lus
//   - Badge de messages non lus
//   - Suppression automatique côté DB après 24h (pg_cron)
//
// À inclure dans les pages qui utilisent la messagerie :
//   <script src="/ot_messaging.js"></script>
// ═══════════════════════════════════════════════════════════════════

window.OT_MSG = (() => {
  'use strict';

  const SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  let _pollTimer    = null;
  let _badgeTimer   = null;
  let _onNewMessage = null;   // callback(messages[]) à chaque poll
  let _ws           = null;   // WebSocket Supabase Realtime (live updates)
  let _wsHeartbeat  = null;
  let _wsHealthy    = false;  // passe à true dès la 1re réception du serveur

  // Wrapper visibility-aware : si OT_VIS est chargé, on pause le polling
  // quand l'onglet est caché (économie DB). Sinon fallback setInterval natif.
  function _interval(fn, ms) {
    if (window.OT_VIS && OT_VIS.setManagedInterval) return OT_VIS.setManagedInterval(fn, ms);
    return { id: setInterval(fn, ms), clear() { clearInterval(this.id); } };
  }
  function _clearInterval(t) {
    if (!t) return;
    if (typeof t.clear === 'function') t.clear();
    else clearInterval(t);
  }

  // ── Helpers ─────────────────────────────────────────────────────
  function _h() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      const token = raw ? JSON.parse(raw).token : null;
      return {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': 'Bearer ' + (token || KEY),
        'Prefer': 'return=representation'
      };
    } catch(e) {
      return { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Prefer': 'return=representation' };
    }
  }

  function _cid() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s.company_id || s.id || null;
    } catch(e) { return null; }
  }

  function _session() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function _senderName() {
    const s = _session();
    if (!s) return 'Inconnu';
    return s.name || s.chauffeur_nom || 'Admin';
  }

  function _role() {
    const s = _session();
    return s ? (s.role || 'admin') : 'admin';
  }

  // Formate la date relative (ex: "il y a 5 min")
  function timeAgo(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "À l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h}h`;
    return `il y a ${Math.floor(h / 24)}j`;
  }

  // ── API ─────────────────────────────────────────────────────────

  /**
   * Charge les messages d'une conversation (admin ↔ un chauffeur)
   * ou les broadcasts si chauffeur_name = '_BROADCAST_'
   */
  async function loadConversation(chauffeurName) {
    const cid = _cid();
    if (!cid) return [];
    try {
      let url;
      if (chauffeurName === '_BROADCAST_') {
        url = `${SB}/rest/v1/messages?company_id=eq.${cid}&is_broadcast=eq.true&order=created_at.asc&limit=200`;
      } else {
        url = `${SB}/rest/v1/messages?company_id=eq.${cid}&chauffeur_name=eq.${encodeURIComponent(chauffeurName)}&order=created_at.asc&limit=200`;
      }
      const r = await fetch(url, { headers: _h() });
      if (!r.ok) return [];
      return await r.json();
    } catch(e) { return []; }
  }

  /**
   * Charge les conversations résumées pour l'admin
   * (dernier message par chauffeur + comptage non lus)
   */
  async function loadConversationList() {
    const cid = _cid();
    if (!cid) return [];
    try {
      // Charger tous les messages non expirés
      const r = await fetch(
        `${SB}/rest/v1/messages?company_id=eq.${cid}&order=created_at.desc&limit=500`,
        { headers: _h() }
      );
      if (!r.ok) return [];
      const msgs = await r.json();

      // Grouper par chauffeur_name
      const map = {};
      for (const m of msgs) {
        const key = m.is_broadcast ? '_BROADCAST_' : m.chauffeur_name;
        if (!map[key]) {
          map[key] = { chauffeur_name: key, last_message: m, unread: 0 };
        }
        // Compter non lus (messages du chauffeur non lus par l'admin)
        if (!m.read_at && m.sender_role === 'chauffeur') {
          map[key].unread++;
        }
      }
      return Object.values(map).sort((a, b) =>
        new Date(b.last_message.created_at) - new Date(a.last_message.created_at)
      );
    } catch(e) { return []; }
  }

  /**
   * Envoie un message
   * @param {string} chauffeurName - nom du chauffeur destinataire
   * @param {string} content - texte du message
   * @param {boolean} isBroadcast - true = envoi à tous les chauffeurs
   */
  async function sendMessage(chauffeurName, content, isBroadcast = false) {
    const cid = _cid();
    if (!cid || !content.trim()) return null;
    const role = _role();
    const payload = {
      company_id:     cid,
      sender_role:    role === 'chauffeur' ? 'chauffeur' : (role === 'chef_equipe' ? 'chef_equipe' : 'admin'),
      sender_name:    _senderName(),
      chauffeur_name: isBroadcast ? '_BROADCAST_' : chauffeurName,
      content:        content.trim().substring(0, 2000),
      is_broadcast:   isBroadcast
    };
    try {
      const r = await fetch(`${SB}/rest/v1/messages`, {
        method: 'POST',
        headers: _h(),
        body: JSON.stringify(payload)
      });
      if (!r.ok) return null;
      const data = await r.json();
      return Array.isArray(data) ? data[0] : data;
    } catch(e) { return null; }
  }

  /**
   * Marque comme lus tous les messages non lus d'une conversation
   * (uniquement ceux envoyés par l'autre partie)
   */
  async function markConversationRead(chauffeurName) {
    const cid = _cid();
    if (!cid) return;
    const role = _role();
    const senderToMark = role === 'admin' ? 'chauffeur' : 'admin';
    try {
      let filter;
      if (chauffeurName === '_BROADCAST_') {
        filter = `company_id=eq.${cid}&is_broadcast=eq.true&sender_role=eq.${senderToMark}&read_at=is.null`;
      } else {
        filter = `company_id=eq.${cid}&chauffeur_name=eq.${encodeURIComponent(chauffeurName)}&sender_role=eq.${senderToMark}&read_at=is.null`;
      }
      await fetch(`${SB}/rest/v1/messages?${filter}`, {
        method: 'PATCH',
        headers: _h(),
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
    } catch(e) {}
  }

  /**
   * Compte les messages non lus (pour le badge global)
   * Pour un chauffeur : messages de l'admin non lus
   * Pour l'admin : messages des chauffeurs non lus
   */
  async function getUnreadCount(chauffeurName) {
    const cid = _cid();
    if (!cid) return 0;
    const role = _role();
    const senderToCount = role === 'admin' ? 'chauffeur' : 'admin';
    try {
      let filter;
      if (chauffeurName) {
        filter = `company_id=eq.${cid}&chauffeur_name=eq.${encodeURIComponent(chauffeurName)}&sender_role=eq.${senderToCount}&read_at=is.null`;
      } else {
        filter = `company_id=eq.${cid}&sender_role=eq.${senderToCount}&read_at=is.null`;
        if (role === 'chauffeur') {
          const s = _session();
          const myName = s ? (s.chauffeur_nom || s.name) : '';
          filter += `&or=(chauffeur_name.eq.${encodeURIComponent(myName)},is_broadcast.eq.true)`;
        }
      }
      const r = await fetch(`${SB}/rest/v1/messages?${filter}&select=id`, {
        headers: { ...(_h()), 'Prefer': 'count=exact', 'Range': '0-0' }
      });
      if (!r.ok) return 0;
      const range = r.headers.get('Content-Range');
      if (range) {
        const total = range.split('/')[1];
        return total === '*' ? 0 : parseInt(total, 10);
      }
      const data = await r.json();
      return Array.isArray(data) ? data.length : 0;
    } catch(e) { return 0; }
  }

  // ── Polling ─────────────────────────────────────────────────────

  /**
   * Démarre le suivi d'une conversation.
   * Combinaison : Supabase Realtime (WebSocket, live) + polling de secours.
   *   - Si le WS se connecte : updates instantanés, polling de secours espacé (30s).
   *   - Si le WS échoue     : polling à 10s (léger fallback).
   *
   * @param {string} chauffeurName   nom du chauffeur (ou '_BROADCAST_')
   * @param {function} callback      reçoit le tableau complet des messages à chaque refresh
   * @param {number} intervalMs      ignoré (conservé pour compat) — la stratégie est auto-ajustée
   */
  function startPolling(chauffeurName, callback, intervalMs) {
    stopPolling();
    _onNewMessage = callback;
    const poll = async () => {
      const msgs = await loadConversation(chauffeurName);
      if (_onNewMessage) _onNewMessage(msgs);
    };
    poll(); // chargement immédiat
    // Polling de secours — démarre à 10s, passe à 30s si le WS est healthy
    _pollTimer = _interval(poll, 10000);
    _startRealtime(chauffeurName, null, () => {
      // Quand le WS devient healthy pour la 1re fois : réduire la fréquence du poll
      if (_pollTimer) { _clearInterval(_pollTimer); _pollTimer = _interval(poll, 30000); }
    }, poll);
  }

  function stopPolling() {
    if (_pollTimer) { _clearInterval(_pollTimer); _pollTimer = null; }
    _stopRealtime();
    _onNewMessage = null;
  }

  /**
   * Watch "inbox" côté chauffeur : notifie à chaque nouveau message de la
   * conversation 1:1 OU broadcast (pas de filtre sur groupId).
   * Utilisé par la vue chauffeur qui affiche 1:1 + broadcasts ensemble.
   */
  function startInboxWatch(chauffeurName, callback) {
    stopPolling();
    _onNewMessage = callback;
    const poll = async () => { if (typeof callback === 'function') await callback(); };
    poll();
    _pollTimer = _interval(poll, 10000);
    _startRealtime(chauffeurName, null, () => {
      if (_pollTimer) { _clearInterval(_pollTimer); _pollTimer = _interval(poll, 30000); }
    }, poll, /* inboxMode */ true);
  }

  // ── Supabase Realtime (WebSocket) ───────────────────────────────
  // S'abonne à postgres_changes sur la table `messages` filtrée par company_id.
  // Chaque INSERT/UPDATE/DELETE qui matche la conversation courante déclenche
  // onChange() → reload complet de la liste via le polling existant.
  // Si `inboxMode` est true : on match aussi les broadcasts (utile pour la
  // vue chauffeur qui affiche 1:1 + broadcasts dans le même fil).
  function _startRealtime(chauffeurName, groupId, onHealthy, onChange, inboxMode) {
    _stopRealtime();
    const cid = _cid();
    if (!cid || typeof WebSocket === 'undefined') return;
    // Récupère le JWT du user courant pour que Realtime applique RLS avec la
    // bonne identité (sinon ça tourne en anon → les chauffeurs ne reçoivent rien).
    let accessToken = KEY;
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      if (raw) { const s = JSON.parse(raw); if (s && s.token) accessToken = s.token; }
    } catch(e) {}
    try {
      const wsUrl = `wss://kfdyqcbclueppmvkccdz.supabase.co/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`;
      const ws = new WebSocket(wsUrl);
      _ws = ws;
      const topic = `realtime:public:messages:${cid}`;
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({
            topic,
            event: 'phx_join',
            payload: {
              config: {
                broadcast: { self: false },
                presence: { key: '' },
                postgres_changes: [{ event: '*', schema: 'public', table: 'messages', filter: `company_id=eq.${cid}` }]
              },
              access_token: accessToken
            },
            ref: '1'
          }));
        } catch(e) {}
        _wsHeartbeat = setInterval(() => {
          try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '0' })); } catch(e) {}
        }, 30000);
      };
      ws.onmessage = (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch(e) { return; }
        if (!_wsHealthy && msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
          _wsHealthy = true;
          if (typeof onHealthy === 'function') onHealthy();
        }
        // Les events postgres_changes arrivent sous deux formes selon la version
        const isChange = (msg.event === 'postgres_changes') || (msg.payload && msg.payload.data && msg.payload.data.type);
        if (!isChange) return;
        const rec = (msg.payload && (msg.payload.data?.record || msg.payload.record || msg.payload.data?.new)) || null;
        // Filtre côté client pour ne reload que si le message concerne la conversation ouverte
        let matches = true;
        if (rec) {
          if (groupId) {
            matches = rec.group_id === groupId;
          } else if (inboxMode && chauffeurName) {
            // Vue chauffeur : 1:1 pour ce chauffeur OU broadcast
            matches = rec.is_broadcast === true || rec.chauffeur_name === chauffeurName;
          } else if (chauffeurName === '_BROADCAST_') {
            matches = rec.is_broadcast === true;
          } else if (chauffeurName) {
            matches = rec.chauffeur_name === chauffeurName && rec.is_broadcast !== true;
          }
        }
        if (matches && typeof onChange === 'function') onChange();
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (_wsHeartbeat) { clearInterval(_wsHeartbeat); _wsHeartbeat = null; }
        _wsHealthy = false;
      };
    } catch(e) {}
  }

  function _stopRealtime() {
    if (_wsHeartbeat) { clearInterval(_wsHeartbeat); _wsHeartbeat = null; }
    if (_ws) { try { _ws.close(); } catch(e) {} _ws = null; }
    _wsHealthy = false;
  }

  /**
   * Démarre le polling du badge (messages non lus)
   * @param {function} callback(count) - appelé avec le total non lus
   * @param {string|null} chauffeurName - null = total global
   */
  function startBadgePolling(callback, chauffeurName = null, intervalMs = 10000) {
    stopBadgePolling();
    const poll = async () => {
      const count = await getUnreadCount(chauffeurName);
      callback(count);
    };
    poll();
    _badgeTimer = _interval(poll, intervalMs);
  }

  function stopBadgePolling() {
    if (_badgeTimer) { _clearInterval(_badgeTimer); _badgeTimer = null; }
  }

  // ── Utilities ───────────────────────────────────────────────────

  /**
   * Charge les chauffeurs actifs ayant un compte (depuis company_users)
   * Seuls les utilisateurs avec role=chauffeur et actif=true apparaissent
   */
  async function loadDriversList() {
    const cid = _cid();
    if (!cid) return [];
    try {
      const r = await fetch(
        `${SB}/rest/v1/company_users?company_id=eq.${cid}&role=eq.chauffeur&actif=eq.true&select=id,chauffeur_nom,email&order=chauffeur_nom.asc`,
        { headers: _h() }
      );
      if (!r.ok) return [];
      const data = await r.json();
      // Normaliser : retourner {id, nom} pour compatibilité
      return data.map(u => ({ id: u.id, nom: u.chauffeur_nom || u.email || '' }));
    } catch(e) { return []; }
  }

  // ── Groupes ─────────────────────────────────────────────────────

  /** Charge tous les groupes de la société */
  async function loadGroups() {
    const cid = _cid();
    if (!cid) return [];
    try {
      const r = await fetch(
        `${SB}/rest/v1/message_groups?company_id=eq.${cid}&order=created_at.desc`,
        { headers: _h() }
      );
      if (!r.ok) return [];
      return await r.json();
    } catch(e) { return []; }
  }

  /** Charge les membres d'un groupe */
  async function loadGroupMembers(groupId) {
    if (!groupId) return [];
    try {
      const r = await fetch(
        `${SB}/rest/v1/message_group_members?group_id=eq.${groupId}&select=chauffeur_name&order=chauffeur_name.asc`,
        { headers: _h() }
      );
      if (!r.ok) return [];
      return (await r.json()).map(m => m.chauffeur_name);
    } catch(e) { return []; }
  }

  /**
   * Charge les groupes avec dernier message + nb non lus
   * (pour afficher la liste dans le panneau gauche)
   */
  async function loadGroupList() {
    const cid = _cid();
    if (!cid) return [];
    try {
      const groups = await loadGroups();
      if (groups.length === 0) return [];
      const groupIds = groups.map(g => g.id).join(',');
      const r = await fetch(
        `${SB}/rest/v1/messages?group_id=in.(${groupIds})&order=created_at.desc&limit=1000`,
        { headers: _h() }
      );
      const msgs = r.ok ? await r.json() : [];
      const s = _session();
      const myName = s ? (s.name || s.chauffeur_nom || '') : '';
      return groups.map(g => {
        const gMsgs  = msgs.filter(m => m.group_id === g.id);
        const lastMsg = gMsgs[0] || null;
        const unread  = gMsgs.filter(m => !m.read_at && m.sender_name !== myName).length;
        return { ...g, last_message: lastMsg, unread };
      }).sort((a, b) => {
        if (!a.last_message && !b.last_message) return 0;
        if (!a.last_message) return 1;
        if (!b.last_message) return -1;
        return new Date(b.last_message.created_at) - new Date(a.last_message.created_at);
      });
    } catch(e) { return []; }
  }

  /**
   * Crée un groupe et ajoute les membres
   * @param {string} name - Nom du groupe
   * @param {string[]} chauffeurNames - Noms des chauffeurs membres
   */
  async function createGroup(name, chauffeurNames) {
    const cid = _cid();
    if (!cid || !name.trim()) return null;
    try {
      const r = await fetch(`${SB}/rest/v1/message_groups`, {
        method: 'POST',
        headers: _h(),
        body: JSON.stringify({ company_id: cid, name: name.trim().substring(0, 100), created_by: _senderName() })
      });
      if (!r.ok) return null;
      const data  = await r.json();
      const group = Array.isArray(data) ? data[0] : data;
      if (!group || !group.id) return null;
      if (chauffeurNames && chauffeurNames.length > 0) {
        await fetch(`${SB}/rest/v1/message_group_members`, {
          method: 'POST',
          headers: _h(),
          body: JSON.stringify(chauffeurNames.map(n => ({ group_id: group.id, chauffeur_name: n })))
        });
      }
      return group;
    } catch(e) { return null; }
  }

  /** Met à jour le nom et les membres d'un groupe */
  async function updateGroup(groupId, name, chauffeurNames) {
    const cid = _cid();
    if (!cid || !groupId) return false;
    try {
      const r = await fetch(
        `${SB}/rest/v1/message_groups?id=eq.${groupId}&company_id=eq.${cid}`,
        { method: 'PATCH', headers: _h(), body: JSON.stringify({ name: name.trim().substring(0, 100) }) }
      );
      if (!r.ok) return false;
      await fetch(`${SB}/rest/v1/message_group_members?group_id=eq.${groupId}`,
        { method: 'DELETE', headers: _h() });
      if (chauffeurNames && chauffeurNames.length > 0) {
        await fetch(`${SB}/rest/v1/message_group_members`, {
          method: 'POST',
          headers: _h(),
          body: JSON.stringify(chauffeurNames.map(n => ({ group_id: groupId, chauffeur_name: n })))
        });
      }
      return true;
    } catch(e) { return false; }
  }

  /** Supprime un groupe (et ses messages via ON DELETE CASCADE) */
  async function deleteGroup(groupId) {
    const cid = _cid();
    if (!cid || !groupId) return false;
    try {
      const r = await fetch(
        `${SB}/rest/v1/message_groups?id=eq.${groupId}&company_id=eq.${cid}`,
        { method: 'DELETE', headers: _h() }
      );
      return r.ok;
    } catch(e) { return false; }
  }

  /** Charge les messages d'un groupe */
  async function loadGroupConversation(groupId) {
    if (!groupId) return [];
    try {
      const r = await fetch(
        `${SB}/rest/v1/messages?group_id=eq.${groupId}&order=created_at.asc&limit=200`,
        { headers: _h() }
      );
      if (!r.ok) return [];
      return await r.json();
    } catch(e) { return []; }
  }

  /** Envoie un message dans un groupe */
  async function sendGroupMessage(groupId, content) {
    const cid = _cid();
    if (!cid || !groupId || !content.trim()) return null;
    const role       = _role();
    const senderRole = role === 'chauffeur' ? 'chauffeur' : (role === 'chef_equipe' ? 'chef_equipe' : 'admin');
    try {
      const r = await fetch(`${SB}/rest/v1/messages`, {
        method: 'POST',
        headers: _h(),
        body: JSON.stringify({
          company_id:     cid,
          sender_role:    senderRole,
          sender_name:    _senderName(),
          chauffeur_name: '_GROUP_',
          content:        content.trim().substring(0, 2000),
          is_broadcast:   false,
          group_id:       groupId
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      return Array.isArray(data) ? data[0] : data;
    } catch(e) { return null; }
  }

  /** Marque comme lus les messages du groupe non envoyés par moi */
  async function markGroupRead(groupId) {
    const cid = _cid();
    if (!cid || !groupId) return;
    const s      = _session();
    const myName = s ? (s.name || s.chauffeur_nom || '') : '';
    if (!myName) return;
    try {
      await fetch(
        `${SB}/rest/v1/messages?group_id=eq.${groupId}&sender_name=neq.${encodeURIComponent(myName)}&read_at=is.null`,
        { method: 'PATCH', headers: _h(), body: JSON.stringify({ read_at: new Date().toISOString() }) }
      );
    } catch(e) {}
  }

  /** Démarre le suivi d'une conversation de groupe (Realtime + polling de secours) */
  function startGroupPolling(groupId, callback, intervalMs) {
    stopPolling();
    _onNewMessage = callback;
    const poll = async () => {
      const msgs = await loadGroupConversation(groupId);
      if (_onNewMessage) _onNewMessage(msgs);
    };
    poll();
    _pollTimer = _interval(poll, 10000);
    _startRealtime(null, groupId, () => {
      if (_pollTimer) { _clearInterval(_pollTimer); _pollTimer = _interval(poll, 30000); }
    }, poll);
  }

  return {
    loadConversation,
    loadConversationList,
    sendMessage,
    markConversationRead,
    getUnreadCount,
    startPolling,
    startInboxWatch,
    isRealtimeHealthy: () => _wsHealthy === true,
    stopPolling,
    startBadgePolling,
    stopBadgePolling,
    loadDriversList,
    loadGroups,
    loadGroupMembers,
    loadGroupList,
    createGroup,
    updateGroup,
    deleteGroup,
    loadGroupConversation,
    sendGroupMessage,
    markGroupRead,
    startGroupPolling,
    timeAgo
  };
})();

// ── AUTO-INIT BADGE (toutes les pages admin avec sidebar) ────────────
// Si un élément #nav-msg-badge est présent, on démarre le polling
// des messages non lus et on met à jour le badge automatiquement.
(function() {
  function initBadge() {
    const badge = document.getElementById('nav-msg-badge');
    if (!badge) return;
    // Ne pas re-initialiser si la page messagerie gère déjà son badge
    if (window._otMsgBadgeInitialized) return;
    window._otMsgBadgeInitialized = true;

    OT_MSG.startBadgePolling(function(count) {
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }, null, 60000); // toutes les 60s sur les pages secondaires (pages non-messagerie)
  }

  // Init différé : le badge des messages non lus n'est pas critique au chargement.
  // On laisse les fetches métier de la page principale partir d'abord (les 6
  // connexions HTTP du navigateur sont précieuses), puis on démarre le polling.
  function _scheduleBadge() { setTimeout(initBadge, 1500); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scheduleBadge);
  } else {
    _scheduleBadge();
  }
})();
