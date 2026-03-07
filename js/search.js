// URL params <-> filters form sync; results from API (mock or backend)
(function () {
  var form = document.getElementById('filters-form');
  var sortSelect = document.getElementById('sort');
  var params = new URLSearchParams(window.location.search);

  function fillFormFromUrl() {
    if (!form) return;
    var names = ['district', 'price_min', 'price_max', 'area_min', 'area_max', 'rooms', 'building_type', 'condition', 'elevator', 'parking'];
    names.forEach(function (name) {
      var val = params.get(name);
      var el = form.querySelector('[name="' + name + '"]');
      if (el && val !== null) {
        if (el.type === 'checkbox') el.checked = val === '1';
        else if ((name === 'price_min' || name === 'price_max') && el.getAttribute('data-unit') === 'million') {
          var num = parseInt(val, 10);
          el.value = !isNaN(num) && num >= 1000000 ? String(Math.round(num / 1000000)) : val;
        } else el.value = val;
      }
    });
    if (sortSelect && params.get('sort')) sortSelect.value = params.get('sort');
    var cat = params.get('category') || '';
    document.querySelectorAll('.search-tab').forEach(function (tab) {
      tab.classList.toggle('active', (tab.getAttribute('data-category') || '') === cat);
    });
    var grid = document.getElementById('cards-grid');
    var viewList = document.getElementById('view-list');
    var viewGrid = document.getElementById('view-grid');
    var listView = localStorage.getItem('ingatlan_search_view') === 'list';
    if (grid) grid.classList.toggle('cards-grid--list', listView);
    if (viewList) viewList.setAttribute('aria-pressed', listView ? 'true' : 'false');
    if (viewGrid) viewGrid.setAttribute('aria-pressed', listView ? 'false' : 'true');
    if (viewList) viewList.classList.toggle('active', listView);
    if (viewGrid) viewGrid.classList.toggle('active', !listView);
  }

  function getSearchParams() {
    var p = new URLSearchParams(window.location.search);
    return {
      q: p.get('q') || '',
      category: p.get('category') || '',
      area: p.get('area') || '',
      district: p.get('district') || '',
      price_min: p.get('price_min') || '',
      price_max: p.get('price_max') || '',
      area_min: p.get('area_min') || '',
      area_max: p.get('area_max') || '',
      rooms: p.get('rooms') || '',
      building_type: p.get('building_type') || '',
      condition: p.get('condition') || '',
      elevator: p.get('elevator') || '',
      parking: p.get('parking') || '',
      sort: p.get('sort') || 'newest',
      page: p.get('page') || '1',
      perPage: '12'
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    var url = new URL(window.location.href);
    url.searchParams.set('page', '1');
    var names = ['district', 'price_min', 'price_max', 'area_min', 'area_max', 'rooms', 'building_type', 'condition', 'elevator', 'parking'];
    names.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el || !el.value || !el.value.trim()) { url.searchParams.delete(name); return; }
      var val = el.value.trim();
      if ((name === 'price_min' || name === 'price_max') && el.getAttribute('data-unit') === 'million') {
        var num = parseInt(val, 10);
        if (!isNaN(num)) url.searchParams.set(name, String(num * 1000000));
        else url.searchParams.delete(name);
      } else url.searchParams.set(name, val);
    });
    url.searchParams.delete('heating');
    url.searchParams.delete('floor_min');
    url.searchParams.delete('floor_max');
    url.searchParams.delete('balcony');
    url.searchParams.delete('listed_since');
    if (sortSelect && sortSelect.value) url.searchParams.set('sort', sortSelect.value);
    window.location.search = url.searchParams.toString();
  }

  function onReset() {
    setTimeout(function () {
      var url = new URL(window.location.href);
      url.searchParams.delete('price_min'); url.searchParams.delete('price_max');
      url.searchParams.delete('area_min'); url.searchParams.delete('area_max');
      url.searchParams.delete('rooms'); url.searchParams.delete('building_type');
      url.searchParams.delete('condition'); url.searchParams.delete('heating');
      url.searchParams.delete('floor_min'); url.searchParams.delete('floor_max');
      url.searchParams.delete('elevator'); url.searchParams.delete('balcony');
      url.searchParams.delete('parking'); url.searchParams.delete('listed_since');
      url.searchParams.delete('sort');
      url.searchParams.set('page', '1');
      window.location.search = url.searchParams.toString();
    }, 0);
  }

  fillFormFromUrl();

  document.querySelectorAll('.search-tab').forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      var url = new URL(window.location.href);
      var cat = tab.getAttribute('data-category') || '';
      if (cat) url.searchParams.set('category', cat);
      else url.searchParams.delete('category');
      url.searchParams.set('page', '1');
      window.location.search = url.searchParams.toString();
    });
  });

  var viewGridBtn = document.getElementById('view-grid');
  var viewListBtn = document.getElementById('view-list');
  var cardsGrid = document.getElementById('cards-grid');
  function setView(listView) {
    if (cardsGrid) cardsGrid.classList.toggle('cards-grid--list', listView);
    if (viewListBtn) { viewListBtn.setAttribute('aria-pressed', listView ? 'true' : 'false'); viewListBtn.classList.toggle('active', listView); }
    if (viewGridBtn) { viewGridBtn.setAttribute('aria-pressed', listView ? 'false' : 'true'); viewGridBtn.classList.toggle('active', !listView); }
    try { localStorage.setItem('ingatlan_search_view', listView ? 'list' : 'grid'); } catch (e) {}
  }
  if (viewListBtn) viewListBtn.addEventListener('click', function () { setView(true); });
  if (viewGridBtn) viewGridBtn.addEventListener('click', function () { setView(false); });

  if (form) {
    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', onReset);
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      var url = new URL(window.location.href);
      if (sortSelect.value) url.searchParams.set('sort', sortSelect.value);
      else url.searchParams.delete('sort');
      url.searchParams.set('page', '1');
      window.location.search = url.searchParams.toString();
    });
  }

  // --- API results & pagination ---
  var api = window.INGATLAN_API;
  if (!api || !api.getListings) return;

  function t(key, opts) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key, opts) : key;
  }

  function badgeLabel(badge) {
    if (badge === 'new') return t('cardNew');
    if (badge === 'reduced') return t('cardReduced');
    if (badge === 'urgent') return t('cardUrgent');
    if (badge === 'sale') return t('cardSale');
    return badge;
  }

  function badgeClass(badge) {
    if (badge === 'new') return 'badge-new';
    if (badge === 'reduced') return 'badge-reduced';
    if (badge === 'urgent') return 'badge-urgent';
    if (badge === 'sale') return 'badge-sale';
    return '';
  }

  // 将存储值（英文key或匈牙利原文）统一翻译为当前语言
  var PROPERTY_TYPE_MAP = {
    'flat': 'propertyTypeFlat',
    'house': 'propertyTypeHouse',
    'studio': 'propertyTypeStudio',
    'office': 'propertyTypeOffice',
    'land': 'propertyTypeLand',
    // 旧匈牙利语值映射
    'lakás': 'propertyTypeFlat',
    'lak\u00e1s': 'propertyTypeFlat',
    'családi ház': 'propertyTypeHouse',
    'csal\u00e1di h\u00e1z': 'propertyTypeHouse',
    'garzon': 'propertyTypeStudio',
    'iroda': 'propertyTypeOffice',
    'telek': 'propertyTypeLand'
  };
  function propertyTypeLabel(raw) {
    if (!raw) return '';
    var key = PROPERTY_TYPE_MAP[raw.toLowerCase()];
    if (key) return t(key);
    return raw;
  }

  function renderCard(item) {
    var priceStr = api.formatPrice(item.price);
    var perSqm = (item.pricePerSqm || 0).toLocaleString('hu-HU') + ' Ft/m²';
    var badges = (item.badges || []).map(function (b) {
      return '<span class="badge ' + badgeClass(b) + '">' + badgeLabel(b) + '</span>';
    }).join('');
    var meta = [];
    if (item.photoCount) meta.push('📷 ' + item.photoCount);
    if (item.has3D) meta.push('🎬 3D');
    var metaBar = meta.length ? '<div class="card-meta-bar">' + meta.join('<span> </span>') + '</div>' : '';
    var favAria = t('cardFavorite');
    return (
      '<a href="property.html?id=' + encodeURIComponent(item.id) + '" class="property-card">' +
        '<div class="card-media">' +
          '<img src="' + (item.image || '').replace(/"/g, '&quot;') + '" alt="' + (item.title || '').replace(/"/g, '&quot;') + '" loading="lazy" width="600" height="450">' +
          '<span class="card-watermark">© Ingatlan.hu</span>' +
          (badges ? '<div class="card-badges">' + badges + '</div>' : '') +
          metaBar +
          '<div class="card-actions">' +
            '<button type="button" class="card-action-btn" aria-label="' + favAria + '">♡</button>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          (item.propertyType ? '<div class="card-type">' + propertyTypeLabel(item.propertyType).replace(/"/g, '&quot;') + '</div>' : '') +
          '<div class="card-price">' + priceStr + ' <span class="card-price-unit">· ' + perSqm + '</span></div>' +
          '<div class="card-specs">' +
            '<span>' + (item.area || '') + ' m²</span>' +
            '<span>' + (item.rooms || '') + ' ' + (window.i18n && window.i18n.t ? window.i18n.t('unitRooms') : 'szoba') + '</span>' +
            '<span>' + (item.floor || '') + '</span>' +
          '</div>' +
          '<div class="card-location">' + (item.location || '') + '</div>' +
          (item.id || item.listedAt ? '<div class="card-meta-id">' + (item.id ? ('#' + item.id) : '') + (item.id && item.listedAt ? ' · ' : '') + (item.listedAt ? item.listedAt : '') + '</div>' : '') +
        '</div>' +
      '</a>'
    );
  }

  function buildPagination(total, page, perPage) {
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    page = Math.min(Math.max(1, page), totalPages);
    var parts = [];
    var baseUrl = window.location.pathname || 'search.html';
    var search = new URLSearchParams(window.location.search);

    if (page > 1) {
      search.set('page', String(page - 1));
      parts.push('<a href="' + baseUrl + '?' + search.toString() + '" data-i18n="paginationPrev">Előző</a>');
    }
    for (var i = 1; i <= totalPages; i++) {
      if (i === page) {
        parts.push('<span class="current">' + i + '</span>');
      } else {
        search.set('page', String(i));
        parts.push('<a href="' + baseUrl + '?' + search.toString() + '">' + i + '</a>');
      }
    }
    if (page < totalPages) {
      search.set('page', String(page + 1));
      parts.push('<a href="' + baseUrl + '?' + search.toString() + '" data-i18n="paginationNext">Következő</a>');
    }
    return parts.join('');
  }

  function renderResults(data) {
    var grid = document.getElementById('cards-grid');
    var totalEl = document.getElementById('results-total');
    var subtitleEl = document.getElementById('search-subtitle');
    var paginationEl = document.getElementById('pagination');

    var total = data.total || 0;
    var page = data.page || 1;
    var perPage = data.perPage || 12;
    var items = data.items || [];

    if (totalEl) totalEl.textContent = total.toLocaleString('hu-HU');
    if (subtitleEl) {
      var countStr = total.toLocaleString('hu-HU');
      subtitleEl.dataset.count = countStr;
      var sub = (window.i18n && window.i18n.t) ? window.i18n.t('searchPageSubtitle', { count: countStr }) : (total + ' eredmény');
      subtitleEl.textContent = sub;
    }

    if (grid) {
      if (items.length === 0) {
        grid.innerHTML = '<p class="results-empty" style="grid-column:1/-1;color:var(--color-text-muted);padding:var(--space-8);" data-i18n="searchNoResults">Nincs találat. Próbálja módosítani a szűrőket.</p>';
      } else {
        grid.innerHTML = items.map(renderCard).join('');
      }
      if (window.i18n && window.i18n.apply) window.i18n.apply();
    }

    if (paginationEl && total > 0) {
      paginationEl.innerHTML = buildPagination(total, page, perPage);
      paginationEl.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (key && window.i18n && window.i18n.t) el.textContent = window.i18n.t(key);
      });
    }

    bindFavorites();
  }

  function bindFavorites() {
    var gridEl = document.getElementById('cards-grid');
    if (!gridEl) return;

    function applyFavoriteStates() {
      var favIds = (api.getFavorites && api.getFavorites()) || [];
      document.querySelectorAll('#cards-grid .property-card').forEach(function (card) {
        var href = card.getAttribute('href') || '';
        var id = String((href.match(/id=([^&]+)/) || [])[1] || '');
        var favBtn = card.querySelector('.card-actions .card-action-btn[aria-label*="Kedvencek"], .card-actions .card-action-btn[aria-label*="Favorite"], .card-actions .card-action-btn[aria-label*="收藏"]');
        if (favBtn) {
          var isFav = favIds.indexOf(id) !== -1;
          favBtn.classList.toggle('active', isFav);
          favBtn.textContent = isFav ? '♥' : '♡';
        }
      });
    }

    if (!gridEl._favoritesBound) {
      gridEl._favoritesBound = true;
      gridEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.card-action-btn');
        if (!btn) return;
        var card = btn.closest('.property-card');
        if (!card) return;
        e.preventDefault();
        e.stopPropagation();
        var href = card.getAttribute('href') || '';
        var id = String((href.match(/id=([^&]+)/) || [])[1] || '');
        var favorites = (api.getFavorites && api.getFavorites()) || [];
        var idx = favorites.indexOf(id);
        if (idx === -1) favorites.push(id);
        else favorites.splice(idx, 1);
        if (api.setFavorites) api.setFavorites(favorites);
        applyFavoriteStates();
      });
    }

    if (!gridEl._favoritesAuthBound) {
      gridEl._favoritesAuthBound = true;
      window.addEventListener('ingatlan-auth-changed', applyFavoriteStates);
    }

    setTimeout(applyFavoriteStates, 0);
  }

  var searchParams = getSearchParams();
  api.getListings(searchParams).then(renderResults).catch(function () {
    renderResults({ items: [], total: 0, page: 1, perPage: 12 });
  });
})();
