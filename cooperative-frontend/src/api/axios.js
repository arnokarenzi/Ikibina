// src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true, // Essential for sending and receiving cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token.trim()}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check for 401 Unauthorized and ensure we haven't already retried this request
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Request a new access token using the refresh token cookie
        const response = await axios.post('http://localhost:5000/api/auth/refresh', {}, {
          withCredentials: true
        });

        const { token: newAccessToken } = response.data;
        localStorage.setItem('token', newAccessToken);

        // Update headers and retry the failed request
        api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken.trim()}`;
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken.trim()}`;

        return api(originalRequest);
      } catch (refreshError) {
        // If refresh token is also invalid or expired, clear storage and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
