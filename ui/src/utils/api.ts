import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiResponse } from '../types/index';

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理401错误
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 获取请求的URL
      const requestUrl = error.config?.url || '';
      
      // 对于以下接口的401错误，不自动跳转登录页，让组件自己处理
      const noRedirectUrls = [
        '/auth/change-password',  // 修改密码（原密码错误）
        '/auth/login',             // 登录失败
      ];
      
      const shouldRedirect = !noRedirectUrls.some(url => requestUrl.includes(url));
      
      if (shouldRedirect) {
        // 清除认证信息
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('token_expires_at');
        
        // 如果不是登录页面，则跳转到登录页
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }
    console.error('API请求错误:', error);
    return Promise.reject(error);
  }
);

// 通用请求方法
export const request = {
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    api.get(url, config).then(res => res.data).catch(error => {
      console.error('GET请求失败:', url, error);
      throw error;
    }),
  
  post: <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    api.post(url, data, config).then(res => res.data).catch(error => {
      console.error('POST请求失败:', url, error);
      throw error;
    }),
  
  put: <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    api.put(url, data, config).then(res => res.data).catch(error => {
      console.error('PUT请求失败:', url, error);
      throw error;
    }),
  
  delete: <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    api.delete(url, config).then(res => res.data).catch(error => {
      console.error('DELETE请求失败:', url, error);
      throw error;
    }),
  
  patch: <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    api.patch(url, data, config).then(res => res.data).catch(error => {
      console.error('PATCH请求失败:', url, error);
      throw error;
    }),
};

export default api;