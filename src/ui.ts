// Alat bantu tampilan kecil yang dipakai semua halaman.

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export function hariIni() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function selisihHari(dari: string, sampai: string) {
  return Math.round((Date.parse(sampai) - Date.parse(dari)) / 864e5);
}

let tTimer = 0;
export function toast(pesan: string, jenis: 'ok' | 'galat' = 'ok') {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.textContent = pesan;
  t.className = 'toast ' + jenis + ' tampil';
  clearTimeout(tTimer);
  tTimer = window.setTimeout(() => t.classList.remove('tampil'), 3800);
}

export async function salin(teks: string) {
  try {
    await navigator.clipboard.writeText(teks);
  } catch {
    const a = document.createElement('textarea');
    a.value = teks;
    document.body.append(a);
    a.select();
    document.execCommand('copy');
    a.remove();
  }
}

export function unduh(nama: string, isi: string, tipe = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + isi], { type: tipe }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nama });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tombol pilihan (.seg) dengan latar putih yang bergeser halus ke pilihan aktif.
export function segHalus(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.seg:not([data-halus])').forEach((seg) => {
    seg.dataset.halus = '1';
    const t = document.createElement('i');
    t.className = 'seg-thumb';
    t.setAttribute('aria-hidden', 'true');
    seg.prepend(t);
    const atur = (gerak = true) => {
      const on = seg.querySelector<HTMLElement>('button.on');
      if (!on || !on.offsetWidth) return void (t.style.opacity = '0');
      if (!gerak) t.style.transition = 'none';
      t.style.opacity = '1';
      t.style.width = on.offsetWidth + 'px';
      t.style.height = on.offsetHeight + 'px';
      t.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      if (!gerak) requestAnimationFrame(() => (t.style.transition = ''));
    };
    atur(false);
    new MutationObserver(() => atur()).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if ('ResizeObserver' in window) new ResizeObserver(() => atur(false)).observe(seg);
  });
}
