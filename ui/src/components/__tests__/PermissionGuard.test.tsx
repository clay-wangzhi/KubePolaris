/**
 * PermissionGuard 组件测试
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import PermissionGuard from '../PermissionGuard'

// Wrapper component for tests
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

// Mock PermissionContext
const mockUsePermission = vi.fn()

vi.mock('../../contexts/PermissionContext', () => ({
  usePermission: () => mockUsePermission(),
}))

describe('PermissionGuard', () => {
  it('should render children when user has permission', () => {
    mockUsePermission.mockReturnValue({
      hasPermission: () => true,
      isAdmin: true,
      currentClusterPermission: { permission_type: 'admin' },
      loading: false,
    })

    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="readonly">
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should not render children when user lacks permission', () => {
    mockUsePermission.mockReturnValue({
      hasPermission: () => false,
      isAdmin: false,
      currentClusterPermission: { permission_type: 'readonly' },
      loading: false,
    })

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
    mockUsePermission.mockReturnValue({
      hasPermission: () => false,
      isAdmin: false,
      currentClusterPermission: { permission_type: 'readonly' },
      loading: false,
    })

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
    expect(screen.getByText('No Permission')).toBeInTheDocument()
  })

  it('should always render for admin users', () => {
    mockUsePermission.mockReturnValue({
      hasPermission: (permission: string) => {
        // 模拟管理员权限检查
        return permission === 'admin'
      },
      isAdmin: true,
      currentClusterPermission: { permission_type: 'admin' },
      loading: false,
    })

    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="admin">
          <div data-testid="admin-content">Admin Only Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    expect(screen.getByTestId('admin-content')).toBeInTheDocument()
  })

  it('should handle multiple permissions', () => {
    mockUsePermission.mockReturnValue({
      hasPermission: (permission: string) => {
        return ['readonly', 'dev'].includes(permission)
      },
      isAdmin: false,
      currentClusterPermission: { permission_type: 'dev' },
      loading: false,
    })

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
    mockUsePermission.mockReturnValue({
      hasPermission: () => false,
      isAdmin: false,
      currentClusterPermission: { permission_type: 'readonly' },
      loading: false,
    })

    render(
      <TestWrapper>
        <PermissionGuard requiredPermission="ops">
          <div>Secret Content</div>
        </PermissionGuard>
      </TestWrapper>
    )

    // Container may have wrapper elements, check inner content is empty
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument()
  })
})

