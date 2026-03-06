import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NamespaceSelector from '../NamespaceSelector'
import { namespaceService, type NamespaceData } from '../../services/namespaceService'
import { usePermission } from '../../hooks/usePermission'
import type { PermissionContextType } from '../../contexts/PermissionContext'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../services/namespaceService', () => ({
  namespaceService: {
    getNamespaces: vi.fn(),
  },
}))

vi.mock('../../hooks/usePermission', () => ({
  usePermission: vi.fn(),
}))

const createPermissionMock = (): PermissionContextType => ({
  clusterPermissions: new Map(),
  currentClusterPermission: null,
  loading: false,
  hasClusterAccess: () => true,
  hasNamespaceAccess: () => true,
  canPerformAction: () => true,
  isAdmin: () => true,
  isReadonly: () => false,
  canWrite: () => true,
  getPermissionType: () => 'admin',
  refreshPermissions: vi.fn().mockResolvedValue(undefined),
  setCurrentClusterId: vi.fn(),
  getAllowedNamespaces: () => [],
  hasAllNamespaceAccess: () => true,
  filterNamespaces: (namespaces: string[]) => namespaces,
})

const createNamespace = (name: string): NamespaceData => ({
  name,
  status: 'Active',
  labels: {},
  annotations: {},
  creationTimestamp: '2024-01-01T00:00:00Z',
})

describe('NamespaceSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePermission).mockReturnValue(createPermissionMock())
  })

  it('should render with placeholder', () => {
    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: [],
      message: 'success',
    })

    render(<NamespaceSelector clusterId="1" placeholder="选择命名空间" />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('should load namespaces on mount', async () => {
    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: [
        createNamespace('default'),
        createNamespace('kube-system'),
        createNamespace('production'),
      ],
      message: 'success',
    })

    render(<NamespaceSelector clusterId="1" />)

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

    render(<NamespaceSelector clusterId="1" disabled />)

    expect(screen.getByRole('combobox').closest('.ant-select')).toHaveClass('ant-select-disabled')
  })

  it('should call onChange when selection changes', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    vi.mocked(namespaceService.getNamespaces).mockResolvedValue({
      code: 200,
      data: [
        createNamespace('default'),
        createNamespace('production'),
      ],
      message: 'success',
    })

    render(<NamespaceSelector clusterId="1" onChange={handleChange} allowAll />)

    await waitFor(() => {
      expect(namespaceService.getNamespaces).toHaveBeenCalledWith('1')
    })

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByTitle('default'))

    expect(handleChange).toHaveBeenCalledWith('default', expect.anything())
  })

  it('should handle API error gracefully', async () => {
    vi.mocked(namespaceService.getNamespaces).mockRejectedValue(new Error('Network error'))

    expect(() => {
      render(<NamespaceSelector clusterId="1" />)
    }).not.toThrow()

    await waitFor(() => {
      expect(namespaceService.getNamespaces).toHaveBeenCalledWith('1')
    })
  })

  it('should not fetch namespaces when clusterId is empty', () => {
    render(<NamespaceSelector clusterId="" />)

    expect(namespaceService.getNamespaces).not.toHaveBeenCalled()
  })
})

