/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // 测试环境
    environment: 'jsdom',
    
    // 设置文件
    setupFiles: ['./src/setupTests.ts'],
    
    // 全局变量
    globals: true,
    
    // 包含的测试文件
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{ts,tsx}'
    ],
    
    // 排除的文件
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache'
    ],
    
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.{ts,tsx}'
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/setupTests.ts'
      ],
      // 覆盖率阈值
      thresholds: {
        global: {
          branches: 50,
          functions: 50,
          lines: 50,
          statements: 50
        }
      }
    },
    
    // 测试超时时间
    testTimeout: 10000,
    
    // 监视模式配置
    watch: true,
    
    // 报告器
    reporters: ['default', 'html'],
    
    // 输出目录
    outputFile: {
      html: './test-results/index.html'
    },
    
    // CSS 处理
    css: true,
    
    // 线程池配置
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  },
  
  // 解析别名（与主项目保持一致）
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})

