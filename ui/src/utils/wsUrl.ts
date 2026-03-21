/**
 * 与当前页面同源（含端口）的 WebSocket 基址，适用于：
 * - 单二进制 / Nginx 反代（443 与页面一致）
 * - 自定义 SERVER_PORT
 * - 开发：Vite 将 /ws 代理到后端，使用 dev server 的 host:5173
 */
export function buildWebSocketUrl(pathWithQuery: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  return `${protocol}//${window.location.host}${path}`;
}
