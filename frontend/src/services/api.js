/**
 * NEXUS AI - API Service
 * Axios instance with dynamic auth header, retry, and refresh token logic
 */

import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ✅ Dynamic Request Interceptor: Attaches token on EVERY request
api.interceptors.request.use(
  (config) => {
    // Read directly from Zustand store state, or fallback to localStorage
    const token =
      useAuthStore.getState().accessToken ||
      JSON.parse(localStorage.getItem('nexus-auth') || '{}')?.state?.accessToken;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 with token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt refresh loop if the failed request WAS the refresh endpoint itself
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh');
        const newToken = data.data.accessToken;

        // Update store
        useAuthStore.getState().setToken(newToken);

        processQueue(null, newToken);
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// Streaming helper for SSE
export const createStream = (url, options = {}) => {
  const token =
    useAuthStore.getState().accessToken ||
    JSON.parse(localStorage.getItem('nexus-auth') || '{}')?.state?.accessToken;
  const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';

  return fetch(`${baseUrl}${url}`, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
};

// /**
//  * NEXUS AI - API Service
//  * Axios instance with auth, retry, and refresh token logic
//  */

// import axios from 'axios';

// const api = axios.create({
//   baseURL: import.meta.env.VITE_API_URL || '/api/v1',
//   timeout: 30000,
//   withCredentials: true,
//   headers: { 'Content-Type': 'application/json' },
// });

// // Attach token on startup
// const stored = JSON.parse(localStorage.getItem('nexus-auth') || '{}');
// if (stored?.state?.accessToken) {
//   api.defaults.headers.common['Authorization'] = `Bearer ${stored.state.accessToken}`;
// }

// // Response interceptor - handle 401 with token refresh
// let isRefreshing = false;
// let failedQueue = [];

// const processQueue = (error, token = null) => {
//   failedQueue.forEach(prom => {
//     if (error) prom.reject(error);
//     else prom.resolve(token);
//   });
//   failedQueue = [];
// };

// api.interceptors.response.use(
//   (response) => response,
//   async (error) => {
//     const originalRequest = error.config;

//     if (error.response?.status === 401 && !originalRequest._retry) {
//       if (isRefreshing) {
//         return new Promise((resolve, reject) => {
//           failedQueue.push({ resolve, reject });
//         }).then((token) => {
//           originalRequest.headers['Authorization'] = `Bearer ${token}`;
//           return api(originalRequest);
//         });
//       }

//       originalRequest._retry = true;
//       isRefreshing = true;

//       try {
//         const { data } = await api.post('/auth/refresh');
//         const newToken = data.data.accessToken;

//         api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
//         originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

//         // Update store
//         const { useAuthStore } = await import('../stores/auth.store');
//         useAuthStore.getState().setToken(newToken);

//         processQueue(null, newToken);
//         return api(originalRequest);
//       } catch (refreshError) {
//         processQueue(refreshError, null);
//         const { useAuthStore } = await import('../stores/auth.store');
//         useAuthStore.getState().logout();
//         return Promise.reject(refreshError);
//       } finally {
//         isRefreshing = false;
//       }
//     }

//     return Promise.reject(error);
//   }
// );

// export default api;

// // Streaming helper for SSE
// export const createStream = (url, options = {}) => {
//   const token = api.defaults.headers.common['Authorization'];
//   const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';

//   return fetch(`${baseUrl}${url}`, {
//     method: options.method || 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': token || '',
//     },
//     body: options.body ? JSON.stringify(options.body) : undefined,
//     signal: options.signal,
//   });
// };
