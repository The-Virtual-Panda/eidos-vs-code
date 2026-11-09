// A few DOM helpers both webviews share. Nothing here sets an inline style
// attribute, which the content security policy refuses (REQ19); colours go
// through CSS custom properties set on the element's style object.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// `charts.red` → `var(--vscode-charts-red)`
export function themeVar(color: string): string {
  return `var(--vscode-${color.replace(/\./g, '-')})`;
}

export function setColor(element: HTMLElement, color: string | null): void {
  if (color) element.style.setProperty('--dot', themeVar(color));
}

export interface VsCodeApi<Message> {
  postMessage(message: Message): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi<Message>(): VsCodeApi<Message>;

export function vscodeApi<Message>(): VsCodeApi<Message> {
  return acquireVsCodeApi<Message>();
}
