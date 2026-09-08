(function () {
  'use strict';

  /* ---------- Мобильное меню ---------- */
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');

  function closeNav() {
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  burger.addEventListener('click', function () {
    const open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  });

  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeNav();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* ---------- Появление секций при скролле ---------- */
  const revealed = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add('in-view'); });
  }

  /* ---------- Интерактивная схема: 2 состояния ---------- */
  const scheme = document.getElementById('scheme');
  if (scheme) {
    const canvas = scheme.querySelector('.scheme__canvas');
    const points = scheme.querySelectorAll('.scheme__point');
    const tooltip = document.getElementById('schemeTooltip');
    const tooltipTitle = tooltip.querySelector('.scheme__tooltip-title');
    const tooltipText = tooltip.querySelector('.scheme__tooltip-text');

    const STATES = {
      outdoor: {
        title: 'Наружный блок',
        text: 'Установка на фасад, балкон, крышу или цоколь. Внутри компрессор, который обслуживает все комнаты сразу.'
      },
      indoor: {
        title: 'Внутренние блоки',
        text: 'От двух до пяти, по одному в комнате. Каждый держит свою температуру, ненужные можно выключить.'
      }
    };

    const TOOLTIP_TOP = 300;  // положение по макету, если точки не мешают
    const GAP = 4;            // зазор между тултипом и ядром точки
    const BOTTOM_GAP = 40;    // тултип не прижимается к нижнему краю окна

    // зум выбранного состояния задаётся в CSS (--scheme-zoom) под каждый вьюпорт
    function getZoom() {
      return parseFloat(getComputedStyle(scheme).getPropertyValue('--scheme-zoom')) || 1.05;
    }

    // мобильный режим: тултип в потоке под схемой, а не абсолютом поверх неё
    function isMobileTip() {
      return window.matchMedia('(max-width: 767px)').matches;
    }

    let current = null; // старт — просто картинка, ничего не выбрано
    let fadeTimer = null;

    // итоговый margin-bottom канвы из CSS (обрезка низа карточкой)
    function cssEndMargin() {
      return parseFloat(getComputedStyle(canvas).marginBottom) || 0;
    }

    // «камера» для текущего состояния: сдвиг и масштаб канвы.
    // Габариты карточки НЕ меняются — зум живёт внутри фиксированного окна
    function stateTransform() {
      if (!current) return { tx: 0, ty: 0, z: 1 };
      const z = getZoom();
      const SW = scheme.clientWidth;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const C = W / 2;
      if (z <= 1.1) {
        // десктоп: лёгкий зум и сдвиг к краю с заходом на паддинг карточки —
        // так тултип меньше перекрывает картинку (окно расширено под это)
        const P = Math.abs(canvas.offsetLeft) + Math.max(0, (W * z - SW) / 2) + 48;
        return { tx: current === 'outdoor' ? P : -P, ty: 0, z: z };
      }
      const maxTx = C * (z - 1);            // левый край не ниже левой кромки
      const minTx = SW - C - (W - C) * z;   // правый край не выше правой кромки

      if (isMobileTip()) {
        // мобилка (геометрия макета): зум от центра, вертикаль на месте,
        // сдвиг ±20% ширины иллюстрации (наружный — влевый край,
        // внутренние — зеркально вправо)
        const shift = 0.203 * W;
        return {
          tx: current === 'outdoor' ? shift : -shift,
          ty: 0,
          z: z
        };
      }

      // планшет: горизонтальный наезд, по вертикали схема на месте;
      // пустота в окне допустима только со стороны тултипа
      const f = current === 'outdoor'
        ? { x: 0.189, tx: 0.50 }  // точка наружного блока
        : { x: 0.564, tx: 0.45 }; // центр внутренних точек
      let tx = SW * f.tx - C - (f.x * W - C) * z;
      if (current === 'outdoor') {
        tx = Math.max(tx, minTx); // тултип слева — слева поле разрешено
      } else {
        tx = Math.min(tx, maxTx); // тултип справа — справа поле разрешено
      }
      return { tx: tx, ty: 0, z: z };
    }

    function applyPan() {
      const t = stateTransform();
      canvas.style.transform = current
        ? 'translate(' + t.tx + 'px,' + t.ty + 'px) scale(' + t.z + ')'
        : '';
    }

    // предсказанные (конечные, после анимации) круги точек;
    // радиус считаем по красному ядру точки — полупрозрачный ореол не в счёт
    function finalPointRects() {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const C = W / 2;
      const t = stateTransform();
      const L = canvas.offsetLeft + t.tx;
      const T = canvas.offsetTop + t.ty;
      return Array.prototype.map.call(points, function (p) {
        const active = p.classList.contains('is-active');
        const xPct = parseFloat(p.style.getPropertyValue('--x')) / 100;
        const yPct = parseFloat(p.style.getPropertyValue('--y')) / 100;
        return {
          active: active,
          r: ((active ? 24 : 16) * t.z) / 2 + GAP,
          cx: L + C + (xPct * W - C) * t.z, // зум от центра по горизонтали
          cy: T + yPct * H * t.z            // и от верха канвы по вертикали
        };
      });
    }

    // ставим тултип так, чтобы он не накрывал ни одну точку,
    // и направляем острый угол в сторону активной точки
    function positionTooltip() {
      tooltip.style.top = '';
      if (!current || isMobileTip()) return;

      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      const tLeft = current === 'indoor' ? scheme.clientWidth - tw : 0;
      const tRight = tLeft + tw;
      const rects = finalPointRects();

      // мешают только точки в горизонтальной полосе тултипа
      const pts = rects.filter(function (pt) {
        return pt.cx + pt.r > tLeft && pt.cx - pt.r < tRight;
      });
      const collides = function (top) {
        return pts.some(function (pt) {
          return pt.cy + pt.r > top && pt.cy - pt.r < top + th;
        });
      };

      // тултип живёт внутри окна схемы с отступом от нижнего края
      const finalH = canvas.offsetTop + canvas.offsetHeight + cssEndMargin();
      const maxTop = finalH - th - BOTTOM_GAP;
      const fits = function (t) { return t >= 0 && t <= maxTop && !collides(t); };

      let top = TOOLTIP_TOP;
      if (!fits(top)) {
        let placed = false;
        if (pts.length) {
          const minY = Math.min.apply(null, pts.map(function (pt) { return pt.cy - pt.r; }));
          const maxY = Math.max.apply(null, pts.map(function (pt) { return pt.cy + pt.r; }));
          // над мешающими точками, у верха окна, под точками — что влезет
          const candidates = [minY - th, 0, maxY];
          for (let i = 0; i < candidates.length; i++) {
            if (fits(candidates[i])) { top = candidates[i]; placed = true; break; }
          }
        }
        if (!placed) top = Math.max(0, Math.min(top, maxTop));
      }
      tooltip.style.top = top + 'px';

      // хвостик: вниз, если тултип выше активной точки, вверх — если ниже
      const act = rects.filter(function (pt) { return pt.active; });
      const anchor = current === 'indoor'
        ? act.reduce(function (a, b) { return a.cx > b.cx ? a : b; })
        : act[0];
      tooltip.classList.toggle('scheme__tooltip--tail-up', anchor && top > anchor.cy);
    }

    function renderTooltip(state) {
      tooltipTitle.textContent = STATES[state].title;
      tooltipText.textContent = STATES[state].text;
      tooltip.classList.toggle('scheme__tooltip--right', state === 'indoor');
      positionTooltip();
    }

    function setState(state) {
      if (state === current) return;
      const first = current === null;
      current = state;

      points.forEach(function (p) {
        p.classList.toggle('is-active', state !== null && p.dataset.unit === state);
      });
      applyPan();

      clearTimeout(fadeTimer);
      if (state === null) {
        // сворачиваемся в нейтральное состояние
        tooltip.classList.add('is-fading');
        fadeTimer = setTimeout(function () {
          tooltip.classList.add('is-hidden');
          tooltip.classList.remove('is-fading');
        }, 300);
      } else if (first) {
        renderTooltip(state);
        tooltip.classList.remove('is-hidden');
      } else {
        tooltip.classList.add('is-fading');
        fadeTimer = setTimeout(function () {
          renderTooltip(state);
          tooltip.classList.remove('is-fading');
        }, 300);
      }
    }

    points.forEach(function (point) {
      point.addEventListener('click', function () {
        // повторный клик по активной точке сворачивает выбор
        setState(point.classList.contains('is-active') ? null : point.dataset.unit);
      });
    });

    window.addEventListener('resize', function () {
      applyPan();
      positionTooltip();
    });
  }

  /* ---------- FAQ: анимация раскрытия + один открытый за раз ---------- */
  const faqList = document.getElementById('faqList');
  if (faqList) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function animateAcc(acc, opening) {
      const content = acc.querySelector('.accordion__answer');
      if (!content || reduceMotion) {
        acc.open = opening;
        return;
      }
      acc.dataset.busy = '1';
      if (opening) acc.open = true;
      const h = content.offsetHeight;
      // паддинги анимируются вместе с высотой, иначе блок стартует
      // скачком на величину паддинга (border-box не даёт сжаться ниже)
      const cs = getComputedStyle(content);
      const collapsed = { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };
      const expanded = { height: h + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 };
      content.style.overflow = 'hidden';
      const frames = opening ? [collapsed, expanded] : [expanded, collapsed];
      let finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        if (!opening) acc.open = false;
        content.style.overflow = '';
        delete acc.dataset.busy;
      }
      content.animate(frames, {
        duration: 250,
        easing: 'ease'
      }).onfinish = finish;
      // страховка: onfinish может не сработать при прерывании анимации
      setTimeout(finish, 320);
    }

    faqList.querySelectorAll('.accordion').forEach(function (acc) {
      acc.querySelector('.accordion__summary').addEventListener('click', function (e) {
        e.preventDefault();
        if (acc.dataset.busy) return;
        if (acc.open) {
          animateAcc(acc, false);
        } else {
          // соседний открытый сворачивается с той же анимацией
          faqList.querySelectorAll('details[open]').forEach(function (d) {
            if (d !== acc && !d.dataset.busy) animateAcc(d, false);
          });
          animateAcc(acc, true);
        }
      });
    });
  }

  /* ---------- Лид-форма (без бэкенда: валидация + заглушка) ---------- */
  const form = document.getElementById('leadForm');
  if (form) {
    const phoneInput = document.getElementById('phone');

    /* Маска телефона: +7 000 000-00-00. Буквы и лишние символы
       отбрасываются, ведущие 7/8 считаются кодом страны */
    function phoneDigits(value) {
      let d = value.replace(/\D/g, '');
      if (d.charAt(0) === '7' || d.charAt(0) === '8') d = d.slice(1);
      return d.slice(0, 10);
    }
    function formatPhone(d) {
      let out = '+7';
      if (d.length > 0) out += ' ' + d.slice(0, 3);
      if (d.length > 3) out += ' ' + d.slice(3, 6);
      if (d.length > 6) out += '-' + d.slice(6, 8);
      if (d.length > 8) out += '-' + d.slice(8, 10);
      return out;
    }
    phoneInput.addEventListener('input', function () {
      const d = phoneDigits(phoneInput.value);
      phoneInput.value = d.length ? formatPhone(d) : '';
    });
    phoneInput.addEventListener('focus', function () {
      if (!phoneInput.value) phoneInput.value = '+7 ';
    });
    phoneInput.addEventListener('blur', function () {
      if (phoneDigits(phoneInput.value).length === 0) phoneInput.value = '';
    });

    /* Валидация: все поля обязательные, у каждого свой текст ошибки */
    function setError(input, message) {
      const field = input.closest('.field');
      field.classList.toggle('is-invalid', !!message);
      field.querySelector('.field__error').textContent = message || '';
    }
    function validate() {
      const checks = [
        { id: 'city', error: 'Укажите ваш город' },
        { id: 'name', error: 'Укажите ваше имя' },
        { id: 'phone', error: 'Укажите номер телефона' }
      ];
      let firstInvalid = null;
      checks.forEach(function (c) {
        const input = document.getElementById(c.id);
        let message = '';
        if (!input.value.trim() || (c.id === 'phone' && phoneDigits(input.value).length === 0)) {
          message = c.error;
        } else if (c.id === 'phone' && phoneDigits(input.value).length < 10) {
          message = 'Введите номер полностью: +7 000 000-00-00';
        } else if (c.id === 'phone' && /^[0-2]/.test(phoneDigits(input.value))) {
          // в РФ код после +7 не начинается с 0, 1 или 2
          message = 'Проверьте номер — код не может начинаться с ' + phoneDigits(input.value).charAt(0);
        }
        setError(input, message);
        if (message && !firstInvalid) firstInvalid = input;
      });
      if (firstInvalid) firstInvalid.focus();
      return !firstInvalid;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;

      const data = Object.fromEntries(new FormData(form).entries());

      // ловушка для ботов: люди это поле не видят и не заполняют
      if (data.website) return;
      delete data.website;

      /* === ТОЧКА ИНТЕГРАЦИИ С БЭКЕНДОМ (см. INTEGRATION.md) ===
         Замените console.log на отправку, например:
         fetch('/api/lead', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data)
         });
         Поля: objectType, rooms, city, name, phone (в формате +7 000 000-00-00) */
      console.log('Заявка:', data);

      // событие для аналитики: цель в Яндекс.Метрику (если счётчик включён)
      // + dataLayer для GTM/GA
      if (typeof ym === 'function' && window.YM_COUNTER_ID) {
        ym(window.YM_COUNTER_ID, 'reachGoal', 'lead_form_submit');
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'lead_form_submit', form: 'configurator' });

      form.classList.add('is-sent');
      const success = document.createElement('div');
      success.className = 'configurator__success';
      success.innerHTML =
        '<h2>Спасибо! Заявка отправлена</h2>' +
        '<p>Мы свяжемся с вами, подберём комплект и подскажем, где купить.</p>';
      form.appendChild(success);
      success.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    /* ошибка снимается, как только пользователь начал исправлять поле */
    form.addEventListener('input', function (e) {
      const field = e.target.closest && e.target.closest('.field');
      if (field) {
        field.classList.remove('is-invalid');
        field.querySelector('.field__error').textContent = '';
      }
    });
  }

  /* ---------- Галереи карточек моделей ----------
     Слайды задаются атрибутом data-slides='["a.jpg","b.jpg"]' на .model-card;
     без атрибута галерея состоит из одного текущего фото */
  document.querySelectorAll('.model-card').forEach(function (card) {
    const viewport = card.querySelector('.model-card__viewport');
    const arrows = card.querySelectorAll('.model-card__arrow');
    let img = card.querySelector('.model-card__bg');
    let slides;
    try {
      slides = card.dataset.slides ? JSON.parse(card.dataset.slides) : null;
    } catch (e) { slides = null; }
    if (!slides || slides.length < 2) {
      arrows.forEach(function (a) { a.classList.add('is-disabled'); });
      return;
    }
    let idx = 0;
    let busy = false;
    const EASE = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'none'
      : 'transform 0.55s cubic-bezier(0.65, 0, 0.35, 1)';

    function preload(i) {
      const im = new Image();
      im.src = slides[(i + slides.length) % slides.length];
    }
    // соседние слайды тяжёлые — прелоадим только когда карточка на экране
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          preload(1);
          preload(-1);
          io.disconnect();
        }
      }, { rootMargin: '200px' });
      io.observe(card);
    }

    // карусель: текущий слайд уезжает, новый въезжает в сторону стрелки
    function go(dir) {
      if (busy) return;
      busy = true;
      const nextIdx = (idx + dir + slides.length) % slides.length;
      const cur = img;
      const next = document.createElement('img');
      next.className = 'model-card__bg';
      next.alt = cur.alt;
      next.src = slides[nextIdx];
      next.style.transform = 'translateX(' + (dir > 0 ? '100%' : '-100%') + ')';
      viewport.appendChild(next);

      function start() {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            cur.style.transition = EASE;
            next.style.transition = EASE;
            cur.style.transform = 'translateX(' + (dir > 0 ? '-100%' : '100%') + ')';
            next.style.transform = 'translateX(0)';
          });
        });
        setTimeout(function () {
          cur.remove();
          next.style.transition = '';
          img = next;
          idx = nextIdx;
          busy = false;
          preload(idx + dir);
        }, 600);
      }
      // ждём декодирования нового кадра, чтобы не было рывка,
      // но не дольше 1.5с — дальше едем с тем, что есть
      let started = false;
      function startOnce() {
        if (started) return;
        started = true;
        start();
      }
      if (next.decode) {
        next.decode().then(startOnce, startOnce);
        setTimeout(startOnce, 1500);
      } else {
        startOnce();
      }
    }

    arrows.forEach(function (btn) {
      btn.addEventListener('click', function () { go(Number(btn.dataset.dir)); });
    });

    // свайп по фото (планшет/мобилка): влево — следующий, вправо — предыдущий
    let touchX = 0;
    let touchY = 0;
    viewport.addEventListener('touchstart', function (e) {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    viewport.addEventListener('touchend', function (e) {
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        go(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  });

  /* ---------- Аналитика: клики по CTA «Подобрать» ----------
     Одна цель cta_click с параметром place: header / mobile_menu / hero / types */
  document.querySelectorAll('a[href="#configurator"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const place = btn.classList.contains('types__cta') ? 'types'
        : btn.classList.contains('header__nav-cta') ? 'mobile_menu'
        : btn.classList.contains('header__cta') ? 'header'
        : 'hero';
      if (typeof ym === 'function' && window.YM_COUNTER_ID) {
        ym(window.YM_COUNTER_ID, 'reachGoal', 'cta_click', { place: place });
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'cta_click', place: place });
    });
  });

  /* ---------- Год в копирайте ---------- */
  const copyYear = document.getElementById('copyYear');
  if (copyYear) copyYear.textContent = new Date().getFullYear();

  /* ---------- Кнопка «наверх» ---------- */
  const topBtn = document.getElementById('scrollTop');
  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- Кнопка-лифт: появляется после 600px прокрутки,
     прячется, когда виден футер (там своя стрелка) ---------- */
  const lift = document.getElementById('lift');
  if (lift) {
    const footerEl = document.querySelector('.footer');
    let footerVisible = false;

    function updateLift() {
      lift.classList.toggle('is-visible', window.scrollY > 600 && !footerVisible);
    }
    lift.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('scroll', updateLift, { passive: true });
    if (footerEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        footerVisible = entries[0].isIntersecting;
        updateLift();
      }).observe(footerEl);
    }
    updateLift();
  }
})();
