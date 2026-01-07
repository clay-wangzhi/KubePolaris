/**
 * AuthService 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authService } from '../authService'
import { request } from '../../utils/api'

// Mock request module
vi.mock('../../utils/api', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('login', () => {
    it('should login successfully and store token', async () => {
      const mockResponse = {
        code: 200,
        data: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: 1,
            username: 'admin',
            role: 'admin',
          },
        },
        message: 'Login successful',
      }

      vi.mocked(request.post).mockResolvedValue(mockResponse)

      const result = await authService.login({
        username: 'admin',
        password: 'password123',
      })

      expect(request.post).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: 'password123',
      })
      expect(result.data.token).toBeDefined()
    })

    it('should handle login failure', async () => {
      vi.mocked(request.post).mockRejectedValue({
        response: {
          status: 401,
          data: { code: 401, message: 'Invalid credentials' },
        },
      })

      await expect(
        authService.login({ username: 'wrong', password: 'wrong' })
      ).rejects.toThrow()
    })

    it('should handle empty credentials', async () => {
      vi.mocked(request.post).mockRejectedValue({
        response: {
          status: 400,
          data: { code: 400, message: 'Username and password required' },
        },
      })

      await expect(
        authService.login({ username: '', password: '' })
      ).rejects.toThrow()
    })
  })

  describe('logout', () => {
    it('should logout and clear storage', async () => {
      vi.mocked(request.post).mockResolvedValue({
        code: 200,
        message: 'Logout successful',
        data: null,
      })

      await authService.logout()

      expect(request.post).toHaveBeenCalledWith('/auth/logout')
    })
  })

  describe('getProfile', () => {
    it('should fetch current user profile', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        avatar: '',
        displayName: 'Administrator',
      }

      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: mockUser,
        message: 'success',
      })

      const result = await authService.getProfile()

      expect(request.get).toHaveBeenCalledWith('/auth/me')
      expect(result.data.username).toBe('admin')
    })

    it('should handle unauthorized user', async () => {
      vi.mocked(request.get).mockRejectedValue({
        response: {
          status: 401,
          data: { code: 401, message: 'Unauthorized' },
        },
      })

      await expect(authService.getProfile()).rejects.toThrow()
    })
  })

  describe('getAuthStatus', () => {
    it('should get auth status', async () => {
      const mockStatus = {
        ldap_enabled: true,
      }

      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: mockStatus,
        message: 'success',
      })

      const result = await authService.getAuthStatus()

      expect(request.get).toHaveBeenCalledWith('/auth/status')
      expect(result.data.ldap_enabled).toBe(true)
    })
  })

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      vi.mocked(request.post).mockResolvedValue({
        code: 200,
        message: 'Password changed successfully',
        data: null,
      })

      await authService.changePassword({
        old_password: 'oldPass123',
        new_password: 'newPass456',
      })

      expect(request.post).toHaveBeenCalledWith('/auth/change-password', {
        old_password: 'oldPass123',
        new_password: 'newPass456',
      })
    })

    it('should handle wrong old password', async () => {
      vi.mocked(request.post).mockRejectedValue({
        response: {
          status: 400,
          data: { code: 400, message: 'Old password is incorrect' },
        },
      })

      await expect(
        authService.changePassword({
          old_password: 'wrongOldPass',
          new_password: 'newPass456',
        })
      ).rejects.toThrow()
    })
  })
})
