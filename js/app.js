(function () {
  'use strict';

  const STORAGE_KEY = 'daftar_v1';
  const entriesEl = document.getElementById('entries');
  const composer = document.getElementById('composer');
  const composerTitle = document.getElementById('composer-title');
  const composerBody = document.getElementById('composer-body');
  const searchInput = document.getElementById('search');
  const announcer = document.getElementById('announcer');

  let notes = [];
  let editingId = null;
  let searchQuery = '';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const escapeHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  };

  const announce = (msg) => {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 60);
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch (e) {}
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        notes = JSON.parse(raw);
      } else {
        notes = [
          {
            id: uid(),
            title: 'من كتاب',
            body: 'الكتابة هي القراءة مرتين: مرة للفهم، ومرة للاحتفاظ بما يستحق الاحتفاظ.',
            createdAt: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: uid(),
            title: '',
            body: 'فكرة قبل النوم: الأشياء الصغيرة التي لا نلاحظها هي التي تشكّل يومنا كله.',
            createdAt: new Date(Date.now() - 86400000).toISOString()
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
          if (!confirm('حذف هذه الملاحظة؟')) return;
          el.classList.add('is-leaving');
          setTimeout(() => {
            notes = notes.filter(n => n.id !== id);
            save();
            render();
            announce('حُذفت الملاحظة');
          }, 200);
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
    }, 150);
  });

  load();
  render();
})();
