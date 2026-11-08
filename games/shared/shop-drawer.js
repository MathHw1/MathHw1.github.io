"use strict";

// The arcade's 🛒 shop drawer. It only appears for games that register a shop (see shop.js), shows what
// the open game reports, and asks the game to do any buying. Prices and rules live in each game, so
// this file never needs to know about a game's items.

(function () {
    const frame = document.getElementById('frame');
    const panel = document.getElementById('panel');
    const bar = document.getElementById('playerBar');
    if (!frame || !panel || !bar) return;

    const css = document.createElement('style');
    css.textContent =
        '#shopBtn{display:none}#shopBtn.ready{display:inline-flex}' +
        '#shopBack{position:absolute;inset:0;z-index:20;background:rgba(5,7,14,.45);opacity:0;pointer-events:none;transition:opacity .2s}' +
        '#shopBack.open{opacity:1;pointer-events:auto}' +
        '#shopDrawer{position:absolute;top:0;right:0;bottom:0;z-index:21;width:min(400px,100%);display:flex;flex-direction:column;background:#10131c;' +
        'border-left:1px solid rgba(255,255,255,.1);box-shadow:-20px 0 40px rgba(0,0,0,.4);transform:translateX(105%);transition:transform .22s ease;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif}' +
        '#shopDrawer.open{transform:none}' +
        '#shopDrawer header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}' +
        '#shopDrawer header h2{margin:0;flex:1;font-size:17px}' +
        '#shopDrawer .wallet{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:800}' +
        '#shopDrawer .shut{width:40px;height:40px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:18px;cursor:pointer}' +
        '#shopList{flex:1;overflow-y:auto;padding:4px 14px 16px;-webkit-overflow-scrolling:touch;touch-action:pan-y}' +
        '#shopList h3{margin:16px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}' +
        '.shop-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.06)}' +
        '.shop-item .pic{flex:none;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-size:20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)}' +
        '.shop-item .info{flex:1;min-width:0}.shop-item b{display:block;font-size:15px}' +
        '.shop-item small{display:block;color:#94a3b8;font-size:12.5px;line-height:1.35}' +
        '.shop-item .stats{color:#86efac}' +
        '.shop-item button{flex:none;min-width:84px;min-height:44px;padding:0 12px;border:0;border-radius:10px;font:700 14px system-ui,sans-serif;color:#fff;background:#7c3aed;cursor:pointer;touch-action:manipulation}' +
        '.shop-item button:disabled{background:rgba(255,255,255,.08);color:#94a3b8;cursor:default}' +
        '.shop-item button.done{background:rgba(34,197,94,.18);color:#86efac}' +
        '#shopToast{min-height:20px;padding:8px 14px;border-top:1px solid rgba(255,255,255,.08);font-size:13.5px;color:#fde68a}';
    document.head.appendChild(css);

    const button = document.createElement('button');
    button.id = 'shopBtn';
    button.className = 'px-3 py-2 text-sm rounded-lg bg-white/5 hover:bg-white/10 transition items-center gap-1';
    button.title = 'Shop';
    button.innerHTML = '🛒 <span class="hidden sm:inline">Shop</span>';
    bar.querySelector('div').prepend(button);

    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    const back = document.createElement('div');
    back.id = 'shopBack';
    const drawer = document.createElement('aside');
    drawer.id = 'shopDrawer';
    drawer.setAttribute('aria-label', 'Shop');
    drawer.innerHTML = '<header><h2 id="shopTitle">Shop</h2><span class="wallet" id="shopWallet"></span><button class="shut" id="shopShut" aria-label="Close shop">✕</button></header>' +
        '<div id="shopList"></div><div id="shopToast"></div>';
    panel.append(back, drawer);

    const $ = id => document.getElementById(id);
    const ask = data => { try { frame.contentWindow.postMessage(data, location.origin); } catch (_) {} };
    const open = () => { drawer.classList.add('open'); back.classList.add('open'); $('shopToast').textContent = ''; ask({ nebula: 'shop-open' }); };
    const close = () => { drawer.classList.remove('open'); back.classList.remove('open'); };

    function render(shop) {
        $('shopTitle').textContent = '🛒 ' + shop.title;
        $('shopWallet').textContent = shop.currency.icon + ' ' + Number(shop.coins).toLocaleString();
        const list = $('shopList');
        const keep = list.scrollTop;
        list.textContent = '';
        for (const section of shop.sections) {
            const heading = document.createElement('h3');
            heading.textContent = section.title;
            list.appendChild(heading);
            for (const item of section.items) {
                const row = document.createElement('div'), pic = document.createElement('span'), info = document.createElement('div');
                const name = document.createElement('b'), about = document.createElement('small'), act = document.createElement('button');
                row.className = 'shop-item';
                pic.className = 'pic';
                if (item.swatch) pic.style.background = item.swatch;
                else pic.textContent = item.icon || '⭐';
                info.className = 'info';
                name.textContent = item.name;
                about.textContent = item.about || '';
                info.append(name, about);
                if (item.stats && item.stats.length) {
                    const stats = document.createElement('small');
                    stats.className = 'stats';
                    stats.textContent = item.stats.join(' · ');
                    info.appendChild(stats);
                }
                act.textContent = item.label;
                act.disabled = !item.can;
                if (item.done) act.className = 'done';
                act.addEventListener('click', () => ask({ nebula: 'shop-buy', id: item.id }));
                row.append(pic, info, act);
                list.appendChild(row);
            }
        }
        list.scrollTop = keep;
    }

    addEventListener('message', e => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return;
        if (e.data.nebula === 'shop-ready') button.classList.add('ready');
        else if (e.data.nebula === 'shop') {
            render(e.data);
            if (e.data.message) $('shopToast').textContent = e.data.message;
        }
    });
    // Each time a game (or nothing) loads, hide the shop, then ask the new game whether it has one.
    frame.addEventListener('load', () => { button.classList.remove('ready'); close(); ask({ nebula: 'shop-hello' }); });

    button.addEventListener('click', () => (drawer.classList.contains('open') ? close() : open()));
    $('shopShut').addEventListener('click', close);
    back.addEventListener('click', close);
})();
