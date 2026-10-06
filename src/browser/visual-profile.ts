// Shared by Playwright and the native Chromium IPC bridge. Captures the actual
// authenticated tab without reopening it in a separate automation session.
export const visualProfileScript = String.raw`(() => {
  const layout = Array.from(document.querySelectorAll('body *')).map(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { tag: element.tagName.toLowerCase(), text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles: { color: style.color, backgroundColor: style.backgroundColor, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, borderRadius: style.borderRadius } };
  }).filter(item => item.rect.width > 0 && item.rect.height > 0).slice(0, 300);
  const colors = Array.from(new Set(layout.flatMap(item => [item.styles.color, item.styles.backgroundColor]).filter(color => color && color !== 'rgba(0, 0, 0, 0)'))).slice(0, 80);
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  return { url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight }, text, words: text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2).slice(0, 2000), colors, layout };
})()`;
