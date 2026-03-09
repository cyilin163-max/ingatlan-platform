/**
 * API 契约层：房源搜索、详情、统计
 * 当前为 Mock 实现，后续可替换为真实 fetch(API_BASE + '/api/listings', ...)
 * 契约：
 *   GET /api/listings?q=&category=&price_min=&price_max=&area_min=&area_max=&rooms=&page=&sort=...
 *   GET /api/listings/:id
 *   GET /api/stats -> { activeListings, newToday }
 */
(function (global) {
  var BASE = typeof global.INGATLAN_API_BASE !== 'undefined'
    ? global.INGATLAN_API_BASE
    : (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:')
      ? 'http://localhost:3000'
      : '';
  var LEGACY_FAVORITES_KEY = 'ingatlan_favorites';
  var GUEST_FAVORITES_KEY = 'ingatlan_favorites_guest';
  var CURRENT_USER_KEY = 'ingatlan_current_user';
  var MY_LISTINGS_KEY = 'ingatlan_my_listings';

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function normalizeIdList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
  }
  function dispatchAuthChange(user) {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new CustomEvent('ingatlan-auth-changed', { detail: { user: user || null } }));
    } catch (e) {}
  }
  function getCurrentUser() {
    var user = readJson(CURRENT_USER_KEY);
    return user && user.id ? user : null;
  }
  function setCurrentUser(user) {
    if (!user || !user.id) {
      clearCurrentUser();
      return;
    }
    var minimalUser = {
      id: String(user.id),
      email: String(user.email || ''),
      name: String(user.name || '')
    };
    writeJson(CURRENT_USER_KEY, minimalUser);
    dispatchAuthChange(minimalUser);
  }
  function clearCurrentUser() {
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
    dispatchAuthChange(null);
  }
  function getFavoritesStorageKey(ownerId) {
    var explicitId = ownerId !== undefined && ownerId !== null ? String(ownerId).trim() : '';
    if (explicitId) return 'ingatlan_favorites_user_' + explicitId;
    var currentUser = getCurrentUser();
    return currentUser && currentUser.id ? ('ingatlan_favorites_user_' + String(currentUser.id)) : GUEST_FAVORITES_KEY;
  }
  function getFavorites(ownerId) {
    var key = getFavoritesStorageKey(ownerId);
    var ids = readJson(key);
    if (ids) return normalizeIdList(ids);
    if (key === GUEST_FAVORITES_KEY) {
      return normalizeIdList(readJson(LEGACY_FAVORITES_KEY));
    }
    return [];
  }
  function setFavorites(ids, ownerId) {
    var normalized = normalizeIdList(ids);
    var key = getFavoritesStorageKey(ownerId);
    writeJson(key, normalized);
    if (key === GUEST_FAVORITES_KEY) writeJson(LEGACY_FAVORITES_KEY, normalized);
  }
  function getMyListingsFromStorage() {
    try {
      var raw = localStorage.getItem(MY_LISTINGS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveMyListing(ownerId, listing) {
    var list = getMyListingsFromStorage();
    var id = 'my-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var item = Object.assign({}, listing, { id: id, ownerId: ownerId });
    list.push(item);
    try { localStorage.setItem(MY_LISTINGS_KEY, JSON.stringify(list)); } catch (e) { return null; }
    return id;
  }
  function removeMyListing(ownerId, listingId) {
    var list = getMyListingsFromStorage().filter(function (l) {
      return !(String(l.ownerId) === String(ownerId) && String(l.id) === String(listingId));
    });
    try { localStorage.setItem(MY_LISTINGS_KEY, JSON.stringify(list)); } catch (e) { return false; }
    return true;
  }

  var MOCK_LISTINGS = [
    {
      id: '1',
      title: 'Belvárosi lakás, teljesen felújítva',
      subtitle: 'Budapest V. kerület, Belváros · 72 m² · 3 szoba',
      category: 'buy',
      price: 89500000,
      pricePerSqm: 598000,
      area: 72,
      rooms: 3,
      floor: '2. emelet',
      location: 'Budapest V. kerület, Belváros',
      image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=450&fit=crop',
      images: [
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=750&fit=crop',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=750&fit=crop',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=750&fit=crop',
        'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&h=750&fit=crop',
        'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&h=750&fit=crop'
      ],
      photoCount: 12,
      has3D: true,
      badges: ['new'],
      yearBuilt: '1898 (2022)',
      orientation: 'Délkelet',
      ceilingHeight: '2,85 m',
      commonCost: '25 000 Ft/hó',
      elevator: true,
      ac: true,
      alarm: true,
      garden: false,
      energyCert: 'C',
      utilities: '~15 000 Ft/hó',
      internet: 'Elérhető',
      mortgage: 'Nincs',
      moveIn: true,
      description: 'Eladó egy csendes, napos belvárosi lakás a V. kerület szívében. A teljesen felújított 72 m²-es ingatlan 3 szobás, kiváló közlekedési kapcsolattal, metró és busz közelében. Magas belmagasság, eredeti parketta, modern konyha és fürdő. Közös költség reális, lift van az épületben. Azonnali beköltözés lehetséges.\n\nÉrdeklődjön bátran, válaszolunk minden kérdésére!',
      publisher: { name: 'Duna Ingatlan Kft.', id: '12345', phone: '+36 30 123 4567' },
      lat: 47.4979,
      lng: 19.0402,
      address: 'Budapest V. kerület, Belváros',
      floorPlanUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      listedAt: '2024-02-20',
      balcony: true,
      parking: false
    },
    {
      id: '2',
      title: 'Lakás Rózsadombon',
      subtitle: 'Budapest II. kerület, Rózsadomb · 110 m² · 4 szoba',
      category: 'buy',
      price: 62000000,
      pricePerSqm: 564000,
      area: 110,
      rooms: 4,
      floor: '1. emelet',
      location: 'Budapest II. kerület, Rózsadomb',
      image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=450&fit=crop',
      images: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=750&fit=crop'],
      photoCount: 8,
      has3D: false,
      badges: ['reduced'],
      description: 'Nagy, napos lakás Rózsadombon. Csendes környék, kiváló kilátás.',
      publisher: { name: 'Duna Ingatlan Kft.', id: '12345', phone: '+36 30 123 4567' },
      lat: 47.5150,
      lng: 19.0310,
      address: 'Budapest II. kerület, Rózsadomb',
      floorPlanUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      listedAt: '2024-02-18',
      balcony: true,
      parking: true
    },
    {
      id: '3',
      title: 'Családi ház Zuglóban',
      subtitle: 'Budapest XII. kerület, Zugló · 350 m² · 5 szoba',
      category: 'buy',
      price: 125000000,
      pricePerSqm: 357000,
      area: 350,
      rooms: 5,
      floor: 'Családi ház',
      location: 'Budapest XII. kerület, Zugló',
      image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&h=450&fit=crop',
      images: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&h=750&fit=crop'],
      photoCount: 15,
      has3D: true,
      badges: ['urgent'],
      description: 'Tágas családi ház kerttel, garázzsal. Zugló csendes részén.',
      publisher: { name: 'Duna Ingatlan Kft.', id: '12345', phone: '+36 30 123 4567' },
      lat: 47.5100,
      lng: 19.0800,
      address: 'Budapest XII. kerület, Zugló',
      floorPlanUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      listedAt: '2024-02-15',
      balcony: false,
      parking: true
    },
    {
      id: '4',
      title: 'Lakás Lágymányosban',
      subtitle: 'Budapest XIII. kerület, Lágymányos · 90 m² · 3 szoba',
      category: 'buy',
      price: 45000000,
      pricePerSqm: 500000,
      area: 90,
      rooms: 3,
      floor: '4. emelet',
      location: 'Budapest XIII. kerület, Lágymányos',
      image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=450&fit=crop',
      images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=750&fit=crop'],
      photoCount: 6,
      badges: [],
      description: 'Modern lakás Lágymányosban, egyetem és metró közelében.',
      publisher: { name: 'Duna Ingatlan Kft.', id: '12345', phone: '+36 30 123 4567' },
      lat: 47.4680,
      lng: 19.0590,
      address: 'Budapest XIII. kerület, Lágymányos',
      floorPlanUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      listedAt: '2024-02-10',
      balcony: true,
      parking: true
    },
    {
      id: '5',
      title: 'Nagy lakás Terézvárosban',
      subtitle: 'Budapest VI. kerület, Terézváros · 150 m² · 4 szoba',
      category: 'buy',
      price: 78000000,
      pricePerSqm: 520000,
      area: 150,
      rooms: 4,
      floor: '3. emelet',
      location: 'Budapest VI. kerület, Terézváros',
      image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600&h=450&fit=crop',
      images: ['https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&h=750&fit=crop'],
      photoCount: 10,
      badges: ['sale'],
      description: 'Terézvárosi nagylakás, belvárosi élet és csend.',
      publisher: { name: 'Duna Ingatlan Kft.', id: '12345', phone: '+36 30 123 4567' },
      lat: 47.5050,
      lng: 19.0650,
      address: 'Budapest VI. kerület, Terézváros',
      floorPlanUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      listedAt: '2024-02-05',
      balcony: true,
      parking: false
    },
    {
      id: '6',
      title: 'Lakás Újlipótvárosban',
      subtitle: 'Budapest XI. kerület, Újlipótváros · 120 m² · 3 szoba',
      category: 'buy',
      price: 55000000,
      pricePerSqm: 458000,
      area: 120,
      rooms: 3,
      floor: '5. emelet',
      location: 'Budapest XI. kerület, Újlipótváros',
      image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=600&h=450&fit=crop',
      images: ['https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&h=750&fit=crop'],
      photoCount: 9,
      has3D: true,
      badges: [],
      description: 'Újlipótvárosi lakás, jó közlekedéssel és parkolási lehetőséggel.',
      publisher: { name: 'Duna Ingatlan Kft.', id: '12345', phone: '+36 30 123 4567' },
      lat: 47.5120,
      lng: 19.0520,
      address: 'Budapest XI. kerület, Újlipótváros',
      floorPlanUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      listedAt: '2024-01-28',
      balcony: false,
      parking: true
    }
  ];

  function formatPrice(n, currency) {
    var num = (n || 0).toLocaleString('hu-HU');
    return currency === 'eur' ? num + ' €' : num + ' Ft';
  }

  function resolveImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    var u = url.trim();
    if (!u) return u;
    if (u.indexOf('http://localhost') === 0 || u.indexOf('http://127.0.0.1') === 0) {
      var path = u.replace(/^https?:\/\/[^/]+/, '') || '/';
      var origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
      if (origin && origin.indexOf('http') === 0) return origin + path;
      if (typeof window !== 'undefined' && window.INGATLAN_API_BASE) return window.INGATLAN_API_BASE + path;
      return u;
    }
    if (u.indexOf('/') === 0) {
      var base = (typeof window !== 'undefined' && window.INGATLAN_API_BASE) ? window.INGATLAN_API_BASE : '';
      if (!base && typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.indexOf('http') === 0) base = window.location.origin;
      return base ? base + u : u;
    }
    return u;
  }

  // 与 server getListingArea 一致：用 location + district 判断，布达佩斯区号（如 XV）也计入
  function getListingAreaItem(item) {
    var loc = (item.location || '').trim();
    var dist = (item.district || '').trim();
    var locDist = loc + ' ' + dist;
    var isBudapestDistrict = /^(I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3}|XIV|XV|XVI{1,3}|XX|XXI|XXII|XXIII)$/i.test(dist) || /^([1-9]|1[0-9]|2[0-3])$/.test(dist);
    var hasBelvaros = /V\.\s*kerület|VI\.\s*kerület|VII\.\s*kerület|第[五六七]区|5\s*区|6\s*区|7\s*区/i.test(loc) || /^[VVI]+$|^[567]$/.test(dist);
    var hasBudapest = /Budapest|布达佩斯/.test(loc) || isBudapestDistrict;
    var hasSurrounding = /Debrecen|Szeged|Miskolc|Other|德布勒森|塞格德|米什科尔茨|其他城市/.test(locDist);
    if (hasBelvaros) return 'budapest-belvaros';
    if (/Balaton|巴拉顿/.test(loc)) return 'balaton';
    if (hasSurrounding) return 'surrounding-cities';
    if (hasBudapest) return 'budapest-agglomeracio';
    return null;
  }

  function matchArea(location, areaKey) {
    var loc = (location || '');
    if (areaKey === 'budapest-belvaros') {
      return loc.indexOf('V. kerület') !== -1 || loc.indexOf('VI. kerület') !== -1 || loc.indexOf('VII. kerület') !== -1;
    }
    if (areaKey === 'balaton') return loc.indexOf('Balaton') !== -1;
    if (areaKey === 'surrounding-cities') {
      return loc.indexOf('Debrecen') !== -1 || loc.indexOf('Szeged') !== -1 || loc.indexOf('Miskolc') !== -1 || loc.indexOf('Other') !== -1;
    }
    if (areaKey === 'budapest-agglomeracio') {
      return loc.indexOf('Budapest') !== -1 && loc.indexOf('V. kerület') === -1 && loc.indexOf('VI. kerület') === -1 && loc.indexOf('VII. kerület') === -1;
    }
    return true;
  }

  function normalizePropertyType(raw) {
    if (!raw) return '';
    var map = {
      'lakás': 'flat',
      'flat': 'flat',
      'apartment': 'flat',
      'családi ház': 'house',
      'house': 'house',
      'garzon': 'studio',
      'studio': 'studio',
      'iroda': 'office',
      'office': 'office',
      'telek': 'land',
      'land': 'land'
    };
    return map[String(raw).toLowerCase()] || String(raw).toLowerCase();
  }

  function normalizeCondition(raw) {
    if (!raw) return '';
    var map = {
      'uj': 'new_or_renovated',
      'new': 'new',
      'renovated': 'renovated',
      'jo': 'good',
      'good': 'good',
      'felujitando': 'needs_renovation',
      'needs_renovation': 'needs_renovation'
    };
    return map[String(raw).toLowerCase()] || String(raw).toLowerCase();
  }

  function normalizeHeating(raw) {
    if (!raw) return '';
    var s = String(raw).toLowerCase().replace(/\s+/g, '_');
    var map = {
      'gazkazan': 'gas_boiler', 'gaz_cirko': 'gas_boiler', 'gas_boiler': 'gas_boiler',
      'gas': 'gas',
      'tavfutes': 'district', 'district': 'district',
      'electric': 'electric', 'villany': 'electric',
      'hoszivattyu': 'heat_pump', 'heat_pump': 'heat_pump',
      'vegyes_tuzeles': 'mixed', 'mixed': 'mixed',
      'renewable_heat_pump': 'renewable_heat_pump',
      'egyeb': 'other', 'other': 'other'
    };
    return map[s] || map[String(raw).toLowerCase()] || String(raw).toLowerCase();
  }

  function matchesBoolFilter(filterValue, actualValue) {
    if (filterValue === '1') return !!actualValue;
    if (filterValue === '0') return !actualValue;
    return true;
  }

  function parseDistrictFromQuery(q) {
    var s = (q || '').trim();
    if (!s) return null;
    var lower = s.toLowerCase();
    var cityMap = { debrecen: 'Debrecen', szeged: 'Szeged', miskolc: 'Miskolc', 德布勒森: 'Debrecen', 塞格德: 'Szeged', 米什科尔茨: 'Miskolc' };
    if (cityMap[lower]) return cityMap[lower];
    var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
    var cleaned = s.replace(/[区區\s.,]+$/g, '').replace(/^第/, '').trim();
    var cleanedLower = cleaned.toLowerCase();
    var num = parseInt(cleaned, 10);
    if (!isNaN(num) && num >= 1 && num <= 23) return roman[num - 1];
    for (var i = 0; i < roman.length; i++) {
      if (cleaned === roman[i] || cleanedLower === roman[i].toLowerCase()) return roman[i];
    }
    return null;
  }

  function applyFiltersSort(list, params) {
    var q = (params.q || '').toLowerCase().trim();
    var category = (params.category || '').toLowerCase();
    var areaKey = (params.area || '').toLowerCase();
    var district = (params.district || '').trim();
    var parsedDistrictFromQ = q && !district ? parseDistrictFromQuery(params.q || '') : null;
    if (parsedDistrictFromQ) district = parsedDistrictFromQ;
    var buildingType = normalizePropertyType(params.building_type || params.propertyType || '');
    var condition = normalizeCondition(params.condition || '');
    var heating = normalizeHeating(params.heating || '');
    var priceMin = parseInt(params.price_min, 10);
    var priceMax = parseInt(params.price_max, 10);
    var areaMin = parseInt(params.area_min, 10);
    var areaMax = parseInt(params.area_max, 10);
    var rooms = parseInt(params.rooms, 10);
    var floorMin = parseInt(params.floor_min, 10);
    var floorMax = parseInt(params.floor_max, 10);
    var sort = params.sort || 'newest';
    var elevator = String(params.elevator || '');
    var balcony = params.balcony;
    var parking = params.parking;
    var listedSinceDays = parseInt(params.listed_since, 10);

    var qParts = !parsedDistrictFromQ && q ? q.replace(/\./g, ' ').split(/[\s,]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean) : [];
    var areaFilterKeys = ['budapest-belvaros', 'surrounding-cities', 'budapest-agglomeracio'];
    var out = list.filter(function (item) {
      if (areaKey && areaFilterKeys.indexOf(areaKey) !== -1) {
        if (getListingAreaItem(item) !== areaKey) return false;
      } else if (areaKey && !matchArea(areaKey === 'surrounding-cities' ? (item.location || '') + ' ' + (item.district || '') : item.location, areaKey)) return false;
      if (district) {
        var districts = district.split(',').map(function (d) { return d.trim(); }).filter(Boolean);
        var itemDist = (item.district || '').trim();
        if (districts.length > 1) {
          if (districts.indexOf(itemDist) === -1) return false;
        } else if (itemDist !== district.trim()) return false;
      }
      if (qParts.length) {
        var titleL = (item.title || '').toLowerCase();
        var locationL = (item.location || '').toLowerCase();
        var distL = (item.district || '').toLowerCase();
        var match = qParts.some(function (part) {
          return titleL.indexOf(part) !== -1 || locationL.indexOf(part) !== -1 || distL.indexOf(part) !== -1;
        });
        if (!match) return false;
      }
      if (category && item.category !== category) return false;
      if (buildingType && normalizePropertyType(item.propertyType) !== buildingType) return false;
      if (condition) {
        var itemCondition = normalizeCondition(item.condition || '');
        if (condition === 'new_or_renovated') {
          if (itemCondition !== 'new' && itemCondition !== 'renovated') return false;
        } else if (itemCondition !== condition) return false;
      }
      if (heating && normalizeHeating(item.heating || '') !== heating) return false;
      if (!isNaN(priceMin) && item.price < priceMin) return false;
      if (!isNaN(priceMax) && item.price > priceMax) return false;
      if (!isNaN(areaMin) && item.area < areaMin) return false;
      if (!isNaN(areaMax) && item.area > areaMax) return false;
      if (!isNaN(rooms) && item.rooms < rooms) return false;
      if (!isNaN(floorMin)) {
        var itemFloorMin = parseInt(item.floor, 10);
        if (isNaN(itemFloorMin) || itemFloorMin < floorMin) return false;
      }
      if (!isNaN(floorMax)) {
        var itemFloorMax = parseInt(item.floor, 10);
        if (isNaN(itemFloorMax) || itemFloorMax > floorMax) return false;
      }
      if (elevator && !matchesBoolFilter(elevator, item.elevator)) return false;
      if (balcony === '1' && !item.balcony) return false;
      if (balcony === '0' && item.balcony) return false;
      if (parking === '1' && !item.parking) return false;
      if (parking === '0' && item.parking) return false;
      if (!isNaN(listedSinceDays) && listedSinceDays > 0 && item.listedAt) {
        var listed = new Date(item.listedAt).getTime();
        var cutoff = Date.now() - listedSinceDays * 24 * 60 * 60 * 1000;
        if (listed < cutoff) return false;
      } else if (!isNaN(listedSinceDays) && listedSinceDays > 0) {
        return false;
      }
      return true;
    });

    if (sort === 'price_asc') out.sort(function (a, b) { return a.price - b.price; });
    else if (sort === 'price_desc') out.sort(function (a, b) { return b.price - a.price; });
    else if (sort === 'area_desc') out.sort(function (a, b) { return b.area - a.area; });
    else out.sort(function (a, b) { return parseInt(b.id, 10) - parseInt(a.id, 10); });

    return out;
  }

  /**
   * 搜索列表 API
   * @param {Object} params - q, category, price_min, price_max, area_min, area_max, rooms, page, perPage, sort
   * @returns {Promise<{ items: Array, total: number, page: number, perPage: number }>}
   */
  function getAllListings() {
    var mine = getMyListingsFromStorage().map(function (item) {
      return {
        id: item.id,
        title: item.title || '',
        subtitle: (item.location || '') + ' · ' + (item.area || '') + ' m² · ' + (item.rooms || '') + ' szoba',
        category: item.category || 'buy',
        propertyType: item.propertyType || '',
        price: typeof item.price === 'number' ? item.price : parseInt(String(item.price).replace(/\D/g, ''), 10) || 0,
        pricePerSqm: item.area ? Math.round((typeof item.price === 'number' ? item.price : parseInt(String(item.price).replace(/\D/g, ''), 10) || 0) / item.area) : 0,
        area: item.area,
        rooms: item.rooms,
        floor: item.floor || '',
        location: item.location || '',
        district: item.district || '',
        image: item.image || item.images && item.images[0] || '',
        images: item.images || (item.image ? [item.image] : []),
        photoCount: item.photoCount || 0,
        has3D: item.has3D || false,
        badges: item.badges || [],
        listedAt: item.listedAt || '',
        currency: item.currency || 'ft',
        condition: item.condition || '',
        heating: item.heating || '',
        elevator: item.elevator,
        balcony: item.balcony,
        parking: item.parking
      };
    });
    return mine;
  }

  function getListings(params) {
    var p = params || {};
    var q = new URLSearchParams();
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    });
    var query = q.toString();
    var url = (BASE || '') + '/api/listings' + (query ? '?' + query : '');
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r); }).catch(function () {
      var perPage = Math.min(parseInt(params.perPage, 10) || 12, 50);
      var page = Math.max(1, parseInt(params.page, 10) || 1);
      var filtered = applyFiltersSort(getAllListings(), params);
      var total = filtered.length;
      var start = (page - 1) * perPage;
      var items = filtered.slice(start, start + perPage).map(function (item) {
        var propType = normalizePropertyType(item.propertyType) || 'flat';
        return {
          id: item.id,
          title: item.title,
          propertyType: propType,
          price: item.price,
          pricePerSqm: item.pricePerSqm,
          area: item.area,
          rooms: item.rooms,
          floor: item.floor,
          location: item.location,
          image: item.image,
          photoCount: item.photoCount,
          has3D: item.has3D,
          badges: item.badges || [],
          listedAt: item.listedAt || ''
        };
      });
      return { items: items, total: total, page: page, perPage: perPage };
    });
  }

  /**
   * 房源详情 API
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  function recordListingView(id) {
    if (!id) return;
    var url = (BASE || '') + '/api/listings/' + encodeURIComponent(id) + '/view';
    fetch(url, { method: 'POST', credentials: 'include' }).catch(function () {});
  }

  function getListingById(id) {
    var url = (BASE || '') + '/api/listings/' + encodeURIComponent(id);
    return fetch(url).then(function (r) {
      if (r.status === 404) {
        // 服务器没有这条，尝试从本地（localStorage）找，返回完整对象
        var raw = getMyListingsFromStorage().filter(function (l) { return String(l.id) === String(id); })[0];
        return raw ? Object.assign({}, raw) : null;
      }
      return r.ok ? r.json() : Promise.reject(r);
    }).catch(function () {
      var raw = getMyListingsFromStorage().filter(function (l) { return String(l.id) === String(id); })[0];
      return raw ? Object.assign({}, raw) : null;
    });
  }

  function getMyListingsByUser(ownerId) {
    return getMyListingsFromStorage().filter(function (l) { return l.ownerId === ownerId; });
  }

  /**
   * 统计 API：基于当前数据，不造假
   * @returns {Promise<{ activeListings: number, newToday: number }>}
   */
  function getStats() {
    var url = (BASE || '') + '/api/stats';
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r); }).catch(function () {
      return { activeListings: getAllListings().length, newToday: 0 };
    });
  }

  /**
   * 各热门区域房源数（真实数据）
   * @returns {Promise<{ 'budapest-belvaros': number, 'balaton': number, 'budapest-agglomeracio': number }>}
   */
  function getAreaCounts() {
    var url = (BASE || '') + '/api/areas/counts';
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r); }).catch(function () {
      var counts = { 'budapest-belvaros': 0, 'balaton': 0, 'budapest-agglomeracio': 0, 'surrounding-cities': 0 };
      getAllListings().forEach(function (item) {
        var area = getListingAreaItem(item);
        if (area && counts[area] !== undefined) counts[area]++;
      });
      return counts;
    });
  }

  /**
   * 根据 location 取该区（kerület）内房源的均价 Ft/m²，用于水平线对比
   * @param {string} location - e.g. "Budapest V. kerület, Belváros"
   * @returns {Promise<{ averagePerSqm: number, districtName: string }>}
   */
  function getDistrictAveragePricePerSqm(location) {
    if (BASE) {
      return fetch(BASE + '/api/areas/average-price?location=' + encodeURIComponent(location || ''))
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r); });
    }
    var loc = (location || '');
    var districtKey = '';
    var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
    for (var i = 0; i < roman.length; i++) {
      var r = roman[i] + '. kerület';
      if (loc.indexOf(r) !== -1) {
        districtKey = r;
        break;
      }
    }
    if (!districtKey) {
      return Promise.resolve({ averagePerSqm: 0, districtName: loc || '' });
    }
    var sameDistrict = getAllListings().filter(function (item) {
      return (item.location || '').indexOf(districtKey) !== -1;
    });
    var sum = 0;
    var n = 0;
    sameDistrict.forEach(function (item) {
      var p = item.pricePerSqm || (item.area ? Math.round(item.price / item.area) : 0);
      if (p) { sum += p; n++; }
    });
    var averagePerSqm = n ? Math.round(sum / n) : 0;
    var districtName = loc.indexOf('Budapest') !== -1 ? 'Budapest ' + districtKey : districtKey;
    return Promise.resolve({ averagePerSqm: averagePerSqm, districtName: districtName });
  }

  global.INGATLAN_API = {
    getListings: getListings,
    getListingById: getListingById,
    recordListingView: recordListingView,
    getStats: getStats,
    getAreaCounts: getAreaCounts,
    getDistrictAveragePricePerSqm: getDistrictAveragePricePerSqm,
    formatPrice: formatPrice,
    resolveImageUrl: resolveImageUrl,
    getFavorites: getFavorites,
    setFavorites: setFavorites,
    getCurrentUser: getCurrentUser,
    setCurrentUser: setCurrentUser,
    clearCurrentUser: clearCurrentUser,
    getMyListingsFromStorage: getMyListingsFromStorage,
    saveMyListing: saveMyListing,
    removeMyListing: removeMyListing,
    getMyListingsByUser: getMyListingsByUser
  };
})(typeof window !== 'undefined' ? window : this);
