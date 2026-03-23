/**
 * ClusterService 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clusterService } from '../clusterService'
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

describe('clusterService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getClusters', () => {
    it('should fetch clusters without params', async () => {
      const mockResponse = {
        items: [
          { id: 1, name: 'cluster-1', status: 'connected' },
          { id: 2, name: 'cluster-2', status: 'connected' },
        ],
        total: 2,
      }

      vi.mocked(request.get).mockResolvedValue(mockResponse)

      const result = await clusterService.getClusters()

      expect(request.get).toHaveBeenCalledWith('/clusters', { params: undefined })
      expect(result).toEqual(mockResponse)
    })

    it('should fetch clusters with pagination params', async () => {
      const mockResponse = {
        items: [],
        total: 0,
      }

      vi.mocked(request.get).mockResolvedValue(mockResponse)

      await clusterService.getClusters({ page: 1, pageSize: 10 })

      expect(request.get).toHaveBeenCalledWith('/clusters', {
        params: { page: 1, pageSize: 10 },
      })
    })

    it('should fetch clusters with search params', async () => {
      const mockResponse = { items: [], total: 0 }

      vi.mocked(request.get).mockResolvedValue(mockResponse)

      await clusterService.getClusters({ search: 'prod' })

      expect(request.get).toHaveBeenCalledWith('/clusters', {
        params: { search: 'prod' },
      })
    })
  })

  describe('getCluster', () => {
    it('should fetch single cluster by ID', async () => {
      const mockCluster = {
        id: 1,
        name: 'test-cluster',
        apiServer: 'https://kubernetes.example.com:6443',
        status: 'connected',
        version: 'v1.28.0',
      }

      vi.mocked(request.get).mockResolvedValue(mockCluster)

      const result = await clusterService.getCluster('1')

      expect(request.get).toHaveBeenCalledWith('/clusters/1')
      expect(result).toEqual(mockCluster)
    })

    it('should handle cluster not found', async () => {
      vi.mocked(request.get).mockRejectedValue({
        response: {
          status: 404,
          data: { code: 404, message: 'Cluster not found' },
        },
      })

      await expect(clusterService.getCluster('999')).rejects.toThrow()
    })
  })

  describe('importCluster', () => {
    it('should import cluster with kubeconfig', async () => {
      const clusterData = {
        name: 'new-cluster',
        apiServer: 'https://k8s.example.com:6443',
        kubeconfig: 'apiVersion: v1\nkind: Config...',
      }

      const mockResponse = { id: 1, ...clusterData, status: 'connected' }

      vi.mocked(request.post).mockResolvedValue(mockResponse)

      const result = await clusterService.importCluster(clusterData)

      expect(request.post).toHaveBeenCalledWith('/clusters/import', clusterData)
      expect(result.name).toBe('new-cluster')
    })

    it('should import cluster with token', async () => {
      const clusterData = {
        name: 'token-cluster',
        apiServer: 'https://k8s.example.com:6443',
        token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
        caCert: '-----BEGIN CERTIFICATE-----...',
      }

      vi.mocked(request.post).mockResolvedValue({ id: 2, ...clusterData, status: 'pending' })

      await clusterService.importCluster(clusterData)

      expect(request.post).toHaveBeenCalledWith('/clusters/import', clusterData)
    })
  })

  describe('deleteCluster', () => {
    it('should delete cluster by ID', async () => {
      vi.mocked(request.delete).mockResolvedValue(null)

      await clusterService.deleteCluster('1')

      expect(request.delete).toHaveBeenCalledWith('/clusters/1')
    })
  })

  describe('getClusterStats', () => {
    it('should fetch cluster statistics', async () => {
      const mockStats = {
        totalClusters: 5,
        connectedClusters: 4,
        disconnectedClusters: 1,
        totalNodes: 20,
        totalPods: 150,
      }

      vi.mocked(request.get).mockResolvedValue(mockStats)

      const result = await clusterService.getClusterStats()

      expect(request.get).toHaveBeenCalledWith('/clusters/stats')
      expect(result.totalClusters).toBe(5)
    })
  })

  describe('testConnection', () => {
    it('should test cluster connection', async () => {
      const connectionData = {
        apiServer: 'https://k8s.example.com:6443',
        kubeconfig: 'test-config',
      }

      vi.mocked(request.post).mockResolvedValue({ success: true, version: 'v1.28.0' })

      const result = await clusterService.testConnection(connectionData)

      expect(request.post).toHaveBeenCalledWith(
        '/clusters/test-connection',
        connectionData
      )
      expect((result as { success: boolean; version: string }).success).toBe(true)
    })

    it('should handle connection failure', async () => {
      vi.mocked(request.post).mockRejectedValue({
        response: {
          status: 400,
          data: { error: { code: 'BAD_REQUEST', message: 'Connection failed: timeout' } },
        },
      })

      await expect(
        clusterService.testConnection({
          apiServer: 'https://invalid.example.com:6443',
        })
      ).rejects.toThrow()
    })
  })

  describe('getClusterEvents', () => {
    it('should fetch cluster events', async () => {
      const mockEvents = [
        {
          type: 'Warning',
          reason: 'FailedScheduling',
          message: 'No nodes available',
          firstTimestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'Normal',
          reason: 'Scheduled',
          message: 'Pod scheduled successfully',
          firstTimestamp: '2024-01-01T00:01:00Z',
        },
      ]

      vi.mocked(request.get).mockResolvedValue(mockEvents)

      const result = await clusterService.getClusterEvents('1')

      expect(request.get).toHaveBeenCalledWith('/clusters/1/events', {
        params: undefined,
      })
      expect(result).toHaveLength(2)
    })

    it('should fetch events with filters', async () => {
      vi.mocked(request.get).mockResolvedValue([])

      await clusterService.getClusterEvents('1', { type: 'Warning' })

      expect(request.get).toHaveBeenCalledWith('/clusters/1/events', {
        params: { type: 'Warning' },
      })
    })
  })
})

