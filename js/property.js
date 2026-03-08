// Property detail: load by ?id=, render content, breadcrumb, SEO meta + JSON-LD, lazy images
(function () {
  var api = window.INGATLAN_API;
  if (!api || !api.getListingById) return;

  // 解析图片 URL：部署后若存的是 localhost 或相对路径，改为当前站点可访问的地址；避免 origin 为 "null" 时生成错误 URL
  function resolveImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    var u = url.trim();
    if (!u) return u;
    if (u.indexOf('http://localhost') === 0 || u.indexOf('http://127.0.0.1') === 0) {
      var path = u.replace(/^https?:\/\/[^/]+/, '') || '/';
      var origin = window.location.origin;
      if (origin && origin.indexOf('http') === 0) return origin + path;
      if (typeof window.INGATLAN_API_BASE !== 'undefined' && window.INGATLAN_API_BASE) return window.INGATLAN_API_BASE + path;
      return u;
    }
    if (u.indexOf('/') === 0) {
      var base = (typeof window.INGATLAN_API_BASE !== 'undefined' && window.INGATLAN_API_BASE) ? window.INGATLAN_API_BASE : '';
      if (!base && window.location.origin && window.location.origin.indexOf('http') === 0) base = window.location.origin;
      return base ? base + u : u;
    }
    return u;
  }

  // 从位置文本解析布达佩斯区份（如 "Budapest V. kerület, Belváros" -> 第5区）
  function parseDistrictFromLocation(locationText) {
    if (!locationText || typeof locationText !== 'string') return null;
    var text = locationText.trim();
    var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
    for (var i = 0; i < roman.length; i++) {
      var pattern = roman[i] + '\\.\\s*kerület';
      if (new RegExp(pattern, 'i').test(text)) {
        return { district: i + 1, districtLabel: roman[i] + '. kerület' };
      }
    }
    return null;
  }

  // 布达佩斯各区大致中心坐标（用于无精确经纬度时地图显示大概位置）
  var BUDAPEST_DISTRICT_CENTERS = {
    1: { lat: 47.497, lng: 19.037 }, 2: { lat: 47.515, lng: 19.031 }, 3: { lat: 47.535, lng: 19.045 },
    4: { lat: 47.562, lng: 19.096 }, 5: { lat: 47.496, lng: 19.055 }, 6: { lat: 47.505, lng: 19.065 },
    7: { lat: 47.500, lng: 19.075 }, 8: { lat: 47.485, lng: 19.075 }, 9: { lat: 47.478, lng: 19.065 },
    10: { lat: 47.478, lng: 19.115 }, 11: { lat: 47.476, lng: 19.055 }, 12: { lat: 47.510, lng: 19.080 },
    13: { lat: 47.468, lng: 19.059 }, 14: { lat: 47.518, lng: 19.107 }, 15: { lat: 47.538, lng: 19.098 },
    16: { lat: 47.515, lng: 19.170 }, 17: { lat: 47.480, lng: 19.255 }, 18: { lat: 47.445, lng: 19.175 },
    19: { lat: 47.455, lng: 19.145 }, 20: { lat: 47.437, lng: 19.100 }, 21: { lat: 47.433, lng: 19.065 },
    22: { lat: 47.425, lng: 19.040 }, 23: { lat: 47.400, lng: 19.040 }
  };

  function getPropId() {
    var p = new URLSearchParams(window.location.search);
    return p.get('id') || '';
  }

  function t(key, params) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key;
  }

  function getCurrentLang() {
    return (window.i18n && window.i18n.getLang) ? window.i18n.getLang() : 'zh';
  }

  function badgeClass(badge) {
    if (badge === 'new') return 'badge-new';
    if (badge === 'reduced') return 'badge-reduced';
    if (badge === 'urgent') return 'badge-urgent';
    if (badge === 'sale') return 'badge-sale';
    return '';
  }

  var PROPERTY_TYPE_MAP = {
    'flat': 'propertyTypeFlat',
    'house': 'propertyTypeHouse',
    'studio': 'propertyTypeStudio',
    'office': 'propertyTypeOffice',
    'land': 'propertyTypeLand',
    'apartment': 'propertyTypeFlat',
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
    var key = PROPERTY_TYPE_MAP[String(raw).toLowerCase()];
    return key ? t(key) : String(raw);
  }

  function categoryLabel(raw) {
    var normalized = String(raw || '').toLowerCase();
    if (normalized === 'rent') return t('homeTabRent');
    if (normalized === 'buy' || normalized === 'sale') return t('homeTabBuy');
    return raw || '';
  }

  function normalizeDistrictCode(raw) {
    var text = String(raw || '').trim().toUpperCase();
    if (!text) return '';
    var match = text.match(/\b(XXIII|XXII|XXI|XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/);
    return match ? match[1] : '';
  }

  function districtNumberFromCode(code) {
    var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
    return roman.indexOf(code) + 1;
  }

  function formatDistrictLabel(raw, locationText) {
    var code = normalizeDistrictCode(raw);
    if (!code && locationText) {
      var parsed = parseDistrictFromLocation(locationText);
      code = parsed ? normalizeDistrictCode(parsed.districtLabel) : '';
    }
    if (!code) return '';
    var lang = getCurrentLang();
    if (lang === 'zh') return code + ' 区';
    if (lang === 'en') return 'District ' + code;
    return code + '. kerület';
  }

  function formatListedDate(raw) {
    if (!raw) return '';
    var date = new Date(raw);
    if (isNaN(date.getTime())) return raw;
    var lang = getCurrentLang();
    var locale = lang === 'zh' ? 'zh-CN' : (lang === 'hu' ? 'hu-HU' : 'en-US');
    return date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function buildFloorSummary(data) {
    var floor = data.floor !== undefined && data.floor !== '' && data.floor !== null ? String(data.floor) : '';
    var total = data.totalFloors ? String(data.totalFloors) : '';
    if (floor && total) return floor + ' / ' + total;
    return floor || total || '';
  }

  function scrollToContactTarget() {
    var target = document.getElementById('contact-form') || document.getElementById('contact-block');
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindFavoriteButton(listingId) {
    var favBtn = document.querySelector('[data-i18n="propAddFavorite"]');
    if (!favBtn) return;

    function renderFavoriteState() {
      var favorites = (api.getFavorites && api.getFavorites()) || [];
      var isFav = favorites.indexOf(String(listingId)) !== -1;
      favBtn.textContent = isFav ? '♥ ' + (t('accountRemove') || 'Eltávolítás') : '♡ ' + (t('propAddFavorite') || 'Kedvencekhez');
      favBtn.classList.toggle('active', isFav);
    }

    if (!favBtn._favoriteBound) {
      favBtn._favoriteBound = true;
      favBtn.addEventListener('click', function () {
        var list = (api.getFavorites && api.getFavorites()) || [];
        var idText = String(listingId);
        var idx = list.indexOf(idText);
        if (idx === -1) list.push(idText);
        else list.splice(idx, 1);
        if (api.setFavorites) api.setFavorites(list);
        renderFavoriteState();
      });
      window.addEventListener('ingatlan-auth-changed', renderFavoriteState);
    }

    renderFavoriteState();
  }

  function renderTopMeta(data) {
    var wrap = document.getElementById('prop-top-meta');
    if (!wrap) return;
    var districtText = formatDistrictLabel(data.district, data.location || data.address || '');
    var items = [
      { text: propertyTypeLabel(data.propertyType), className: 'prop-pill prop-pill--accent' },
      { text: categoryLabel(data.category), className: 'prop-pill prop-pill--soft' },
      { text: districtText ? t('propDistrict') + ': ' + districtText : '', className: 'prop-pill' },
      { text: data.listedAt ? t('propPublishedOn', { date: formatListedDate(data.listedAt) }) : '', className: 'prop-pill' }
    ].filter(function (item) { return item.text; });
    wrap.innerHTML = items.map(function (item) {
      return '<span class="' + item.className + '">' + escapeHtml(item.text) + '</span>';
    }).join('');
    wrap.hidden = items.length === 0;
  }

  function wireContactActions(data) {
    var primaryBtn = document.getElementById('detail-primary-contact');
    var revealBtn = document.getElementById('reveal-phone');
    var phoneEl = document.getElementById('phone-revealed');
    var hintEl = document.getElementById('contact-hint');
    var contactBlock = document.getElementById('contact-block');
    var phone = (((data || {}).publisher || {}).phone || '').trim();

    function revealPhone() {
      if (phoneEl) {
        phoneEl.textContent = phone;
        phoneEl.hidden = false;
      }
      if (hintEl) hintEl.hidden = true;
      if (revealBtn) revealBtn.hidden = true;
      if (primaryBtn) {
        primaryBtn.textContent = phone;
        primaryBtn.disabled = true;
        primaryBtn.classList.remove('btn-accent');
        primaryBtn.classList.add('btn-primary');
      }
      if (contactBlock && contactBlock.scrollIntoView) contactBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function sendMessage() {
      scrollToContactTarget();
    }

    if (!phone) {
      if (phoneEl) {
        phoneEl.textContent = '';
        phoneEl.hidden = true;
      }
      if (hintEl) {
        hintEl.textContent = t('propPhoneUnavailable');
        hintEl.hidden = false;
      }
      if (revealBtn) {
        revealBtn.hidden = false;
        revealBtn.textContent = t('propSendMessage');
        revealBtn.onclick = sendMessage;
      }
      if (primaryBtn) {
        primaryBtn.hidden = false;
        primaryBtn.disabled = false;
        primaryBtn.textContent = t('propSendMessage');
        primaryBtn.classList.remove('btn-primary');
        primaryBtn.classList.add('btn-accent');
        primaryBtn.onclick = sendMessage;
      }
      return;
    }

    if (hintEl) hintEl.hidden = true;
    if (phoneEl) {
      phoneEl.textContent = phone;
      phoneEl.hidden = true;
    }
    if (revealBtn) {
      revealBtn.hidden = false;
      revealBtn.textContent = t('propRevealPhone');
      revealBtn.onclick = revealPhone;
    }
    if (primaryBtn) {
      primaryBtn.hidden = false;
      primaryBtn.disabled = false;
      primaryBtn.textContent = t('propShowPhone');
      primaryBtn.classList.remove('btn-primary');
      primaryBtn.classList.add('btn-accent');
      primaryBtn.onclick = revealPhone;
    }
  }

  function setMeta(name, content) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el) el.setAttribute('content', content);
    else {
      el = document.createElement('meta');
      el.name = name;
      el.content = content;
      document.head.appendChild(el);
    }
  }

  function setOg(property, content) {
    var el = document.querySelector('meta[property="' + property + '"]');
    if (el) el.setAttribute('content', content);
    else {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      el.content = content;
      document.head.appendChild(el);
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderBreadcrumb(data) {
    var bc = document.getElementById('breadcrumb');
    if (!bc) return;
    var base = (window.location.origin || '') + (window.location.pathname || 'property.html').replace(/[^/]+$/, '');
    var parts = [
      { url: base + 'index.html', label: 'Ingatlan' },
      { url: base + 'search.html', label: t('navSearch') },
      { url: '', label: (data && data.title) ? data.title : t('propDetailTitle') }
    ];
    bc.innerHTML = parts.map(function (p, i) {
      if (p.url) return '<a href="' + escapeHtml(p.url) + '">' + escapeHtml(p.label) + '</a>';
      return '<span aria-current="page">' + escapeHtml(p.label) + '</span>';
    }).join(' <span class="breadcrumb-sep">›</span> ');
  }

  function renderGallery(data) {
    var mainImg = document.getElementById('gallery-img');
    var thumbs = document.getElementById('gallery-thumbs');
    var main = document.getElementById('gallery-main');
    var badgesEl = document.getElementById('gallery-badges');
    var metaEl = document.getElementById('gallery-meta');
    var images = (data.images && data.images.length) ? data.images : (data.image ? [data.image] : []);
    if (!images.length) return;
    images = images.map(function (u) { return resolveImageUrl(u); });

    var mainUrl = images[0].replace(/w=\d+&h=\d+/, 'w=1200&h=750');
    if (mainImg) {
      mainImg.src = mainUrl;
      mainImg.alt = data.title || t('propDetailTitle');
      mainImg.loading = 'lazy';
    }

    if (badgesEl) {
      var galleryBadges = [];
      var category = categoryLabel(data.category);
      if (category) galleryBadges.push({ text: category, className: 'gallery-badge gallery-badge--category' });
      (data.badges || []).forEach(function (badge) {
        var key = badge === 'new' ? 'cardNew'
          : badge === 'reduced' ? 'cardReduced'
          : badge === 'urgent' ? 'cardUrgent'
          : badge === 'sale' ? 'cardSale'
          : '';
        if (!key) return;
        galleryBadges.push({ text: t(key), className: 'gallery-badge ' + badgeClass(badge) });
      });
      badgesEl.innerHTML = galleryBadges.map(function (badge) {
        return '<span class="' + badge.className + '">' + escapeHtml(badge.text) + '</span>';
      }).join('');
      badgesEl.hidden = galleryBadges.length === 0;
    }

    if (metaEl) {
      var metaItems = [];
      var photoCount = data.photoCount || images.length;
      var districtText = formatDistrictLabel(data.district, data.location || data.address || '');
      if (photoCount) metaItems.push(photoCount + t('propPhotos'));
      if (data.has3D) metaItems.push(t('prop3DTour'));
      if (data.floorPlanUrl || data.floorPlan) metaItems.push(t('propFloorPlan'));
      if (districtText) metaItems.push(districtText);
      metaEl.innerHTML = metaItems.map(function (item) {
        return '<span class="gallery-meta-item">' + escapeHtml(item) + '</span>';
      }).join('');
      metaEl.hidden = metaItems.length === 0;
    }

    if (thumbs) {
      thumbs.innerHTML = images.slice(0, 10).map(function (url, i) {
        var thumbUrl = url.replace(/w=\d+&h=\d+/, 'w=200&h=150');
        return '<button type="button"' + (i === 0 ? ' class="active"' : '') + '><img src="' + escapeHtml(thumbUrl) + '" alt="' + (i + 1) + '" loading="lazy"></button>';
      }).join('');
      thumbs.querySelectorAll('button').forEach(function (btn, i) {
        btn.addEventListener('click', function () {
          var img = btn.querySelector('img');
          if (img && mainImg) {
            var fullUrl = resolveImageUrl(img.getAttribute('src') || img.src);
            mainImg.src = fullUrl.replace(/w=\d+&h=\d+/, 'w=1200&h=750');
            thumbs.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
          }
        });
      });
    }

    if (main) {
      main.addEventListener('click', function () {
        if (document.documentElement.requestFullscreen) {
          if (!document.fullscreenElement) main.requestFullscreen && main.requestFullscreen();
          else document.exitFullscreen && document.exitFullscreen();
        }
      });
    }
  }

  function renderSidebar(data) {
    var priceEl = document.getElementById('detail-price');
    var unitEl = document.getElementById('detail-price-unit');
    var specsEl = document.getElementById('detail-quick-specs');
    var highlightsEl = document.getElementById('detail-highlights');
    var contactMetaEl = document.getElementById('contact-inline-meta');
    if (priceEl) priceEl.textContent = api.formatPrice(data.price, data.currency);
    var unitSuffix = data.currency === 'eur' ? ' €/m²' : ' Ft/m²';
    if (unitEl) unitEl.textContent = (data.pricePerSqm || 0).toLocaleString('hu-HU') + unitSuffix;
    if (specsEl) {
      var floorStr = buildFloorSummary(data);
      specsEl.innerHTML = [
        (data.area ? data.area + ' m²' : ''),
        (data.yardArea ? t('propYardArea') + ': ' + data.yardArea + ' m²' : ''),
        (data.rooms ? data.rooms + ' ' + t('unitRooms') : ''),
        (floorStr ? t('propFloor') + ': ' + floorStr : ''),
        (data.elevator ? t('propElevator') : '')
      ].filter(Boolean).map(function (s) { return '<span>' + escapeHtml(s) + '</span>'; }).join('');
    }

    if (highlightsEl) {
      var highlights = [
        data.balcony ? t('filterBalcony') : '',
        data.parking ? t('filterParking') : '',
        data.garage ? t('propGarage') : '',
        data.elevator ? t('propElevator') : '',
        data.cellar ? t('propCellar') : '',
        data.fireplace ? t('propFireplace') : '',
        data.petFriendly ? t('propPetFriendly') : '',
        data.moveIn ? t('propMoveIn') : '',
        data.ac ? t('propAC') : ''
      ].filter(Boolean);
      highlightsEl.innerHTML = highlights.map(function (item) {
        return '<span class="detail-highlight">' + escapeHtml(item) + '</span>';
      }).join('');
      highlightsEl.hidden = highlights.length === 0;
    }

    var pub = data.publisher || {};
    var nameEl = document.getElementById('publisher-name');
    var idEl = document.getElementById('publisher-id');
    var phoneEl = document.getElementById('phone-revealed');
    if (nameEl) nameEl.textContent = pub.name || '';
    if (idEl) idEl.textContent = pub.id || '';
    if (phoneEl) phoneEl.textContent = pub.phone || '';

    if (contactMetaEl) {
      var contactBits = [
        data.listedAt ? t('propPublishedOn', { date: formatListedDate(data.listedAt) }) : '',
        formatDistrictLabel(data.district, data.location || data.address || '')
      ].filter(Boolean);
      contactMetaEl.textContent = contactBits.join(' · ');
      contactMetaEl.hidden = contactBits.length === 0;
    }

    wireContactActions(data);
  }

  var CONDITION_MAP = { 'new': 'conditionNew', 'renovated': 'conditionRenovated', 'good': 'conditionGood', 'needs_renovation': 'conditionNeedsRenovation' };
  var HEATING_MAP   = { 'gas_boiler': 'heatingGasBoiler', 'district': 'heatingDistrict', 'electric': 'heatingElectric', 'heat_pump': 'heatingHeatPump', 'mixed': 'heatingMixed', 'renewable_heat_pump': 'heatingRenewableHeatPump', 'gas': 'heatingGas', 'other': 'heatingOther' };

  function renderSpecsTable(data) {
    var tbody = document.querySelector('#specs-table tbody');
    if (!tbody) return;

    var floorVal = data.floor !== undefined && data.floor !== '' && data.floor !== null ? String(data.floor) : null;
    var conditionVal = data.condition && CONDITION_MAP[data.condition] ? t(CONDITION_MAP[data.condition]) : (data.condition || null);
    var heatingVal   = data.heating   && HEATING_MAP[data.heating]    ? t(HEATING_MAP[data.heating])    : (data.heating   || null);
    var districtVal = formatDistrictLabel(data.district, data.location || data.address || '') || null;
    var propertyTypeVal = propertyTypeLabel(data.propertyType) || null;

    var rows = [
      [t('propPropertyType'), propertyTypeVal],
      [t('propDistrict'),      districtVal],
      [t('propYardArea'),      data.yardArea ? data.yardArea + ' m²' : null],
      [t('propYearBuilt'),     data.yearBuilt  || null],
      [t('propFloor'),         floorVal],
      [t('propTotalFloors'),   data.totalFloors || null],
      [t('propOrientation'),   data.orientation || null],
      [t('propCeilingHeight'), data.ceilingHeight || null],
      [t('propCondition'),     conditionVal],
      [t('propGarage'),        data.garage ? '✓' : null],
      [t('propHeating'),       heatingVal],
      [t('propCommonCost'),    data.commonCost  || null],
      [t('propAC'),            data.ac        ? '✓' : null],
      [t('propElevator'),      data.elevator  ? '✓' : null],
      [t('propAlarm'),         data.alarm     ? '✓' : null],
      [t('propGarden'),        data.garden    ? '✓' : null],
      [t('propCellar'),        data.cellar    ? '✓' : null],
      [t('propFireplace'),     data.fireplace ? '✓' : null],
      [t('propPetFriendly'),   data.petFriendly ? '✓' : null],
      [t('propEnergyCert'),    data.energyCert  || null],
      [t('propUtilities'),     data.utilities   || null],
      [t('propInternet'),      data.internet    || null],
      [t('propMortgage'),      data.mortgage    || null],
      [t('propMoveIn'),        data.moveIn    ? '✓' : null]
    ];
    var filtered = rows.filter(function (r) { return r[1]; });
    tbody.innerHTML = filtered.map(function (r) {
      return '<tr><th>' + escapeHtml(r[0]) + '</th><td>' + escapeHtml(String(r[1])) + '</td></tr>';
    }).join('');
    var section = document.getElementById('specs-section');
    if (section) section.hidden = filtered.length === 0;
  }

  function renderDescription(data) {
    var summaryEl = document.getElementById('prop-summary');
    var el = document.getElementById('prop-description');
    var section = document.getElementById('description-section');
    if (summaryEl) {
      if (data.summary) {
        summaryEl.textContent = data.summary;
        summaryEl.hidden = false;
      } else {
        summaryEl.hidden = true;
      }
    }
    if (!el) return;
    if (!data.description && !data.summary) { if (section) section.hidden = true; return; }
    var html = data.description ? data.description.split(/\n\n+/).map(function (p) { return '<p>' + escapeHtml(p.trim()) + '</p>'; }).join('') : '';
    el.innerHTML = html;
    if (section) section.hidden = false;
  }

  function renderFloorPlan(data) {
    var section = document.getElementById('floor-plan-section');
    var wrap = document.getElementById('floor-plan-wrap');
    var img = document.getElementById('floor-plan-img');
    if (!section || !img) return;
    var url = data.floorPlanUrl || data.floorPlan;
    if (!url) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    img.src = resolveImageUrl(url);
    img.alt = (data.title || '') + ' – ' + (t('propFloorPlanSection') || 'Alaprajz');
  }

  function formatPricePerSqm(val) {
    if (val >= 1e6) {
      return (val / 1e6).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' millió Ft/m²';
    }
    return (val || 0).toLocaleString('hu-HU') + ' Ft/m²';
  }

  function renderPriceCompare(data, areaData) {
    var wrap = document.getElementById('price-compare-wrap');
    var markerAvg = document.getElementById('price-marker-avg');
    var markerThis = document.getElementById('price-marker-this');
    var labelAvg = document.getElementById('price-label-avg');
    var valueAvg = document.getElementById('price-value-avg');
    var labelThis = document.getElementById('price-label-this');
    var valueThis = document.getElementById('price-value-this');
    if (!wrap || !markerAvg || !markerThis) return;
    var propPrice = data.pricePerSqm || (data.area && data.price ? Math.round(data.price / data.area) : 0);
    var avgPrice = (areaData && areaData.averagePerSqm) ? areaData.averagePerSqm : Math.round(propPrice * 0.85);
    if (!propPrice && !avgPrice) {
      wrap.closest('section').hidden = true;
      return;
    }
    wrap.closest('section').hidden = false;
    var minVal = Math.min(propPrice, avgPrice) * 0.9;
    var maxVal = Math.max(propPrice, avgPrice) * 1.1;
    if (maxVal <= minVal) maxVal = minVal + 1;
    var range = maxVal - minVal;
    var posAvg = ((avgPrice - minVal) / range) * 100;
    var posThis = ((propPrice - minVal) / range) * 100;
    var overlap = Math.abs(posAvg - posThis) < 18;
    if (overlap) {
      var center = (posAvg + posThis) / 2;
      markerAvg.style.left = (center - 6) + '%';
      markerThis.style.left = (center + 6) + '%';
      markerAvg.classList.add('price-compare-marker-above');
      markerThis.classList.add('price-compare-marker-below');
    } else {
      markerAvg.style.left = posAvg + '%';
      markerThis.style.left = posThis + '%';
      markerAvg.classList.remove('price-compare-marker-above');
      markerThis.classList.remove('price-compare-marker-below');
    }
    if (labelAvg) labelAvg.textContent = areaData && areaData.districtName ? areaData.districtName : (t('propPriceCompareAvg') || 'Átlag a környéken');
    if (valueAvg) valueAvg.textContent = formatPricePerSqm(avgPrice);
    if (labelThis) labelThis.textContent = t('propPriceCompareThis') || 'Ez az ingatlan';
    if (valueThis) valueThis.textContent = formatPricePerSqm(propPrice);
  }

  // 判断地址是否含有门牌号（如 "utca 12"、"út 3/A"、"u. 5-7" 等结尾数字）
  function hasHouseNumber(text) {
    // 常见匈牙利门牌号格式：末尾有独立数字，或 数字/字母、数字-数字
    return /\b\d+(?:[\/\-]\w+)?\s*$/.test((text || '').trim());
  }

  function renderMap(data) {
    var wrap = document.getElementById('map-embed-wrap');
    var iframe = document.getElementById('map-iframe');
    var addressEl = document.getElementById('map-address');
    var districtEl = document.getElementById('map-district');
    var mapNoteEl = document.getElementById('map-precision-note');
    if (!wrap || !iframe) return;
    var address = (data.address || '').trim();
    var lat = data.lat;
    var lng = data.lng;
    var location = (data.location || '').trim();
    var queryText = address || location;
    var parsed = parseDistrictFromLocation(queryText);
    var districtCode = normalizeDistrictCode(data.district || (parsed && parsed.districtLabel));
    var districtText = formatDistrictLabel(data.district, queryText);

    if (districtEl) {
      if (districtText) {
        districtEl.textContent = t('propDistrict') + ': ' + districtText;
        districtEl.hidden = false;
      } else {
        districtEl.hidden = true;
      }
    }

    // 判断精度级别
    var hasLatLng = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
    var hasNum = hasHouseNumber(queryText);
    var hasDistrict = !!districtCode;
    // 精度：precise（精确门牌）/ street（街道）/ district（区份）/ area（模糊地区）
    var precision = hasLatLng ? 'precise' : hasNum ? 'precise' : (queryText && !parsed) ? 'street' : hasDistrict ? 'district' : 'area';

    // 地图精度说明
    if (mapNoteEl) {
      var noteText = '';
      if (precision === 'precise') noteText = '';
      else if (precision === 'street') noteText = (window.i18n && window.i18n.t('mapNoteStreet')) || '📍 地图标注为街道级别大概位置，实际位置以联系发布者为准。';
      else if (precision === 'district') noteText = (window.i18n && window.i18n.t('mapNoteDistrict')) || '📍 地图标注为区份中心大概位置，实际位置以联系发布者为准。';
      else noteText = (window.i18n && window.i18n.t('mapNoteArea')) || '📍 地图标注为大概区域位置，实际位置以联系发布者为准。';
      mapNoteEl.textContent = noteText;
      mapNoteEl.hidden = !noteText;
    }

    var src = '';
    if (hasLatLng) {
      // 精确坐标 → 放大显示
      src = 'https://www.google.com/maps?q=' + lat + ',' + lng + '&z=17&output=embed';
    } else if (hasNum) {
      // 含门牌号地址 → 放大到街道 + 门牌
      src = 'https://www.google.com/maps?q=' + encodeURIComponent(queryText) + '&z=17&output=embed';
    } else if (queryText && !parsed) {
      // 仅街道名（无门牌号）→ 缩小到可以看到整条街
      src = 'https://www.google.com/maps?q=' + encodeURIComponent(queryText) + '&z=15&output=embed';
    } else if (hasDistrict && BUDAPEST_DISTRICT_CENTERS[districtNumberFromCode(districtCode)]) {
      // 区份 → 区份中心
      var c = BUDAPEST_DISTRICT_CENTERS[districtNumberFromCode(districtCode)];
      src = 'https://www.google.com/maps?q=' + c.lat + ',' + c.lng + '&z=14&output=embed';
    } else if (queryText) {
      src = 'https://www.google.com/maps?q=' + encodeURIComponent(queryText) + '&z=13&output=embed';
    }

    if (src) {
      iframe.src = src;
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }
    if (addressEl) {
      if (address) {
        addressEl.textContent = address;
        addressEl.hidden = false;
      } else {
        addressEl.hidden = true;
      }
    }
  }

  function updateSEO(data, canonicalUrl) {
    document.title = (data.title || t('propDetailTitle')) + ' | Ingatlan';
    setMeta('description', (data.subtitle || data.title || '') + ' – ' + (data.location || ''));
    setOg('og:title', (data.title || '') + ' | Ingatlan');
    setOg('og:description', (data.subtitle || data.description || '').slice(0, 200));
    setOg('og:image', resolveImageUrl((data.images && data.images[0]) ? data.images[0] : (data.image || '')));
    setOg('og:url', canonicalUrl);
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
  }

  function injectJsonLd(data, canonicalUrl) {
    var existing = document.getElementById('ingatlan-jsonld');
    if (existing) existing.remove();
    var img = resolveImageUrl((data.images && data.images[0]) || data.image || '');
    var json = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: data.title,
      description: (data.description || '').slice(0, 500),
      image: img,
      url: canonicalUrl,
      offers: {
        '@type': 'Offer',
        price: data.price,
        priceCurrency: 'HUF'
      }
    };
    var script = document.createElement('script');
    script.id = 'ingatlan-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(json);
    document.head.appendChild(script);
  }

  function show404() {
    document.getElementById('property-404').hidden = false;
    document.getElementById('property-root').hidden = true;
  }

  function showContent() {
    document.getElementById('property-404').hidden = true;
    document.getElementById('property-root').hidden = false;
  }

  // Contact form
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      alert(window.i18n ? window.i18n.t('contactFormSuccess') : 'Üzenet elküldve. A hirdető hamarosan válaszol.');
    });
  }

  var id = getPropId();
  if (!id) {
    show404();
    renderBreadcrumb(null);
    return;
  }

  var canonicalUrl = (window.location.origin || '') + window.location.pathname + '?id=' + encodeURIComponent(id);

  api.getListingById(id).then(function (data) {
    if (!data) {
      show404();
      renderBreadcrumb(null);
      return;
    }
    showContent();
    renderBreadcrumb(data);
    document.getElementById('prop-title').textContent = data.title || '';
    document.getElementById('prop-subtitle').textContent = data.subtitle || '';
    renderTopMeta(data);
    renderGallery(data);
    renderSidebar(data);
    renderSpecsTable(data);
    renderDescription(data);
    renderFloorPlan(data);
    renderMap(data);
    updateSEO(data, canonicalUrl);
    injectJsonLd(data, canonicalUrl);

    bindFavoriteButton(id);

  }).catch(function () {
    show404();
    renderBreadcrumb(null);
  });
})();
