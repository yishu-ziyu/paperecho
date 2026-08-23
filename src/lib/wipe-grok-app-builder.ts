const MARKER = /Grok App Builder|Created with Grok|Built with Grok|云端是 Grok/;

/** Drop the host badge if a leftover script still paints it. */
export function wipeGrokAppBuilderChrome(root: ParentNode = document) {
  root.querySelectorAll('script[src*="grok-app-builder"]').forEach((node) => node.remove());
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hosts = new Set<Element>();
  while (walker.nextNode()) {
    if (MARKER.test(walker.currentNode.textContent ?? "")) {
      const el = walker.currentNode.parentElement;
      if (el) hosts.add(el);
    }
  }
  for (const el of hosts) {
    const only = (el.textContent ?? "").trim();
    if (MARKER.test(only) && only.length < 80) el.remove();
  }
}

export function watchGrokAppBuilderChrome() {
  if (typeof document === "undefined") return () => {};
  wipeGrokAppBuilderChrome();
  const mo = new MutationObserver(() => wipeGrokAppBuilderChrome());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  return () => mo.disconnect();
}
