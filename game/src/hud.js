// hud.js — everything flat on the glass: bars, numbers, feed, menus.
//
// The DOM skeleton lives in index.html; this module owns what it says.
// It reads the one state store each frame (health, ammo, money, the phase
// clock) and turns events into moments: a kill in the feed, a banner when
// the round lands, the white of a flash pellet, the buy menu's grid. The
// buy menu spends through round.js's buyItem — the same till the bots use.

import { PHASE, TEAM_ATK } from './state.js';
import { ARMOR_PRICE, GRENADES, WEAPONS, heldWeapon, spreadFor } from './weapons.js';
import { buyItem } from './round.js';

const BUY_ITEMS = [
  { item: 'scatter', key: '1' },
  { item: 'raptor', key: '2' },
  { item: 'longarm', key: '3' },
  { item: 'armor', key: '4' },
  { item: 'frag', key: '5' },
  { item: 'smoke', key: '6' },
  { item: 'flash', key: '7' },
];

function itemName(item) {
  if (item === 'armor') return 'Kevlar Vest';
  if (WEAPONS[item] !== undefined) return WEAPONS[item].name;
  return GRENADES[item].name;
}
function itemPrice(item) {
  if (item === 'armor') return ARMOR_PRICE;
  if (WEAPONS[item] !== undefined) return WEAPONS[item].price;
  return GRENADES[item].price;
}
function itemBlurb(item) {
  if (item === 'armor') return 'Soaks 45% of every hit';
  if (WEAPONS[item] !== undefined) return WEAPONS[item].blurb;
  return GRENADES[item].blurb;
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud(state) {
  const el = (id) => document.getElementById(id);
  const root = {
    health: el('health-fill'),
    healthNum: el('health-num'),
    armorTag: el('armor-tag'),
    ammoMag: el('ammo-mag'),
    ammoReserve: el('ammo-reserve'),
    weaponName: el('weapon-name'),
    money: el('money'),
    timer: el('timer'),
    score: el('score-line'),
    objective: el('objective'),
    crosshair: el('crosshair'),
    hitmarker: el('hitmarker'),
    feed: el('killfeed'),
    banner: el('banner'),
    bannerTitle: el('banner-title'),
    bannerSub: el('banner-sub'),
    channel: el('channel'),
    channelFill: el('channel-fill'),
    channelLabel: el('channel-label'),
    vignette: el('vignette'),
    blind: el('blind'),
    buy: el('buymenu'),
    buyMoney: el('buy-money'),
    buyGrid: el('buy-grid'),
    overlay: el('overlay'),
    overlayTitle: el('overlay-title'),
    overlaySub: el('overlay-sub'),
    overlayBody: el('overlay-body'),
  };
  const player = state.actors.find((a) => a.isPlayer);
  let buyOpen = false;
  let bannerUntil = 0;
  let hitmarkUntil = 0;
  let hurtAt = -9;

  // Build the buy grid once; refresh its states every frame while open.
  const buttons = new Map();
  for (const { item, key } of BUY_ITEMS) {
    const button = document.createElement('button');
    button.className = 'buy-item';
    button.innerHTML = `<span class="buy-key">${key}</span><span class="buy-name">${itemName(item)}</span>` +
      `<span class="buy-blurb">${itemBlurb(item)}</span><span class="buy-price">$${itemPrice(item)}</span>`;
    button.addEventListener('click', () => {
      buyItem(state, player, item);
    });
    root.buyGrid.appendChild(button);
    buttons.set(item, button);
  }

  function nameOf(id) {
    const actor = state.actors.find((a) => a.id === id);
    return actor === undefined ? '?' : actor.name;
  }

  function feedLine(html, cls = '') {
    const div = document.createElement('div');
    div.className = `feed-line ${cls}`;
    div.innerHTML = html;
    root.feed.appendChild(div);
    while (root.feed.children.length > 5) root.feed.firstChild.remove();
    setTimeout(() => div.classList.add('old'), 4200);
    setTimeout(() => div.remove(), 5200);
  }

  function showBanner(title, sub, seconds = 3.6) {
    root.bannerTitle.textContent = title;
    root.bannerSub.textContent = sub;
    root.banner.classList.add('show');
    bannerUntil = state.time + seconds;
  }

  function handleEvents(events) {
    for (const event of events) {
      if (event.type === 'kill') {
        const killer = state.actors.find((a) => a.id === event.by);
        const victim = state.actors.find((a) => a.id === event.target);
        feedLine(`<b class="${killer?.team ?? ''}">${nameOf(event.by)}</b> ▸ <b class="${victim?.team ?? ''}">${nameOf(event.target)}</b>${event.zone === 'head' ? ' ⌖ headshot' : ''}`);
        if (event.by === player.id) hitmarkUntil = state.time + 0.28;
      } else if (event.type === 'hit' && event.by === player.id) {
        hitmarkUntil = state.time + 0.14;
      } else if (event.type === 'hit' && event.target === player.id) {
        hurtAt = state.time;
      } else if (event.type === 'defused') {
        feedLine(`Charge defused by <b class="def">${nameOf(event.by)}</b>`, 'notice');
      } else if (event.type === 'planted') {
        feedLine(`Charge planted at site <b>${event.site}</b>`, 'notice');
        if (player.team === TEAM_ATK) showBanner('CHARGE PLANTED', 'Guard it. Thirty-five seconds.', 2.4);
        else showBanner('CHARGE PLANTED', 'Get to the site and defuse it.', 2.4);
      } else if (event.type === 'live') {
        showBanner('ROUND LIVE', player.team === TEAM_ATK ? `Your squad is headed for site ${state.targetSite}` : 'Hold the sites', 1.4);
      } else if (event.type === 'roundEnd') {
        const won = event.winner === player.team;
        const how = {
          elimination: 'by elimination',
          detonation: 'the charge went off',
          defuse: 'the charge was defused',
          time: 'the clock ran out',
        }[event.how] ?? '';
        showBanner(won ? 'ROUND WON' : 'ROUND LOST', how, 4.2);
      }
    }
  }

  function setBuyOpen(open) {
    buyOpen = open && state.phase === PHASE.BUY;
    root.buy.classList.toggle('show', buyOpen);
  }

  function refreshBuy() {
    if (!buyOpen) return;
    root.buyMoney.textContent = `$${player.money}`;
    for (const { item } of BUY_ITEMS) {
      const button = buttons.get(item);
      const price = itemPrice(item);
      let owned = false;
      if (item === 'armor') owned = player.armor;
      else if (WEAPONS[item] !== undefined) owned = player.primary?.def === item;
      else owned = player.grenades[item] >= 2;
      button.classList.toggle('owned', owned);
      button.classList.toggle('poor', !owned && player.money < price);
    }
  }

  function update() {
    if (buyOpen && state.phase !== PHASE.BUY) setBuyOpen(false);
    // Vital signs.
    root.health.style.width = `${Math.max(0, player.health)}%`;
    root.healthNum.textContent = String(Math.max(0, Math.ceil(player.health)));
    root.health.classList.toggle('low', player.health <= 30);
    root.armorTag.style.visibility = player.armor ? 'visible' : 'hidden';
    const held = heldWeapon(player);
    if (player.slot === 'grenade') {
      root.weaponName.textContent = GRENADES[player.grenadeKind].name;
      root.ammoMag.textContent = String(player.grenades[player.grenadeKind]);
      root.ammoReserve.textContent = '';
    } else if (held !== null) {
      root.weaponName.textContent = WEAPONS[held.def].name;
      root.ammoMag.textContent = String(held.mag);
      root.ammoReserve.textContent = `/ ${held.reserve}`;
      root.ammoMag.classList.toggle('low', held.mag <= Math.ceil(WEAPONS[held.def].mag * 0.25));
    }
    root.money.textContent = `$${player.money}`;
    // The clock: buy countdown, round clock, or the bomb's own fuse.
    if (state.phase === PHASE.BUY) root.timer.textContent = `BUY ${fmtTime(state.phaseT)}`;
    else if (state.phase === PHASE.PLANTED) root.timer.textContent = fmtTime(state.bomb.timer);
    else if (state.phase === PHASE.LIVE) root.timer.textContent = fmtTime(state.phaseT);
    else root.timer.textContent = '—';
    root.timer.classList.toggle('hot', state.phase === PHASE.PLANTED && state.bomb.timer < 10);
    root.score.textContent = `JACKALS ${state.score.atk} — ${state.score.def} WARDENS · ROUND ${state.roundNumber}`;
    // What you should be doing, in one line.
    let objective = '';
    if (state.phase === PHASE.BUY) objective = 'Buy phase — B for the menu';
    else if (state.phase === PHASE.LIVE) {
      if (player.hasBomb) objective = `You carry the charge — plant it at a site (hold E)`;
      else if (player.team === TEAM_ATK) objective = `Plant the charge — your squad is headed for ${state.targetSite}`;
      else objective = 'Hold the sites';
    } else if (state.phase === PHASE.PLANTED) {
      objective = player.team === TEAM_ATK ? 'Guard the charge' : 'Defuse the charge — hold E beside it';
    } else if (state.phase === PHASE.ROUND_END) objective = '';
    root.objective.textContent = player.alive ? objective : 'You are down — your squad fights on';
    // Crosshair breathes with the spread the sim will actually use.
    const spread = held !== null && player.slot !== 'grenade' ? spreadFor(player, WEAPONS[held.def]) : 0.004;
    root.crosshair.style.setProperty('--gap', `${5 + spread * 1150}px`);
    root.crosshair.style.opacity = player.alive && state.phase !== PHASE.BUY ? '1' : '0.25';
    root.hitmarker.classList.toggle('show', state.time < hitmarkUntil);
    // The plant/defuse channel, when the hands are the player's.
    const channel = state.bomb.channel;
    if (channel !== null && channel.actor === player.id) {
      root.channel.classList.add('show');
      root.channelLabel.textContent = channel.kind === 'plant' ? 'PLANTING' : 'DEFUSING';
      root.channelFill.style.width = `${Math.min(100, (channel.t / channel.need) * 100)}%`;
    } else {
      root.channel.classList.remove('show');
    }
    // Pain and blindness.
    const hurtFade = Math.max(0, 0.6 - (state.time - hurtAt) * 0.9);
    const lowHp = player.alive && player.health <= 30 ? 0.22 : 0;
    root.vignette.style.opacity = String(Math.max(hurtFade, lowHp));
    const blindLeft = player.blindUntil - state.time;
    root.blind.style.opacity = String(blindLeft > 0 ? Math.min(0.97, blindLeft) : 0);
    if (state.time > bannerUntil) root.banner.classList.remove('show');
    refreshBuy();
  }

  /** Overlay screens: 'start', 'pause', 'matchEnd', or null to hide. */
  function setOverlay(mode, data = {}) {
    if (mode === null) {
      root.overlay.classList.remove('show');
      return;
    }
    root.overlay.classList.add('show');
    if (mode === 'start') {
      root.overlayTitle.textContent = 'BREACHLINE';
      root.overlaySub.textContent = 'Jackals vs Wardens · plant the charge, first to seven';
      root.overlayBody.innerHTML = 'Click to take the yard. WASD move · mouse aim · Shift walk · Ctrl crouch · Space jump<br>' +
        '1/2 guns · 3 then click throws the readied grenade · R reload · E plant/defuse · B buy menu';
    } else if (mode === 'pause') {
      root.overlayTitle.textContent = 'PAUSED';
      root.overlaySub.textContent = 'The yard waits.';
      root.overlayBody.textContent = 'Click to get back in.';
    } else if (mode === 'matchEnd') {
      const won = data.winner === player.team;
      root.overlayTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      root.overlaySub.textContent = `Jackals ${state.score.atk} — ${state.score.def} Wardens`;
      root.overlayBody.textContent = 'Click to run it back with a fresh match.';
    }
  }

  return {
    handleEvents,
    update,
    setOverlay,
    setBuyOpen,
    isBuyOpen: () => buyOpen,
    buyKey: (n) => {
      const entry = BUY_ITEMS[n - 1];
      if (entry !== undefined && buyOpen) buyItem(state, player, entry.item);
    },
    showBanner,
  };
}
