"use strict";

// The game side of the arcade's 🛒 shop drawer. A game registers its shop here; the arcade asks for the
// items and sends buy requests, and the game does the buying with its own rules and saves, exactly as
// its garage does. Nothing happens when a game is played on its own, outside the arcade.
//
//   NebulaShop.register({
//       title: 'Wheelie Life', currency: { name: 'Cash', icon: '💵' },
//       coins() { return 120; },                       // what the player has to spend
//       sections() { return [{ title, items: [item, ...] }]; },
//       buy(id) { return { ok: true, message: 'Bought X' }; }
//   });
//
// An item is { id, name, about, icon or swatch (a colour), stats: [text], label (button text), can (button
// enabled), done (true when it's equipped or maxed) }.

const NebulaShop = (function () {
    let shop = null;
    const inArcade = window.parent !== window;

    function view() {
        return { nebula: 'shop', title: shop.title, currency: shop.currency, coins: shop.coins(), sections: shop.sections() };
    }

    addEventListener('message', e => {
        if (!shop || e.origin !== location.origin || !e.data || !e.source) return;
        if (e.data.nebula === 'shop-hello') e.source.postMessage({ nebula: 'shop-ready' }, location.origin);
        else if (e.data.nebula === 'shop-open') e.source.postMessage(view(), location.origin);
        else if (e.data.nebula === 'shop-buy') {
            const result = shop.buy(String(e.data.id)) || {};
            e.source.postMessage({ ...view(), ok: !!result.ok, message: result.message || '' }, location.origin);
        }
    });

    function register(spec) {
        shop = spec;
        if (inArcade) window.parent.postMessage({ nebula: 'shop-ready' }, location.origin);
    }

    return { register };
})();
