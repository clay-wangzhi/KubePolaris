/**
 * Vitest 测试设置文件
 * 在每个测试文件运行前执行
 */

import '@testing-library/jest-dom'
import { afterEach, beforeAll, afterAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每个测试后自动清理
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock scrollTo
  Element.prototype.scrollTo = vi.fn()
  window.scrollTo = vi.fn()

  // Mock getComputedStyle
  const originalGetComputedStyle = window.getComputedStyle
  window.getComputedStyle = (element: Element) => {
    return originalGetComputedStyle(element)
  }
})

afterAll(() => {
  vi.clearAllMocks()
})

// 全局 console 错误处理（可选：在测试中忽略某些警告）
const originalError = console.error
console.error = (...args: unknown[]) => {
  // 忽略 React act() 警告
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Warning: An update to')
  ) {
    return
  }
  originalError.call(console, ...args)
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
})

// 声明全局类型
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Assertion<T = unknown> {
      toBeInTheDocument(): T
      toHaveTextContent(text: string | RegExp): T
      toBeVisible(): T
      toBeDisabled(): T
      toBeEnabled(): T
      toHaveClass(...classNames: string[]): T
      toHaveStyle(style: Record<string, unknown>): T
      toHaveAttribute(attr: string, value?: string): T
      toContainElement(element: HTMLElement | null): T
      toHaveValue(value: string | string[] | number): T
    }
  }
}

export {}

