// 首页统计：在售房源、今日新增 — 从 API 拉取实时数据并更新
(function () {
  var API_STATS = typeof window.INGATLAN_STATS_API !== 'undefined'
    ? window.INGATLAN_STATS_API
    : '/api/stats';
  var activeEl = document.getElementById('stat-active-listings');
  var newTodayEl = document.getElementById('stat-new-today');

  function formatNum(n) {
    return typeof n === 'number' && !isNaN(n) ? n.toLocaleString('hu-HU') : '';
  }

  function applyStats(data) {
    if (data.activeListings != null && activeEl) {
      var v = parseInt(data.activeListings, 10);
      if (!isNaN(v)) {
        activeEl.setAttribute('data-count', String(v));
        activeEl.textContent = formatNum(v);
      }
    }
    if (data.newToday != null && newTodayEl) {
      var t = parseInt(data.newToday, 10);
      if (!isNaN(t)) {
        newTodayEl.textContent = t > 0 ? '+' + formatNum(t) : formatNum(t);
      }
    }
  }

  if (activeEl || newTodayEl) {
    fetch(API_STATS)
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(applyStats)
      .catch(function () {
        if (window.INGATLAN_API && window.INGATLAN_API.getStats) {
          window.INGATLAN_API.getStats().then(applyStats);
        }
      });
  }
})();

// 热门区域卡片数量：用真实数据更新
(function () {
  function formatNum(n) {
    return typeof n === 'number' && !isNaN(n) ? n.toLocaleString('hu-HU') : '0';
  }
  var api = window.INGATLAN_API;
  if (!api || !api.getAreaCounts) return;
  api.getAreaCounts().then(function (counts) {
    var bel = document.getElementById('area-count-belvaros');
    var bal = document.getElementById('area-count-balaton');
    var agg = document.getElementById('area-count-agglomeracio');
    if (bel && counts['budapest-belvaros'] != null) bel.textContent = formatNum(counts['budapest-belvaros']);
    if (bal && counts['balaton'] != null) bal.textContent = formatNum(counts['balaton']);
    if (agg && counts['budapest-agglomeracio'] != null) agg.textContent = formatNum(counts['budapest-agglomeracio']);
  });
})();

// Optional: animate stat counter on scroll into view
document.querySelectorAll('.stat-value[data-count]').forEach(el => {
  const target = parseInt(el.dataset.count, 10);
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && target) {
        let current = 0;
        const step = target / 30;
        const tick = () => {
          current += step;
          if (current >= target) {
            el.textContent = target.toLocaleString('hu-HU');
            return;
          }
          el.textContent = Math.floor(current).toLocaleString('hu-HU');
          requestAnimationFrame(tick);
        };
        tick();
        obs.disconnect();
      }
    });
  }, { threshold: 0.3 });
  obs.observe(el);
});

// Location picker modal + Budapest district map (SVG) with highlight
(function () {
  var modal = document.getElementById('location-modal');
  var searchInput = document.getElementById('hero-search-input');
  var cancelBtn = document.getElementById('location-modal-cancel');
  var okBtn = document.getElementById('location-modal-ok');
  var modalInput = modal && modal.querySelector('.location-modal-input');
  var districtsList = document.getElementById('budapest-districts');
  var mapEl = document.getElementById('budapest-map');

  if (!modal) return;

  var suppressOpenModal = false;

  var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];

  if (districtsList) {
    roman.forEach(function (r, i) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'district';
      input.value = (i + 1);
      input.setAttribute('data-district-index', i);
      input.addEventListener('change', function () {
        updateMapHighlight();
        syncModalInputFromCheckboxes();
      });
      var span = document.createElement('span');
      span.textContent = r + '.';
      label.appendChild(input);
      label.appendChild(span);
      districtsList.appendChild(label);
    });
  }

  function updateMapHighlight() {
  }

  function syncModalInputFromCheckboxes() {
    if (!modalInput) return;
    var checked = modal.querySelectorAll('.location-districts-list input:checked');
    var nums = Array.prototype.map.call(checked, function (c) {
      return c.parentNode.querySelector('span').textContent;
    });
    modalInput.value = nums.length ? nums.join(', ') : '';
  }

  function openModal() {
    if (suppressOpenModal) {
      suppressOpenModal = false;
      return;
    }
    modal.removeAttribute('hidden');
    modal.style.display = '';
    if (modalInput) {
      var initial = searchInput ? searchInput.value : '';
      modalInput.value = initial;
      parseDistrictsIntoCheckboxes(initial);
    }
    if (modalInput) modalInput.focus();
  }

  function parseDistrictsIntoCheckboxes(text) {
    if (!districtsList) return;
    var parts = text.split(/[·,，、\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    function norm(p) { return (p || '').replace(/[.,\s]+$/, '').trim(); }
    districtsList.querySelectorAll('input[type="checkbox"]').forEach(function (input, i) {
      var matched = parts.some(function (p) { return norm(p) === roman[i]; });
      input.checked = !!matched;
    });
  }


  function closeModal() {
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }

  if (searchInput) {
    searchInput.addEventListener('click', openModal);
    searchInput.addEventListener('focus', openModal);
  }

  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // 布达佩斯区份罗马数字 -> "X. kerület" 格式，与房源 location 一致，便于搜索匹配
  function districtToSearchText(romanNum) {
    return romanNum + '. kerület';
  }

  // 确定：先关闭弹窗，再把选中的区份或输入文字写回首页搜索框并回到顶部
  if (okBtn) {
    okBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
      suppressOpenModal = true;
      var checked = modal.querySelectorAll('.location-districts-list input:checked');
      var text = modalInput ? modalInput.value.trim() : '';
      if (searchInput) {
        if (checked.length) {
          var parts = Array.prototype.map.call(checked, function (c) {
            var s = c.parentNode ? c.parentNode.querySelector('span') : null;
            return s ? s.textContent.trim() : '';
          });
          searchInput.value = parts.filter(Boolean).join(', ');
        } else if (text) {
          searchInput.value = text;
        }
        searchInput.focus();
      }
      setTimeout(function () { suppressOpenModal = false; }, 0);
      var hero = document.querySelector('.hero');
      if (hero && hero.scrollIntoView) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });
})();

// 首页最新房源区块
(function () {
  var grid = document.getElementById('latest-grid');
  var api = window.INGATLAN_API;
  if (!grid || !api || !api.getListings) return;

  var PROP_TYPE_I18N = {
    'flat': 'propertyTypeFlat', 'apartment': 'propertyTypeFlat',
    'house': 'propertyTypeHouse',
    'studio': 'propertyTypeStudio',
    'office': 'propertyTypeOffice',
    'land': 'propertyTypeLand'
  };
  function propTypeLabel(raw) {
    if (!raw) return '';
    var key = PROP_TYPE_I18N[raw.toLowerCase()];
    if (key && window.i18n && window.i18n.t) return window.i18n.t(key);
    return raw;
  }

  var loadingText = (window.i18n && window.i18n.t('loading')) || 'Loading…';
  grid.innerHTML = '<div class="latest-loading" aria-live="polite">' + loadingText + '</div>';
  api.getListings({ page: 1, perPage: 8, sort: 'newest' }).then(function (res) {
    var items = res.items || [];
    var unitRooms = (window.i18n && window.i18n.t('unitRooms')) || 'rooms';
    if (items.length === 0) {
      grid.closest('.latest-section').hidden = true;
      return;
    }
    grid.innerHTML = items.map(function (item) {
      var priceStr = api.formatPrice(item.price);
      var perSqm = (item.pricePerSqm || 0).toLocaleString('hu-HU') + ' Ft/m²';
      var propType = item.propertyType ? '<div class="card-type">' + propTypeLabel(item.propertyType).replace(/"/g, '&quot;') + '</div>' : '';
      return '<a href="property.html?id=' + encodeURIComponent(item.id) + '" class="property-card">' +
        '<div class="card-media">' +
          '<img src="' + (item.image || '').replace(/"/g, '&quot;') + '" alt="" loading="lazy" width="600" height="450">' +
          '<span class="card-watermark">© 匈牙利房产</span>' +
        '</div>' +
        '<div class="card-body">' +
          propType +
          '<div class="card-price">' + priceStr + ' <span class="card-price-unit">· ' + perSqm + '</span></div>' +
          '<div class="card-specs"><span>' + (item.area || '') + ' m²</span><span>' + (item.rooms || '') + ' ' + unitRooms + '</span></div>' +
          '<div class="card-location">' + (item.location || '') + '</div>' +
        '</div></a>';
    }).join('');
    if (window.i18n && window.i18n.apply) window.i18n.apply();
  }).catch(function () {
    grid.closest('.latest-section').hidden = true;
  });
})();

// Hero search form: redirect to search.html with q, category, rooms, price, area
(function () {
  var form = document.getElementById('hero-search-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = new URL('search.html', window.location.href);
    var q = form.querySelector('[name="q"]');
    if (q && q.value.trim()) url.searchParams.set('q', q.value.trim());
    var cat = form.querySelector('[name="category"]');
    if (cat && cat.value) url.searchParams.set('category', cat.value);
    var rooms = form.querySelector('[name="rooms"]');
    if (rooms && rooms.value) url.searchParams.set('rooms', rooms.value);
    var areaMin = form.querySelector('[name="area_min"]');
    var areaMax = form.querySelector('[name="area_max"]');
    if (areaMin && areaMin.value.trim()) url.searchParams.set('area_min', areaMin.value.trim());
    if (areaMax && areaMax.value.trim()) url.searchParams.set('area_max', areaMax.value.trim());
    var priceMinMio = form.querySelector('[name="price_min_mio"]');
    var priceMaxMio = form.querySelector('[name="price_max_mio"]');
    if (priceMinMio && priceMinMio.value.trim() !== '') {
      var v = parseInt(priceMinMio.value, 10);
      if (!isNaN(v)) url.searchParams.set('price_min', String(v * 1000000));
    }
    if (priceMaxMio && priceMaxMio.value.trim() !== '') {
      var w = parseInt(priceMaxMio.value, 10);
      if (!isNaN(w)) url.searchParams.set('price_max', String(w * 1000000));
    }
    window.location.href = url.pathname + '?' + url.searchParams.toString();
  });
})();

// Newsletter 表单
(function () {
  var form = document.getElementById('newsletter-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = window.i18n && window.i18n.t('newsletterThanks') ? window.i18n.t('newsletterThanks') : 'Köszönjük a feliratkozást!';
    alert(msg);
    form.reset();
  });
})();
