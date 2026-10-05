import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// An expired admin session must not prevent visitors from reading public data.
api.interceptors.response.use(response => response, async error => {
  const config = error.config;
  if (error.response?.status === 401 && config?.method === 'get' && config.headers?.Authorization) {
    localStorage.removeItem('access_token');
    delete config.headers.Authorization;
    return api.request(config);
  }
  return Promise.reject(error);
});

export default api;
