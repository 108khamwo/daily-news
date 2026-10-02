(() => {
  'use strict';

  const DATA_JS_URL = 'https://cm108.com/wp-content/uploads/cm108-earthquake/latest.js';
  const POLL_MS = 30000;
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const POPUP_MAX_AGE_MS = 15 * 60 * 1000;
  const SEEN_PREFIX = 'cm108_eq_seen_v2:';

  let busy = false;
  let renderedBannerKey = '';
  let currentItems = [];
  let modalMode = '';
  let currentAlertId = '';
  const alertQueue = [];
  const queuedIds = new Set();

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const eventTimeMs = (ev) => {
    const t = Date.parse(ev?.eventTime || '');
    return Number.isFinite(t) ? t : 0;
  };

  const eventAgeMs = (ev) => {
    const t = eventTimeMs(ev);
    return t ? Date.now() - t : Number.POSITIVE_INFINITY;
  };

  const isWithin24h = (ev) => {
    const age = eventAgeMs(ev);
    return age >= -10 * 60 * 1000 && age <= MAX_AGE_MS;
  };

  const isLiveAlert = (ev) => {
    const age = eventAgeMs(ev);
    return age >= -10 * 60 * 1000 && age <= POPUP_MAX_AGE_MS;
  };

  const eventId = (ev) => String(ev?.id || ev?.eventTime || 'unknown');

  const wasSeen = (ev) => {
    try { return localStorage.getItem(SEEN_PREFIX + eventId(ev)) === '1'; }
    catch (_) { return false; }
  };

  const markSeen = (ev) => {
    try { localStorage.setItem(SEEN_PREFIX + eventId(ev), '1'); }
    catch (_) {}
  };

  const formatTime = (iso) => {
    if (!iso) return '-';
    try {
      return new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  };

  const formatShortTime = (iso) => {
    if (!iso) return '-';
    try {
      return new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit', minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  };

  function ensureUi() {
    if (!document.getElementById('cm108-eq-style')) {
      const style = document.createElement('style');
      style.id = 'cm108-eq-style';
      style.textContent = `
        #cm108-eq-banner{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:10020;width:min(720px,calc(100vw - 16px));display:none;font-family:'Prompt','Noto Sans Thai',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .cm108-eq-banner-card{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:14px;box-shadow:0 10px 28px rgba(15,23,42,.18);color:#9a3412;cursor:pointer}
        .cm108-eq-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;border-radius:11px;background:#ea580c;color:#fff;font-size:18px}
        .cm108-eq-main{min-width:0;flex:1}.cm108-eq-title{font-size:13px;font-weight:600;line-height:1.45}.cm108-eq-sub{margin-top:2px;font-size:11px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cm108-eq-x{width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#9a3412;font-size:21px;cursor:pointer}
        #cm108-eq-modal{position:fixed;inset:0;z-index:10030;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.58);backdrop-filter:blur(3px);font-family:'Prompt','Noto Sans Thai',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .cm108-eq-card{width:min(460px,100%);max-height:min(720px,calc(100dvh - 36px));overflow:hidden;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);display:flex;flex-direction:column}
        .cm108-eq-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff7ed;border-bottom:1px solid #fed7aa;flex:0 0 auto}
        .cm108-eq-headtext{flex:1;min-width:0}.cm108-eq-headtext b{display:block;font-size:16px;font-weight:600;line-height:1.45;color:#9a3412}.cm108-eq-headtext span{display:block;margin-top:2px;font-size:11px;font-weight:400;color:#c2410c}
        .cm108-eq-close{width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#9a3412;font-size:24px;cursor:pointer;flex:0 0 auto}
        .cm108-eq-body{padding:16px;overflow:auto}.cm108-eq-mag-wrap{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}.cm108-eq-mag{font-size:38px;line-height:1;font-weight:700;color:#dc2626}.cm108-eq-mag-label{font-size:12px;color:#64748b;font-weight:500}
        .cm108-eq-location{margin-bottom:11px;font-size:14px;line-height:1.6;font-weight:500;color:#1e293b}
        .cm108-eq-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cm108-eq-info{padding:9px 10px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.cm108-eq-info small{display:block;font-size:10px;font-weight:400;color:#94a3b8}.cm108-eq-info b{display:block;margin-top:2px;font-size:12px;font-weight:500;color:#334155}
        .cm108-eq-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.cm108-eq-actions button,.cm108-eq-actions a{flex:1;min-height:40px;display:flex;align-items:center;justify-content:center;border-radius:11px;font:600 12px 'Prompt',sans-serif;text-decoration:none;cursor:pointer;padding:0 10px;box-sizing:border-box}.cm108-eq-dismiss{border:1px solid #e2e8f0;background:#fff;color:#475569}.cm108-eq-source{border:1px solid #ea580c;background:#ea580c;color:#fff}.cm108-eq-report{border:1px solid #2563eb;background:#eff6ff;color:#1d4ed8}
        .cm108-eq-summary{padding:10px 12px;margin-bottom:10px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:500;line-height:1.55}
        .cm108-eq-history{display:flex;flex-direction:column;gap:8px}.cm108-eq-history-row{display:grid;grid-template-columns:54px 1fr auto;gap:9px;align-items:center;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
        .cm108-eq-history-mag{font-size:22px;line-height:1;font-weight:700;color:#dc2626}.cm108-eq-history-main{min-width:0}.cm108-eq-history-place{font-size:12px;font-weight:500;color:#334155;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm108-eq-history-meta{margin-top:3px;font-size:10px;font-weight:400;color:#94a3b8}.cm108-eq-history-link{font-size:11px;font-weight:600;color:#ea580c;text-decoration:none;white-space:nowrap}
        @media(max-width:520px){.cm108-eq-grid{grid-template-columns:1fr}.cm108-eq-body{padding:14px}.cm108-eq-history-row{grid-template-columns:48px 1fr}.cm108-eq-history-link{grid-column:2;justify-self:start}.cm108-eq-card{max-height:calc(100dvh - 24px)}.cm108-eq-actions button,.cm108-eq-actions a{flex:1 1 100%}}
      `;
      document.head.appendChild(style);
    }

    if (!document.getElementById('cm108-eq-banner')) {
      const banner = document.createElement('div');
      banner.id = 'cm108-eq-banner';
      document.body.appendChild(banner);
    }

    if (!document.getElementById('cm108-eq-modal')) {
      const modal = document.createElement('div');
      modal.id = 'cm108-eq-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
      document.body.appendChild(modal);
    }
  }

  function hideBanner() {
    const banner = document.getElementById('cm108-eq-banner');
    if (banner) banner.style.display = 'none';
  }

  function isModalOpen() {
    const modal = document.getElementById('cm108-eq-modal');
    return !!modal && modal.style.display === 'flex';
  }

  function closeModal() {
    const modal = document.getElementById('cm108-eq-modal');
    if (modal) modal.style.display = 'none';
    modalMode = '';
    currentAlertId = '';
    setTimeout(showNextQueuedAlert, 0);
  }

  function sourceUrlOf(ev) {
    return /^https?:\/\//i.test(ev?.sourceUrl || '')
      ? ev.sourceUrl
      : 'https://earthquake.tmd.go.th/inside.html';
  }

  function showEventModal(ev, mode = 'detail') {
    ensureUi();
    const modal = document.getElementById('cm108-eq-modal');
    const historical = !isLiveAlert(ev);
    const updated = Number(ev?.revision || 1) > 1;
    const magnitude = ev?.magnitude == null ? '-' : esc(ev.magnitude);
    const depth = ev?.depthKm == null ? '-' : esc(ev.depthKm) + ' กม.';
    const coords = ev?.latitude != null && ev?.longitude != null
      ? esc(ev.latitude) + ', ' + esc(ev.longitude)
      : '-';

    let title = 'ข้อมูลแผ่นดินไหว จ.เชียงใหม่';
    let statusText = updated ? 'ข้อมูลปรับปรุง' : 'เหตุล่าสุด';

    if (mode === 'alert') {
      title = 'ตรวจพบแผ่นดินไหว จ.เชียงใหม่';
      statusText = 'เหตุใหม่';
    } else if (historical) {
      title = 'แผ่นดินไหวในช่วง 24 ชั่วโมงที่ผ่านมา';
      statusText = 'ย้อนหลัง';
    }

    modal.innerHTML = `
      <div class="cm108-eq-card" role="dialog" aria-modal="true">
        <div class="cm108-eq-head">
          <div class="cm108-eq-icon">⚠️</div>
          <div class="cm108-eq-headtext">
            <b>${title}</b>
            <span>ข้อมูลจากกรมอุตุนิยมวิทยา</span>
          </div>
          <button class="cm108-eq-close" type="button" aria-label="ปิด">×</button>
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
            <div class="cm108-eq-info"><small>สถานะ</small><b>${statusText}</b></div>
          </div>
          <div class="cm108-eq-actions">
            <button class="cm108-eq-dismiss" type="button">ปิด</button>
            <a class="cm108-eq-report" href="https://tmd-earthquake-report.108khamwo.workers.dev/" target="_blank" rel="noopener">สร้างภาพรายงานแผ่นดินไหว</a>
            <a class="cm108-eq-source" href="${esc(sourceUrlOf(ev))}" target="_blank" rel="noopener">ดูข้อมูลกรมอุตุฯ</a>
          </div>
        </div>
      </div>
    `;

    modalMode = mode;
    currentAlertId = mode === 'alert' ? eventId(ev) : '';
    modal.style.display = 'flex';
    modal.querySelector('.cm108-eq-close')?.addEventListener('click', closeModal);
    modal.querySelector('.cm108-eq-dismiss')?.addEventListener('click', closeModal);

    if (mode === 'alert') markSeen(ev);
  }

  function showHistoryModal(items) {
    ensureUi();
    const modal = document.getElementById('cm108-eq-modal');
    const sorted = [...items].filter(isWithin24h).sort((a, b) => eventTimeMs(b) - eventTimeMs(a));
    if (!sorted.length) return;

    const latest = sorted[0];
    const latestMag = latest?.magnitude == null ? '-' : esc(latest.magnitude);
    const rows = sorted.map((ev) => {
      const mag = ev?.magnitude == null ? '-' : esc(ev.magnitude);
      const depth = ev?.depthKm == null ? '-' : esc(ev.depthKm) + ' กม.';
      return `
        <div class="cm108-eq-history-row">
          <div class="cm108-eq-history-mag">${mag}</div>
          <div class="cm108-eq-history-main">
            <div class="cm108-eq-history-place">${esc(ev?.location || 'จ.เชียงใหม่')}</div>
            <div class="cm108-eq-history-meta">${esc(formatTime(ev?.eventTime))} · ลึก ${depth}</div>
          </div>
          <a class="cm108-eq-history-link" href="${esc(sourceUrlOf(ev))}" target="_blank" rel="noopener">กรมอุตุฯ</a>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="cm108-eq-card" role="dialog" aria-modal="true">
        <div class="cm108-eq-head">
          <div class="cm108-eq-icon">⚠️</div>
          <div class="cm108-eq-headtext">
            <b>แผ่นดินไหวเชียงใหม่ในช่วง 24 ชั่วโมง</b>
            <span>พบ ${sorted.length} ครั้ง · ล่าสุดขนาด ${latestMag} เวลา ${esc(formatShortTime(latest?.eventTime))} น.</span>
          </div>
          <button class="cm108-eq-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="cm108-eq-body">
          <div class="cm108-eq-history">${rows}</div>
          <div class="cm108-eq-actions">
            <button class="cm108-eq-dismiss" type="button">ปิด</button>
            <a class="cm108-eq-report" href="https://tmd-earthquake-report.108khamwo.workers.dev/" target="_blank" rel="noopener">สร้างภาพรายงานแผ่นดินไหว</a>
            <a class="cm108-eq-source" href="https://earthquake.tmd.go.th/inside.html" target="_blank" rel="noopener">ดูทั้งหมดที่กรมอุตุฯ</a>
          </div>
        </div>
      </div>
    `;

    modalMode = 'history';
    currentAlertId = '';
    modal.style.display = 'flex';
    modal.querySelector('.cm108-eq-close')?.addEventListener('click', closeModal);
    modal.querySelector('.cm108-eq-dismiss')?.addEventListener('click', closeModal);
  }

  function showBanner(items) {
    ensureUi();
    const banner = document.getElementById('cm108-eq-banner');
    const sorted = [...items].filter(isWithin24h).sort((a, b) => eventTimeMs(b) - eventTimeMs(a));

    if (!sorted.length) {
      hideBanner();
      return;
    }

    const latest = sorted[0];
    const count = sorted.length;
    const live = isLiveAlert(latest);
    const magnitude = latest?.magnitude == null ? 'ไม่ระบุขนาด' : 'ขนาด ' + esc(latest.magnitude);

    let title;
    if (count > 1) {
      title = live
        ? `แผ่นดินไหวเชียงใหม่ต่อเนื่อง ${count} ครั้ง · ล่าสุด${magnitude}`
        : `ในช่วง 24 ชั่วโมงที่ผ่านมา · แผ่นดินไหวเชียงใหม่ ${count} ครั้ง · ล่าสุด${magnitude}`;
    } else {
      title = live
        ? `แผ่นดินไหวเชียงใหม่ · ${magnitude}`
        : `ในช่วง 24 ชั่วโมงที่ผ่านมา · แผ่นดินไหวเชียงใหม่ · ${magnitude}`;
    }

    banner.innerHTML = `
      <div class="cm108-eq-banner-card">
        <div class="cm108-eq-icon">⚠️</div>
        <div class="cm108-eq-main">
          <div class="cm108-eq-title">${title}</div>
          <div class="cm108-eq-sub">ล่าสุด ${esc(latest?.location || 'จ.เชียงใหม่')} · ${esc(formatTime(latest?.eventTime))}</div>
        </div>
        <button class="cm108-eq-x" type="button" aria-label="ซ่อน">×</button>
      </div>
    `;

    banner.style.display = 'block';
    banner.querySelector('.cm108-eq-x')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideBanner();
    });
    banner.querySelector('.cm108-eq-banner-card')?.addEventListener('click', (e) => {
      if (e.target.closest('.cm108-eq-x')) return;
      if (currentItems.length > 1) showHistoryModal(currentItems);
      else if (currentItems[0]) showEventModal(currentItems[0], 'detail');
    });
  }

  function queueFreshAlerts(items) {
    const fresh = [...items]
      .filter((ev) => isLiveAlert(ev) && !wasSeen(ev))
      .sort((a, b) => eventTimeMs(a) - eventTimeMs(b));

    for (const ev of fresh) {
      const id = eventId(ev);
      if (!id || id === currentAlertId || queuedIds.has(id)) continue;
      queuedIds.add(id);
      alertQueue.push(ev);
    }

    showNextQueuedAlert();
  }

  function showNextQueuedAlert() {
    if (isModalOpen()) return;

    while (alertQueue.length) {
      const ev = alertQueue.shift();
      const id = eventId(ev);
      queuedIds.delete(id);

      if (!isLiveAlert(ev) || wasSeen(ev)) continue;
      showEventModal(ev, 'alert');
      return;
    }
  }

  async function poll() {
    if (busy || document.hidden) return;
    busy = true;

    try {
      const data = await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('earthquake data timeout'));
        }, 8000);
        const cleanup = () => {
          clearTimeout(timer);
          script.onload = null;
          script.onerror = null;
          script.remove();
        };
        script.async = true;
        script.src = DATA_JS_URL + '?_=' + Date.now();
        script.onload = () => {
          const payload = window.CM108_EQ_DATA;
          cleanup();
          if (!payload || typeof payload !== 'object') {
            reject(new Error('invalid earthquake payload'));
            return;
          }
          resolve(payload);
        };
        script.onerror = () => {
          cleanup();
          reject(new Error('earthquake data load failed'));
        };
        document.head.appendChild(script);
      });
      let items = Array.isArray(data?.recent24?.items) ? data.recent24.items : [];

      if (!items.length && data?.latest && isWithin24h(data.latest)) {
        items = [data.latest];
      }

      items = items
        .filter(isWithin24h)
        .sort((a, b) => eventTimeMs(b) - eventTimeMs(a));

      currentItems = items;

      if (!items.length) {
        hideBanner();
        renderedBannerKey = '';
        return;
      }

      const latest = items[0];
      const bannerKey = `${items.length}|${eventId(latest)}|${latest?.fingerprint || ''}`;
      if (bannerKey !== renderedBannerKey) {
        renderedBannerKey = bannerKey;
        showBanner(items);
      }

      queueFreshAlerts(items);
    } catch (_) {
      // Silent by design: upstream/network errors must never look like an earthquake alert.
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
