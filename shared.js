/**
 * OMAV Suite — shared.js
 * Versione: 2.0
 *
 * Contiene:
 *  - OMAV.KEYS        → chiavi localStorage
 *  - OMAV.root        → gestione path cartella di lavoro (via server API)
 *  - OMAV.fs          → filesystem API (ls, read, write, mkdir, rename, delete)
 *  - OMAV.commessa    → commessa attiva
 *  - OMAV.machines    → catalogo macchine
 *  - OMAV.ui          → toast, setStatus
 *  - Utility globali  → fileIcon, sanitize, esc, formatSize
 */

const OMAV = {

  // ══════════════════════════════════════════════════
  // CHIAVI localStorage
  // ══════════════════════════════════════════════════
  KEYS: {
    ACTIVE_COMMESSA : 'omav_active_commessa',
    ROOT_PATH       : 'omav_root_path',
    THEME           : 'theme',
  },

  // ══════════════════════════════════════════════════
  // ROOT PATH — cartella di lavoro
  // ══════════════════════════════════════════════════
  root: {

    /** Salva il path della cartella di lavoro */
    set(path) {
      try { localStorage.setItem(OMAV.KEYS.ROOT_PATH, path || ''); } catch(e) {}
    },

    /** Legge il path della cartella di lavoro */
    get() {
      try { return localStorage.getItem(OMAV.KEYS.ROOT_PATH) || null; } catch(e) { return null; }
    },

    /** Cancella il path */
    clear() {
      try { localStorage.removeItem(OMAV.KEYS.ROOT_PATH); } catch(e) {}
    },

    /**
     * Verifica che il path salvato sia ancora accessibile sul server.
     * Ritorna true/false.
     */
    async verify() {
      const p = this.get();
      if (!p) return false;
      try {
        const r = await fetch(`/api/ls?path=${encodeURIComponent(p)}`);
        return r.ok;
      } catch(e) { return false; }
    },

    /**
     * Apre un dialog per far scegliere il path all'utente.
     * Usa un prompt semplice — in futuro si può migliorare con un picker dedicato.
     * Salva e ritorna il path scelto, o null se annullato.
     */
    async pick(currentPath) {
      const p = prompt('Inserisci il percorso della cartella di lavoro:', currentPath || 'C:\\');
      if (!p || !p.trim()) return null;
      const clean = p.trim();
      // Verifica che esista
      try {
        const r = await fetch(`/api/ls?path=${encodeURIComponent(clean)}`);
        if (!r.ok) {
          OMAV.ui.toast('Cartella non trovata o non accessibile.', 'err');
          return null;
        }
        this.set(clean);
        return clean;
      } catch(e) {
        OMAV.ui.toast('Errore di connessione al server.', 'err');
        return null;
      }
    },

  },

  // ══════════════════════════════════════════════════
  // FILESYSTEM API  (tutte le operazioni su disco)
  // ══════════════════════════════════════════════════
  fs: {

    /**
     * Lista il contenuto di una cartella.
     * Ritorna array di { name, kind:'file'|'directory', size?, ext? }
     * oppure [] in caso di errore.
     */
    async ls(path) {
      try {
        const r = await fetch(`/api/ls?path=${encodeURIComponent(path)}`);
        if (!r.ok) return [];
        return await r.json();
      } catch(e) { return []; }
    },

    /**
     * Legge un file testuale.
     * Ritorna la stringa, oppure null in caso di errore.
     */
    async read(path) {
      try {
        const r = await fetch(`/api/read?path=${encodeURIComponent(path)}`);
        if (!r.ok) return null;
        return await r.text();
      } catch(e) { return null; }
    },

    /**
     * Legge un file e lo parsa come JSON.
     * Ritorna l'oggetto, oppure null in caso di errore.
     */
    async readJSON(path) {
      const txt = await this.read(path);
      if (!txt) return null;
      try { return JSON.parse(txt); } catch(e) { return null; }
    },

    /**
     * Scrive un file (testo o binario base64).
     * body: stringa testo  → { path, content }
     * Ritorna true/false.
     */
    async write(path, content) {
      try {
        const r = await fetch('/api/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content }),
        });
        return r.ok;
      } catch(e) { return false; }
    },

    /**
     * Scrive un file da un ArrayBuffer (upload binario).
     * Ritorna true/false.
     */
    async writeBuffer(path, buffer) {
      try {
        const bytes = Array.from(new Uint8Array(buffer));
        const r = await fetch('/api/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, buffer: bytes }),
        });
        return r.ok;
      } catch(e) { return false; }
    },

    /**
     * Crea una cartella (e tutte le parent necessarie).
     * Ritorna true/false.
     */
    async mkdir(path) {
      try {
        const r = await fetch('/api/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        return r.ok;
      } catch(e) { return false; }
    },

    /**
     * Rinomina o sposta un file/cartella.
     * Ritorna true/false.
     */
    async rename(oldPath, newPath) {
      try {
        const r = await fetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath, newPath }),
        });
        return r.ok;
      } catch(e) { return false; }
    },

    /**
     * Elimina un file.
     * Ritorna true/false.
     */
    async delete(path) {
      try {
        const r = await fetch(`/api/delete?path=${encodeURIComponent(path)}`, {
          method: 'DELETE',
        });
        return r.ok;
      } catch(e) { return false; }
    },

    /**
     * Controlla se un path esiste.
     * Ritorna true/false.
     */
    async exists(path) {
      try {
        const r = await fetch(`/api/exists?path=${encodeURIComponent(path)}`);
        if (!r.ok) return false;
        const d = await r.json();
        return d.exists === true;
      } catch(e) { return false; }
    },

  },

  // ══════════════════════════════════════════════════
  // COMMESSA ATTIVA
  // ══════════════════════════════════════════════════
  commessa: {

    set(id) {
      try { localStorage.setItem(OMAV.KEYS.ACTIVE_COMMESSA, id || ''); } catch(e) {}
    },

    get() {
      try { return localStorage.getItem(OMAV.KEYS.ACTIVE_COMMESSA) || null; } catch(e) { return null; }
    },

    clear() {
      try { localStorage.removeItem(OMAV.KEYS.ACTIVE_COMMESSA); } catch(e) {}
    },

  },

  // ══════════════════════════════════════════════════
  // CATALOGO MACCHINE
  // ══════════════════════════════════════════════════
  machines: {
    _cache: null,

    /**
     * Carica il catalogo macchine dal file JSON del server.
     * Usa cache in memoria per evitare richieste ripetute.
     * Ritorna array di macchine.
     */
    async load(forceReload = false) {
      if (this._cache && !forceReload) return this._cache;
      try {
        const r = await fetch('/machine_catalog.json');
        if (!r.ok) return [];
        this._cache = await r.json();
        return this._cache;
      } catch(e) { return []; }
    },

    /** Cerca macchine per codice o descrizione */
    async search(query) {
      const all = await this.load();
      if (!query) return all;
      const q = query.toLowerCase();
      return all.filter(m =>
        (m.codice || '').toLowerCase().includes(q) ||
        (m.descrizione || '').toLowerCase().includes(q)
      );
    },

  },

  // ══════════════════════════════════════════════════
  // UI — Toast e Status bar
  // ══════════════════════════════════════════════════
  ui: {
    _toastTimer: null,

    /**
     * Mostra una notifica temporanea.
     * type: 'ok' | 'err' | 'warn'
     */
    toast(msg, type = 'ok') {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.className = `toast ${type} show`;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
    },

    /**
     * Aggiorna la status bar in fondo alla pagina.
     * type: 'ok' | 'warn' | 'err' | '' (idle)
     */
    setStatus(msg, type = '') {
      const txt = document.getElementById('statusText');
      const dot = document.getElementById('statusDot');
      if (txt) txt.textContent = msg;
      if (dot) dot.className = 'dot ' + (type || 'idle');
    },

  },

  // ══════════════════════════════════════════════════
  // NAVIGAZIONE
  // ══════════════════════════════════════════════════
  goHome() {
    window.location.href = 'index.html';
  },

};

// ══════════════════════════════════════════════════
// UTILITY GLOBALI
// ══════════════════════════════════════════════════

/** Icona emoji in base all'estensione del file */
function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf:  '📄',
    docx: '📝', doc: '📝',
    xlsx: '📊', xls: '📊',
    dwg:  '📐', dxf: '📐',
    jpg:  '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4:  '🎬', avi: '🎬', mov: '🎬',
    zip:  '🗜️', rar: '🗜️', '7z': '🗜️',
    txt:  '📃',
  };
  return map[ext] || '📄';
}

/** Rimuove caratteri non validi per nomi file/cartella */
function sanitize(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_').trim();
}

/** Escape HTML per prevenire XSS */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Formatta byte in stringa leggibile */
function formatSize(bytes) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/** Join path in modo cross-platform (usa backslash su Windows) */
function pathJoin(...parts) {
  return parts
    .filter(Boolean)
    .join('\\')
    .replace(/[/\\]+/g, '\\');
}

/** Estrae il nome del file da un path completo */
function pathBasename(p) {
  return String(p).replace(/.*[/\\]/, '');
}

/** Estrae la directory da un path completo */
function pathDirname(p) {
  const s = String(p);
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return idx >= 0 ? s.slice(0, idx) : s;
}

// Alias comodi (compatibilità con codice esistente)
const toast     = (msg, type) => OMAV.ui.toast(msg, type);
const setStatus = (msg, type) => OMAV.ui.setStatus(msg, type);
