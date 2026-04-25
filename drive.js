/**
 * drive.js — Google Drive backup/restore for LexLedger
 * Uses Google Identity Services (browser-only, no client secret).
 * Token lives in memory only; expires after ~1 hour.
 */
const Drive = (() => {
  const CLIENT_ID  = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';
  const SCOPE      = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME  = 'lexledger-backup.json';

  let _tokenClient = null;
  let _token       = null;

  function _gisReady() {
    return typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
  }

  function _initClient() {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPE,
      callback:  '',           // set before each request
    });
  }

  async function _ensureToken() {
    if (_token) return _token;
    if (!_gisReady()) throw new Error('Google Identity Services לא נטען');
    if (!_tokenClient) _initClient();

    return new Promise((resolve, reject) => {
      _tokenClient.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        _token = resp.access_token;
        setTimeout(() => { _token = null; }, 3500 * 1000);
        resolve(_token);
      };
      _tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  // ── Drive API helpers ──────────────────────────────────

  async function _findFileId(token) {
    const q   = `name='${FILE_NAME}' and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id)`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const { files } = await res.json();
    return files && files.length ? files[0].id : null;
  }

  async function _uploadNew(token, json) {
    const meta = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
    const body = `--bound\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--bound\r\nContent-Type: application/json\r\n\r\n${json}\r\n--bound--`;
    const res  = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=bound' },
        body,
      }
    );
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  }

  async function _updateFile(token, fileId, json) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    json,
      }
    );
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
  }

  // ── Public API ─────────────────────────────────────────

  async function saveBackup() {
    try {
      const token  = await _ensureToken();
      const data   = await DB.backup.export();
      const json   = JSON.stringify(data, null, 2);
      const fileId = await _findFileId(token);
      if (fileId) {
        await _updateFile(token, fileId, json);
      } else {
        await _uploadNew(token, json);
      }
      UI.toast('גיבוי נשמר ב-Google Drive ✓', 'success');
    } catch (err) {
      if (err.message === 'popup_closed_by_user') return;
      UI.toast('שגיאה בגיבוי לדרייב: ' + err.message, 'error');
    }
  }

  async function restoreBackup() {
    try {
      const token  = await _ensureToken();
      const fileId = await _findFileId(token);
      if (!fileId) { UI.toast('לא נמצא גיבוי ב-Google Drive', 'warning'); return; }

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
      const data = await res.json();

      UI.confirm(
        'שחזור גיבוי מ-Google Drive ידרוס את כל הנתונים הקיימים. האם להמשיך?',
        async () => {
          await DB.backup.import(data);
          UI.toast('שחזור מ-Google Drive הושלם!', 'success');
          UI.closeModal();
          App.refreshCurrentView();
        }
      );
    } catch (err) {
      if (err.message === 'popup_closed_by_user') return;
      UI.toast('שגיאה בשחזור מדרייב: ' + err.message, 'error');
    }
  }

  return { saveBackup, restoreBackup };
})();
window.Drive = Drive;
