import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import PermissionGuard from '../PermissionGuard'
import { usePermission } from '../../hooks/usePermission'
import { tokenManager } from '../../services/authService'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../hooks/usePermission', () => ({
  usePermission: vi.fn(),
}))

vi.mock('../../services/authService', async () => {
  const actual = await vi.importActual('../../services/authService')
  return {
    ...actual,
    tokenManager: {
      getUser: vi.fn(),
    },
  }
})

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('PermissionGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tokenManager.getUser).mockReturnValue({ username: 'demo' } as never)
    vi.mocked(usePermission).mockReturnValue({
      currentClusterPermission: { permission_type: 'readonly' },
      clusterPermissions: new Map(),
      loading: false,
    } as ReturnType<typeof usePermission>)
  })

  it('should render children when user has permission', () => {
    vi.mocked(usePermission).mockReturnValue({
      currentClusterPermission: { permission_type: 'admin' },
      clusterPermissions: new Map(),
      loading: false,
    } as ReturnType<typeof usePermission>)

    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="readonly">
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('should not render children when user lacks permission', () => {
    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="admin">
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('should render fallback when provided and user lacks permission', () => {
    render(
      <TestWrapper>
        <PermissionGuard
          requiredPermission="admin"
          fallback={<div data-testid="fallback">No Permission</div>}
        >
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
  })

  it('should always render for admin users', () => {
    vi.mocked(tokenManager.getUser).mockReturnValue({ username: 'admin' } as never)

    render(
      <TestWrapper>
        <PermissionGuard platformAdminOnly>
          <div data-testid="admin-content">Admin Only Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.getByTestId('admin-content')).toBeInTheDocument()
  })

  it('should handle multiple permissions', () => {
    vi.mocked(usePermission).mockReturnValue({
      currentClusterPermission: { permission_type: 'dev' },
      clusterPermissions: new Map(),
      loading: false,
    } as ReturnType<typeof usePermission>)

    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="readonly">
          <div data-testid="content">Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('should render nothing by default when no fallback and no permission', () => {
    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="ops">
          <div>Secret Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument()
  })
})

