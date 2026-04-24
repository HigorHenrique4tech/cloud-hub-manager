import api from './api';
import axios from 'axios';

const knowledgeService = {
  // ── Public ────────────────────────────────────────────────────
  listCategories: async () => {
    const { data } = await api.get('/knowledge/categories');
    return data;
  },

  listArticles: async ({ category_slug, q, page = 1, page_size = 20 } = {}) => {
    const params = { page, page_size };
    if (category_slug) params.category_slug = category_slug;
    if (q) params.q = q;
    const { data } = await api.get('/knowledge/articles', { params });
    return data;
  },

  getArticle: async (slug) => {
    const { data } = await api.get(`/knowledge/articles/${slug}`);
    return data;
  },

  // ── Admin: categories ─────────────────────────────────────────
  adminCreateCategory: async (payload) => {
    const { data } = await api.post('/knowledge/admin/categories', payload);
    return data;
  },

  adminUpdateCategory: async (id, payload) => {
    const { data } = await api.patch(`/knowledge/admin/categories/${id}`, payload);
    return data;
  },

  adminDeleteCategory: async (id) => {
    await api.delete(`/knowledge/admin/categories/${id}`);
  },

  // ── Admin: articles ───────────────────────────────────────────
  adminListArticles: async ({ category_slug, q, page = 1, page_size = 50 } = {}) => {
    const params = { page, page_size };
    if (category_slug) params.category_slug = category_slug;
    if (q) params.q = q;
    const { data } = await api.get('/knowledge/admin/articles', { params });
    return data;
  },

  adminCreateArticle: async (payload) => {
    const { data } = await api.post('/knowledge/admin/articles', payload);
    return data;
  },

  adminUpdateArticle: async (id, payload) => {
    const { data } = await api.patch(`/knowledge/admin/articles/${id}`, payload);
    return data;
  },

  adminDeleteArticle: async (id) => {
    await api.delete(`/knowledge/admin/articles/${id}`);
  },

  // ── Admin: videos ─────────────────────────────────────────────
  adminStorageStatus: async () => {
    const { data } = await api.get('/knowledge/admin/storage/status');
    return data;
  },

  adminPresignVideo: async (articleId, { filename, content_type }) => {
    const { data } = await api.post(
      `/knowledge/admin/articles/${articleId}/videos/presign`,
      { filename, content_type }
    );
    return data;  // { upload_url, s3_key }
  },

  adminUploadToStorage: async (uploadUrl, file, onProgress) => {
    // Direct PUT to Azure Blob via SAS URL. No auth headers.
    await axios.put(uploadUrl, file, {
      headers: {
        'Content-Type': file.type,
        'x-ms-blob-type': 'BlockBlob',
      },
      onUploadProgress: onProgress,
      timeout: 0,
    });
  },

  adminConfirmVideo: async (articleId, payload) => {
    const { data } = await api.post(
      `/knowledge/admin/articles/${articleId}/videos`,
      payload
    );
    return data;
  },

  adminDeleteVideo: async (articleId, videoId) => {
    await api.delete(`/knowledge/admin/articles/${articleId}/videos/${videoId}`);
  },
};

export default knowledgeService;
