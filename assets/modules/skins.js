// Strum Fighter — XP-gated cockpit liveries.
//
// You fly a first-person cockpit, so a "livery" here re-themes the things you
// actually see: HUD accent (reticle/brackets/dashboard glow), your gun tracer
// colour, and the cockpit fill-light tint. Unlocks are awarded by the
// Minigames profile (total XP); the IDs match plugin.json "unlocks" and arrive
// game-scoped as "strum_fighter:skin_ace" etc. from sdk.getProfile().unlocks.

export const SKINS = {
  default: {
    id: 'default',
    label: 'Standard',
    unlock: null,            // always available
    accent: '120,255,200',   // teal — HUD reticle / brackets
    accentHex: 0x78ffc8,
    tracer: 0x66ffcc,
    muzzle: 0x66ffcc,
    light: 0x66ccff,         // cockpit fill light
    star: 0xbcd8ff,
    badge: '▷',
  },
  ace: {
    id: 'ace',
    label: 'Ace',
    unlock: 'skin_ace',      // 250 XP
    accent: '255,214,77',    // gold
    accentHex: 0xffd64d,
    tracer: 0xffd24d,
    muzzle: 0xfff0a0,
    light: 0xffd070,
    star: 0xfff0c8,
    badge: '✦',
  },
  squad: {
    id: 'squad',
    label: 'Squadron',
    unlock: 'skin_squad',    // 1000 XP
    accent: '255,96,120',    // crimson
    accentHex: 0xff6078,
    tracer: 0xff5a78,
    muzzle: 0xffd0d8,
    light: 0xff7088,
    star: 0xffd0dc,
    badge: '★',
  },
};

// Order from most to least prestigious for "highest unlocked" resolution.
const RANK = ['squad', 'ace', 'default'];

// Normalise sdk.getProfile().unlocks (game-scoped "strum_fighter:skin_ace")
// into a Set of bare unlock ids ("skin_ace").
export function ownedSkinIds(unlocks, pluginId) {
  const owned = new Set();
  const prefix = pluginId + ':';
  for (const u of (Array.isArray(unlocks) ? unlocks : [])) {
    if (typeof u !== 'string') continue;
    if (u.startsWith(prefix)) owned.add(u.slice(prefix.length));
    else owned.add(u); // tolerate already-bare ids
  }
  return owned;
}

function isUnlocked(skin, owned) {
  return !skin.unlock || owned.has(skin.unlock);
}

// Resolve the active livery from the player's choice + what they've unlocked.
//   choice: 'auto' (highest unlocked) | 'default' | 'ace' | 'squad'
// A locked explicit pick gracefully degrades to the best unlocked livery.
export function resolveSkin(choice, owned) {
  // Accept a Set (the normal path) or a plain array of unlock ids; anything
  // else is treated as "owns nothing".
  const set = owned instanceof Set ? owned : new Set(Array.isArray(owned) ? owned : []);
  const best = () => {
    for (const id of RANK) if (isUnlocked(SKINS[id], set)) return SKINS[id];
    return SKINS.default;
  };
  if (!choice || choice === 'auto') return best();
  const want = SKINS[choice];
  if (want && isUnlocked(want, set)) return want;
  return best();
}
