(() => {
  'use strict';

  const API_BASE = 'https://cm108-earthquake-monitor--main.108khamwo.deno.net';
  const POLL_MS = 30000;
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const SEEN_PREFIX = 'cm108_eq_seen_v1:';
  let busy = false;
  let renderedKey = '';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const formatTime = (iso) => {
    if (!iso) return '-';
    try {
      return new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      }).format(new Date(iso));
    } catch (_) { return iso; }
  };

  const eventKey = ev =>
    String(ev?.id || ev?.eventTime || 'unknown') + ':r' + String(ev?.revision || 1);

  const isRecent = ev => {
    const t = Date.parse(ev?.eventTime || '');
    if (!Number.isFinite(t)) return false;
    const age = Date.now() - t;
    return age >= -600000 && age <= MAX_AGE_MS;
  };

  const wasSeen = ev => {
    try { return localStorage.getItem(SEEN_PREFIX + eventKey(ev)) === '1'; }
    catch (_) { return false; }
  };

  const markSeen = ev => {
    try { localStorage.setItem(SEEN_PREFIX + eventKey(ev), '1'); }
    catch (_) {}
  };

  function ensureUi() {
    if (!document.getElementById('cm108-eq-style')) {
      const s = document.createElement('style');
      s.id = 'cm108-eq-style';
      s.textContent = `
      #cm108-eq-banner{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:10020;width:min(720px,calc(100vw - 16px));display:none;font-family:'Prompt','Noto Sans Thai',system-ui,sans-serif}
      .cm108-eq-banner-card{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:14px;box-shadow:0 10px 28px rgba(15,23,42,.18);color:#9a3412;cursor:pointer}
      .cm108-eq-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;border-radius:11px;background:#ea580c;color:#fff;font-size:18px}
      .cm108-eq-main{min-width:0;flex:1}.cm108-eq-title{font-size:13px;font-weight:600;line-height:1.45}.cm108-eq-sub{margin-top:2px;font-size:11px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cm108-eq-x{width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#9a3412;font-size:21px;cursor:pointer}
      #cm108-eq-modal{position:fixed;inset:0;z-index:10030;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.58);backdrop-filter:blur(3px);font-family:'Prompt','Noto Sans Thai',system-ui,sans-serif}
      .cm108-eq-card{width:min(460px,100%);overflow:hidden;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28)}
      .cm108-eq-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff7ed;border-bottom:1px solid #fed7aa}.cm108-eq-headtext{flex:1;min-width:0}.cm108-eq-headtext b{display:block;font-size:16px;font-weight:600;line-height:1.45;color:#9a3412}.cm108-eq-headtext span{display:block;margin-top:2px;font-size:11px;font-weight:400;color:#c2410c}
      .cm108-eq-close{width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#9a3412;font-size:24px;cursor:pointer}
      .cm108-eq-body{padding:16px}.cm108-eq-mag-wrap{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}.cm108-eq-mag{font-size:38px;line-height:1;font-weight:700;color:#dc2626}.cm108-eq-mag-label{font-size:12px;color:#64748b;font-weight:500}
      .cm108-eq-location{margin-bottom:11px;font-size:14px;line-height:1.6;font-weight:500;color:#1e293b}
      .cm108-eq-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cm108-eq-info{padding:9px 10px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.cm108-eq-info small{display:block;font-size:10px;font-weight:400;color:#94a3b8}.cm108-eq-info b{display:block;margin-top:2px;font-size:12px;font-weight:500;color:#334155}
      .cm108-eq-actions{display:flex;gap:8px;margin-top:14px}.cm108-eq-actions button,.cm108-eq-actions a{flex:1;min-height:40px;display:flex;align-items:center;justify-content:center;border-radius:11px;font:600 12px 'Prompt',sans-serif;text-decoration:none;cursor:pointer}
      .cm108-eq-dismiss{border:1px solid #e2e8f0;background:#fff;color:#475569}.cm108-eq-source{border:1px solid #ea580c;background:#ea580c;color:#fff}
      @media(max-width:520px){.cm108-eq-grid{grid-template-columns:1fr}.cm108-eq-body{padding:14px}}
      `;
      document.head.appendChild(s);
    }

    if (!document.getElementById('cm108-eq-banner')) {
      const b = document.createElement('div');
      b.id = 'cm108-eq-banner';
      document.body.appendChild(b);
    }

    if (!document.getElementById('cm108-eq-modal')) {
      const m = document.createElement('div');
      m.id = 'cm108-eq-modal';
      m.addEventListener('click', e => {
        if (e.target === m) m.style.display = 'none';
      });
      document.body.appendChild(m);
    }
  }

  function hideBanner() {
    const b = document.getElementById('cm108-eq-banner');
    if (b) b.style.display = 'none';
  }

  function closeModal() {
    const m = document.getElementById('cm108-eq-modal');
    if (m) m.style.display = 'none';
  }

  function showModal(ev, remember = false) {
    ensureUi();
    const m = document.getElementById('cm108-eq-modal');
    const updated = Number(ev?.revision || 1) > 1;
    const magnitude = ev?.magnitude == null ? '-' : esc(ev.magnitude);
    const depth = ev?.depthKm == null ? '-' : esc(ev.depthKm) + ' กม.';
    const coords = ev?.latitude != null && ev?.longitude != null
      ? esc(ev.latitude) + ', ' + esc(ev.longitude)
      : '-';
    const sourceUrl = /^https?:\/\//i.test(ev?.sourceUrl || '')
      ? ev.sourceUrl
      : 'https://earthquake.tmd.go.th/inside.html';

    m.innerHTML = `
      <div class="cm108-eq-card" role="dialog" aria-modal="true">
        <div class="cm108-eq-head">
          <div class="cm108-eq-icon">⚠️</div>
          <div class="cm108-eq-headtext">
            <b>${updated ? 'อัปเดตข้อมูลแผ่นดินไหวเชียงใหม่' : 'ตรวจพบแผ่นดินไหว จ.เชียงใหม่'}</b>
            <span>ข้อมูลจากกรมอุตุนิยมวิทยา</span>
          </div>
          <button class="cm108-eq-close" type="button">×</button>
        </div>
        <div class="cm108-eq-body">
          <div class="cm108-eq-mag-wrap">
            <div class="cm108-eq-mag">${magnitude}</div>
            <div class="cm108-eq-mag-label">ขนาดแผ่นดินไหว</div>
          </div>
          <div class="cm108-eq-location">${esc(ev?.location || 'จ.เชียงใหม่')}</div>
          <div class="cm108-eq-grid">
            <div class="cm108-eq-info"><small>เวลา</small><b>${esc(formatTime(ev?.eventTime))}</b></div>
            <div class="cm108-eq-info"><small>ความลึก</small><b>${depth}</b></div>
            <div class="cm108-eq-info"><small>พิกัด</small><b>${coords}</b></div>
            <div class="cm108-eq-info"><small>สถานะ</small><b>${updated ? 'ข้อมูลปรับปรุง' : 'เหตุใหม่'}</b></div>
          </div>
          <div class="cm108-eq-actions">
            <button class="cm108-eq-dismiss" type="button">ปิด</button>
            <a class="cm108-eq-source" href="${esc(sourceUrl)}" target="_blank" rel="noopener">ดูข้อมูลกรมอุตุฯ</a>
          </div>
        </div>
      </div>
    `;

    m.style.display = 'flex';
    m.querySelector('.cm108-eq-close')?.addEventListener('click', closeModal);
    m.querySelector('.cm108-eq-dismiss')?.addEventListener('click', closeModal);
    if (remember) markSeen(ev);
  }

  function showBanner(ev) {
    ensureUi();
    const b = document.getElementById('cm108-eq-banner');
    const updated = Number(ev?.revision || 1) > 1;
    const magnitude = ev?.magnitude == null ? 'ไม่ระบุขนาด' : 'ขนาด ' + esc(ev.magnitude);

    b.innerHTML = `
      <div class="cm108-eq-banner-card">
        <div class="cm108-eq-icon">⚠️</div>
        <div class="cm108-eq-main">
          <div class="cm108-eq-title">${updated ? 'อัปเดตข้อมูลแผ่นดินไหวเชียงใหม่' : 'แผ่นดินไหวเชียงใหม่'} · ${magnitude}</div>
          <div class="cm108-eq-sub">${esc(ev?.location || 'จ.เชียงใหม่')} · ${esc(formatTime(ev?.eventTime))}</div>
        </div>
        <button class="cm108-eq-x" type="button">×</button>
      </div>
    `;

    b.style.display = 'block';

    b.querySelector('.cm108-eq-x')?.addEventListener('click', e => {
      e.stopPropagation();
      hideBanner();
    });

    b.querySelector('.cm108-eq-banner-card')?.addEventListener('click', e => {
      if (!e.target.closest('.cm108-eq-x')) showModal(ev, false);
    });
  }

  async function poll() {
    if (busy || document.hidden) return;
    busy = true;

    try {
      const r = await fetch(API_BASE + '/api/latest?_=' + Date.now(), {
        cache: 'no-store'
      });

      if (!r.ok) throw new Error('HTTP ' + r.status);

      const data = await r.json();
      const ev = data?.latest;

      if (!ev || !isRecent(ev)) {
        hideBanner();
        return;
      }

      const key = eventKey(ev) + '|' + String(ev?.fingerprint || '');

      if (key !== renderedKey) {
        renderedKey = key;
        showBanner(ev);
      }

      if (!wasSeen(ev)) {
        showModal(ev, true);
      }
    } catch (_) {
      // เงียบเมื่อ API หรือ TMD มีปัญหา ป้องกัน false alert
    } finally {
      busy = false;
    }
  }

  function start() {
    ensureUi();
    poll();
    setInterval(poll, POLL_MS);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) poll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
