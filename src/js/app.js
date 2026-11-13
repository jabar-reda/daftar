(function () {
  'use strict';

  const FONT_REVEAL_TIMEOUT_MS = 2000;

  // إخفاء المحتوى حتى جهوزية الخطوط لتلطيف وميض التبديل، مع مهلة أمان إن تعطلت الشبكة
  document.documentElement.classList.add('is-font-loading');
  const revealPage = () => {
    document.documentElement.classList.remove('is-font-loading');
    document.documentElement.classList.add('is-font-ready');
  };
  const revealTimer = setTimeout(revealPage, FONT_REVEAL_TIMEOUT_MS);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      clearTimeout(revealTimer);
      revealPage();
    });
  } else {
    revealPage();
  }

  const STORAGE_KEY = 'daftar_v1';
  /* مفتاح منفصل عن الملاحظات: عَلَم رؤية نافذة الترحيب */
  const POPUP_SEEN_KEY = 'daftar_seen_v1';
  const SEARCH_DEBOUNCE_MS = 150;
  /* يجب أن يطابق مدة حركة is-leaving في styles.css وإلا تُحذف الملاحظة قبل أن تختفي */
  const DELETE_ANIMATION_MS = 200;
  const ANNOUNCE_CLEAR_MS = 60;
  const HOUR_MS = 3600000;
  const DAY_MS = 86400000;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const entriesEl = document.getElementById('entries');
  const composer = document.getElementById('composer');
  const composerTitle = document.getElementById('composer-title');
  const composerBody = document.getElementById('composer-body');
  const searchInput = document.getElementById('search');
  const announcer = document.getElementById('announcer');
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmDeleteBtn = document.getElementById('confirm-delete');
  const confirmCancelBtn = document.getElementById('confirm-cancel');
  const popupEl = document.getElementById('popup');

  let notes = [];
  let editingId = null;
  let searchQuery = '';
  let pendingDeleteId = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // innerHTML لا يهرّب علامات الاقتباس، وهي خطرة داخل value="..." في نموذج التعديل
  const escapeHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML.replace(/"/g, '&quot;');
  };

  // تفريغ النص ثم ملؤه يعيد تشغيل إعلان aria-live للقارئات الشاشية
  const announce = (msg) => {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, ANNOUNCE_CLEAR_MS);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat('ar-EG', {
      day: 'numeric',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' })
    }).format(d);
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
      announce('تعذّر الحفظ؛ قد يكون التخزين ممتلئاً أو مُعطَّلاً');
    }
  };

  // معرفات uid() حرف ورمز فقط ([a-z0-9])، وهذا يضمن سلامتها داخل القوالب ومحددات CSS
  const isValidNote = (n) => {
    if (!n || typeof n !== 'object') return false;
    if (typeof n.id !== 'string' || !/^[a-z0-9]+$/.test(n.id)) return false;
    if (typeof n.title !== 'string' || typeof n.body !== 'string') return false;
    if (!n.title && !n.body) return false;
    return !Number.isNaN(new Date(n.createdAt).getTime());
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // تُهمَل المدخلات التالفة بدل أن يتعطل التطبيق كله، ولا تُكتب فوقها حفاظاً على بقيتها
        notes = Array.isArray(parsed) ? parsed.filter(isValidNote) : [];
      } else {
        // ملاحظتا ترحيب عند أول تشغيل فقط
        notes = [
          {
            id: uid(),
            title: 'من كتاب',
            body: 'الكتابة هي القراءة مرتين: مرة للفهم، ومرة للاحتفاظ بما يستحق الاحتفاظ.',
            createdAt: new Date(Date.now() - HOUR_MS).toISOString()
          },
          {
            id: uid(),
            title: '',
            body: 'فكرة قبل النوم: الأشياء الصغيرة التي لا نلاحظها هي التي تشكّل يومنا كله.',
            createdAt: new Date(Date.now() - DAY_MS).toISOString()
          }
        ];
        save();
      }
    } catch (e) { notes = []; }
  };

  const visibleNotes = () => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.trim().toLowerCase();
    return notes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q)
    );
  };

  const renderEntry = (note) => {
    const isEditing = editingId === note.id;
    const hasTitle = note.title && note.title.trim();

    if (isEditing) {
      return `
        <article class="entry editing" data-id="${note.id}">
          <form class="entry-form" data-id="${note.id}">
            <input type="text" class="edit-title" value="${escapeHtml(note.title || '')}" placeholder="العنوان" maxlength="80" aria-label="العنوان">
            <textarea class="edit-body" placeholder="المحتوى" aria-label="المحتوى">${escapeHtml(note.body || '')}</textarea>
            <div class="entry-form-actions">
              <button type="button" class="btn-text cancel">إلغاء</button>
              <button type="submit" class="btn-text save">حفظ</button>
            </div>
          </form>
        </article>`;
    }

    return `
      <article class="entry" data-id="${note.id}">
        ${hasTitle ? `<h2 class="entry-title">${escapeHtml(note.title)}</h2>` : ''}
        <p class="entry-body">${escapeHtml(note.body || '')}</p>
        <div class="entry-meta">
          <time class="entry-date" datetime="${note.createdAt}">${formatDate(note.createdAt)}</time>
        </div>
        <div class="entry-actions">
          <button type="button" class="act-edit" aria-label="تعديل الملاحظة" title="تعديل">✎</button>
          <button type="button" class="act-delete" aria-label="حذف الملاحظة" title="حذف">✕</button>
        </div>
      </article>`;
  };

  const render = () => {
    const list = visibleNotes();

    if (list.length === 0) {
      const msg = notes.length === 0
        ? 'لا توجد ملاحظات بعد. اكتب أول ملاحظة في الأعلى.'
        : 'لا توجد نتائج مطابقة.';
      entriesEl.innerHTML = `
        <div class="empty">
          <span class="empty-mark"></span>
          <p>${msg}</p>
        </div>`;
      return;
    }

    const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    entriesEl.innerHTML = sorted.map(renderEntry).join('');
    // innerHTML يمحو مستمعي الأحداث القديمة، لذا تُربط الأزرار من جديد بعد كل رسم
    bindEntryEvents();
  };

  const bindEntryEvents = () => {
    entriesEl.querySelectorAll('.entry').forEach(el => {
      const id = el.dataset.id;

      const editBtn = el.querySelector('.act-edit');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          editingId = id;
          render();
          const input = entriesEl.querySelector(`.entry[data-id="${id}"] .edit-title`);
          if (input) input.focus();
        });
      }

      const delBtn = el.querySelector('.act-delete');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          pendingDeleteId = id;
          confirmDialog.showModal();
          confirmDeleteBtn.focus();
        });
      }

      const form = el.querySelector('.entry-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const newTitle = form.querySelector('.edit-title').value.trim();
          const newBody = form.querySelector('.edit-body').value.trim();
          if (!newTitle && !newBody) {
            announce('الملاحظة فارغة، أضف نصاً أو عنواناً');
            return;
          }
          const idx = notes.findIndex(n => n.id === id);
          if (idx !== -1) {
            notes[idx].title = newTitle;
            notes[idx].body = newBody;
            save();
          }
          editingId = null;
          render();
          announce('حُفظت التعديلات');
        });

        form.querySelector('.cancel').addEventListener('click', () => {
          editingId = null;
          render();
        });
      }
    });
  };

  // حوار تأكيد الحذف: زر الحذف في القيد يفتحه، وزر «حذف» فيه يكمل العملية
  confirmDeleteBtn.addEventListener('click', () => {
    const id = pendingDeleteId;
    pendingDeleteId = null;
    confirmDialog.close();
    const entryEl = entriesEl.querySelector(`.entry[data-id="${id}"]`);
    if (!entryEl) return;
    entryEl.classList.add('is-leaving');
    // مع تقليل الحركة تنتهي الحركة فوراً، فلا داعي للانتظار
    const waitMs = prefersReducedMotion ? 0 : DELETE_ANIMATION_MS;
    setTimeout(() => {
      notes = notes.filter(n => n.id !== id);
      save();
      render();
      announce('حُذفت الملاحظة');
    }, waitMs);
  });

  confirmCancelBtn.addEventListener('click', () => {
    pendingDeleteId = null;
    confirmDialog.close();
  });

  // نافذة الترحيب: أول زيارة فقط، وأي إغلاق (زر أو Esc) يسجلها حتى لا تعود
  const popupSeen = () => {
    try {
      return localStorage.getItem(POPUP_SEEN_KEY) === '1';
    } catch (e) {
      // تخزين مُعطَّل: لا نُزعج المستخدم بنافذة تكرر في كل تحميل
      return true;
    }
  };
  const markPopupSeen = () => {
    try {
      localStorage.setItem(POPUP_SEEN_KEY, '1');
    } catch (e) {}
  };
  popupEl.addEventListener('close', markPopupSeen);
  if (!popupSeen()) {
    popupEl.showModal();
  }
  popupEl.querySelectorAll('.js-dismiss').forEach((btn) => {
    btn.addEventListener('click', () => popupEl.close());
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = composerTitle.value.trim();
    const body = composerBody.value.trim();

    if (!title && !body) {
      announce('اكتب شيئاً أولاً');
      composerBody.focus();
      return;
    }

    const note = {
      id: uid(),
      title,
      body,
      createdAt: new Date().toISOString()
    };
    notes.push(note);
    save();

    composerTitle.value = '';
    composerBody.value = '';
    composerTitle.focus();
    editingId = null;

    if (searchQuery) {
      searchInput.value = '';
      searchQuery = '';
    }

    render();
    const newEl = entriesEl.querySelector(`.entry[data-id="${note.id}"]`);
    if (newEl) newEl.classList.add('is-new');
    announce('أُضيفت الملاحظة');
  });

  // إضافة الملاحظة بـ Ctrl+Enter (أو ⌘+Enter على ماك) من أي حقل في النموذج
  [composerTitle, composerBody].forEach(el => {
    el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        composer.dispatchEvent(new Event('submit'));
      }
    });
  });

  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      editingId = null;
      render();
    }, SEARCH_DEBOUNCE_MS);
  });

  load();
  render();
})();
