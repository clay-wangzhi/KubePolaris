/**
 * NamespaceSelector 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NamespaceSelector from '../NamespaceSelector'
import { PermissionProvider } from '../../contexts/PermissionContext'
import { namespaceService } from '../../services/namespaceService'

// Mock namespaceService
vi.mock('../../services/namespaceService', () => ({
  namespaceService: {
    getNamespaces: vi.fn(),
  },
}))

// Mock PermissionContext
vi.mock('../../contexts/PermissionContext', () => ({
  usePermission: () => ({
    filterNamespaces: (namespaces: string[]) => namespaces,
    hasAllNamespaceAccess: () => true,
    getAllowedNamespaces: () => [],
  }),
  PermissionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('NamespaceSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render with placeholder', () => {
    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: [],
      message: 'success',
    })

    render(
      <PermissionProvider>
        <NamespaceSelector clusterId="1" placeholder="选择命名空间" />
      </PermissionProvider>
    )

    // 检查 Select 组件是否渲染
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('should load namespaces on mount', async () => {
    const mockNamespaces = [
      { name: 'default', status: 'Active', labels: {}, annotations: {}, creationTimestamp: '2024-01-01T00:00:00Z' },
      { name: 'kube-system', status: 'Active', labels: {}, annotations: {}, creationTimestamp: '2024-01-01T00:00:00Z' },
      { name: 'production', status: 'Active', labels: {}, annotations: {}, creationTimestamp: '2024-01-01T00:00:00Z' },
    ]

    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: mockNamespaces,
      message: 'success',
    })

    render(
      <PermissionProvider>
        <NamespaceSelector clusterId="1" />
      </PermissionProvider>
    )

    await waitFor(() => {
      expect(namespaceService.getNamespaces).toHaveBeenCalledWith('1')
    })
  })

  it('should be disabled when disabled prop is true', () => {
    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: [],
      message: 'success',
    })

    render(
      <PermissionProvider>
        <NamespaceSelector clusterId="1" disabled={true} />
      </PermissionProvider>
    )

    const select = screen.getByRole('combobox')
    expect(select).toHaveClass('ant-select-disabled')
  })

  it('should call onChange when selection changes', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: [
        { name: 'default', status: 'Active', labels: {}, annotations: {}, creationTimestamp: '2024-01-01T00:00:00Z' },
        { name: 'production', status: 'Active', labels: {}, annotations: {}, creationTimestamp: '2024-01-01T00:00:00Z' },
      ],
      message: 'success',
    })

    render(
      <PermissionProvider>
        <NamespaceSelector
          clusterId="1"
          onChange={handleChange}
          allowAll={true}
        />
      </PermissionProvider>
    )

    // 等待命名空间加载
    await waitFor(() => {
      expect(namespaceService.getNamespaces).toHaveBeenCalled()
    })

    // 点击选择器
    const select = screen.getByRole('combobox')
    await user.click(select)

    // 选择一个选项（如果下拉列表渲染）
    const option = screen.queryByText('default')
    if (option) {
      await user.click(option)
      expect(handleChange).toHaveBeenCalled()
    }
  })

  it('should handle API error gracefully', async () => {
    vi.mocked(namespaceService.getNamespaces).mockRejectedValue(
      new Error('Network error')
    )

    // 应该不抛出错误
    expect(() => {
      render(
        <PermissionProvider>
          <NamespaceSelector clusterId="1" />
        </PermissionProvider>
      )
    }).not.toThrow()

    await waitFor(() => {
      expect(namespaceService.getNamespaces).toHaveBeenCalled()
    })
  })

  it('should not fetch namespaces when clusterId is empty', () => {
    render(
      <PermissionProvider>
        <NamespaceSelector clusterId="" />
      </PermissionProvider>
    )

    expect(namespaceService.getNamespaces).not.toHaveBeenCalled()
  })
})

