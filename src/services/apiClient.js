import ax from 'axios';

const api = ax.create({
    baseURL: (import.meta.env.VITE_API_BASE ?? 'http://localhost:8080') + '/api/v1',
    timeout: 8000,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
})

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.reload();
        }
        return Promise.reject(err);
    }
)

export default api;