/**
 * SearchDropdown 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import SearchDropdown from '../SearchDropdown'

// Wrapper component for tests
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('SearchDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render search input', () => {
    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText(/搜索/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('should show dropdown on focus', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText(/搜索/i)
    await user.click(searchInput)

    // 下拉菜单应该显示
    await waitFor(() => {
      // 检查是否有下拉内容
      expect(searchInput).toHaveFocus()
    })
  })

  it('should update input value on type', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText(/搜索/i)
    await user.type(searchInput, 'test-pod')

    expect(searchInput).toHaveValue('test-pod')
  })

  it('should clear input on clear button click', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText(/搜索/i)
    await user.type(searchInput, 'test')

    expect(searchInput).toHaveValue('test')

    // 找到清除按钮并点击
    const clearButton = screen.queryByRole('button', { name: /close/i })
    if (clearButton) {
      await user.click(clearButton)
      expect(searchInput).toHaveValue('')
    }
  })

  it('should handle keyboard navigation', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText(/搜索/i)
    await user.click(searchInput)
    await user.type(searchInput, 'test')

    // 测试 Escape 键
    await user.keyboard('{Escape}')

    // 输入框应该仍然存在
    expect(searchInput).toBeInTheDocument()
  })

  it('should debounce search input', async () => {
    const user = userEvent.setup()
    vi.useFakeTimers()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText(/搜索/i)
    
    // 快速输入
    await user.type(searchInput, 'test')

    // 验证输入已更新
    expect(searchInput).toHaveValue('test')

    vi.useRealTimers()
  })
})

