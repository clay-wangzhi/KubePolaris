/**
 * PodService 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PodService } from '../podService'
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

describe('PodService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getPods', () => {
    it('should fetch pods for a cluster', async () => {
      const mockResponse = {
        code: 200,
        data: {
          items: [
            {
              name: 'nginx-pod-1',
              namespace: 'default',
              status: 'Running',
              nodeName: 'node-1',
            },
            {
              name: 'nginx-pod-2',
              namespace: 'default',
              status: 'Running',
              nodeName: 'node-2',
            },
          ],
          total: 2,
        },
        message: 'success',
      }

      vi.mocked(request.get).mockResolvedValue(mockResponse)

      const result = await PodService.getPods('1')

      expect(request.get).toHaveBeenCalled()
      expect(result).toEqual(mockResponse)
    })

    it('should fetch pods with namespace filter', async () => {
      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: { items: [], total: 0 },
        message: 'success',
      })

      await PodService.getPods('1', 'kube-system')

      expect(request.get).toHaveBeenCalled()
      const callArg = vi.mocked(request.get).mock.calls[0][0]
      expect(callArg).toContain('namespace=kube-system')
    })

    it('should fetch pods with pagination', async () => {
      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: { items: [], total: 0 },
        message: 'success',
      })

      await PodService.getPods('1', undefined, undefined, undefined, undefined, undefined, 2, 20)

      expect(request.get).toHaveBeenCalled()
      const callArg = vi.mocked(request.get).mock.calls[0][0]
      expect(callArg).toContain('page=2')
      expect(callArg).toContain('pageSize=20')
    })
  })

  describe('getPodDetail', () => {
    it('should fetch single pod details', async () => {
      const mockPod = {
        name: 'nginx-pod',
        namespace: 'default',
        status: 'Running',
        containers: [
          { name: 'nginx', image: 'nginx:1.19', ready: true },
        ],
        nodeName: 'node-1',
        podIP: '10.244.0.5',
        createdAt: '2024-01-01T00:00:00Z',
      }

      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: mockPod,
        message: 'success',
      })

      const result = await PodService.getPodDetail('1', 'default', 'nginx-pod')

      expect(request.get).toHaveBeenCalledWith(
        '/clusters/1/pods/default/nginx-pod'
      )
      expect((result.data as unknown as { name: string }).name).toBe('nginx-pod')
    })

    it('should handle pod not found', async () => {
      vi.mocked(request.get).mockRejectedValue({
        response: {
          status: 404,
          data: { code: 404, message: 'Pod not found' },
        },
      })

      await expect(
        PodService.getPodDetail('1', 'default', 'nonexistent-pod')
      ).rejects.toThrow()
    })
  })

  describe('deletePod', () => {
    it('should delete a pod', async () => {
      vi.mocked(request.delete).mockResolvedValue({
        code: 200,
        message: 'Pod deleted successfully',
        data: null,
      })

      await PodService.deletePod('1', 'default', 'nginx-pod')

      expect(request.delete).toHaveBeenCalledWith(
        '/clusters/1/pods/default/nginx-pod'
      )
    })

    it('should handle delete error', async () => {
      vi.mocked(request.delete).mockRejectedValue({
        response: {
          status: 403,
          data: { code: 403, message: 'Permission denied' },
        },
      })

      await expect(
        PodService.deletePod('1', 'kube-system', 'coredns-pod')
      ).rejects.toThrow()
    })
  })

  describe('getPodLogs', () => {
    it('should fetch pod logs', async () => {
      const mockLogs = 'Starting nginx...\nNginx started successfully.'

      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: mockLogs,
        message: 'success',
      })

      await PodService.getPodLogs('1', 'default', 'nginx-pod')

      expect(request.get).toHaveBeenCalled()
    })

    it('should fetch logs with container filter', async () => {
      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: 'Container logs...',
        message: 'success',
      })

      await PodService.getPodLogs('1', 'default', 'multi-container-pod', 'sidecar')

      expect(request.get).toHaveBeenCalled()
      const callArg = vi.mocked(request.get).mock.calls[0][0]
      expect(callArg).toContain('container=sidecar')
    })

    it('should fetch logs with tail lines', async () => {
      vi.mocked(request.get).mockResolvedValue({
        code: 200,
        data: { logs: 'Last 100 lines...' },
        message: 'success',
      })

      await PodService.getPodLogs('1', 'default', 'nginx-pod', undefined, false, false, 100)

      expect(request.get).toHaveBeenCalled()
      const callArg = vi.mocked(request.get).mock.calls[0][0]
      expect(callArg).toContain('tailLines=100')
    })
  })

  describe('batchDeletePods', () => {
    it('should batch delete pods', async () => {
      vi.mocked(request.delete).mockResolvedValue({
        code: 200,
        message: 'Deleted',
        data: null,
      })

      const pods = [
        { namespace: 'default', name: 'pod-1' },
        { namespace: 'default', name: 'pod-2' },
      ]

      const results = await PodService.batchDeletePods('1', pods)

      expect(results).toHaveLength(2)
      expect(results.every(r => r.success)).toBe(true)
    })
  })
})
