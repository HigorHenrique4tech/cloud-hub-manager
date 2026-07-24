import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Save, Trash2, Upload, Video as VideoIcon, Eye, Edit3, AlertCircle } from 'lucide-react';
import knowledgeService from '../../services/knowledgeService';
import MarkdownRenderer from './MarkdownRenderer';

const MAX_MB = 500;

export default function ArticleEditorModal({ article, categories, onClose }) {
  const qc = useQueryClient();
  const [currentArticle, setCurrentArticle] = useState(article);
  const isEdit = !!currentArticle?.id;

  const [form, setForm] = useState({
    category_id: currentArticle?.category_id || categories[0]?.id || '',
    title: currentArticle?.title || '',
    summary: currentArticle?.summary || '',
    content: currentArticle?.content || '',
    order: currentArticle?.order ?? 0,
    is_published: currentArticle?.is_published ?? true,
  });
  const [tab, setTab] = useState('edit'); // edit | preview
  const [videos, setVideos] = useState(currentArticle?.videos || []);
  const [uploadState, setUploadState] = useState(null); // { progress, name }
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    setVideos(currentArticle?.videos || []);
  }, [currentArticle?.id]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return knowledgeService.adminUpdateArticle(currentArticle.id, form);
      }
      return knowledgeService.adminCreateArticle(form);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['kb-admin-articles'] });
      qc.invalidateQueries({ queryKey: ['kb-articles'] });
      qc.invalidateQueries({ queryKey: ['kb-categories'] });
      if (isEdit) {
        // Edição concluída — fecha modal
        onClose();
      } else {
        // Criação — alterna para modo edição para permitir upload de vídeos
        setCurrentArticle(saved);
        setVideos(saved.videos || []);
      }
    },
    onError: (err) => {
      setError(err.response?.data?.detail || 'Erro ao salvar');
    },
  });

  const deleteVideoMut = useMutation({
    mutationFn: (videoId) => knowledgeService.adminDeleteVideo(currentArticle.id, videoId),
    onSuccess: (_, videoId) => {
      setVideos((list) => list.filter((v) => v.id !== videoId));
      qc.invalidateQueries({ queryKey: ['kb-admin-articles'] });
    },
  });

  const handleVideoUpload = async (file) => {
    if (!currentArticle?.id) {
      setError('Salve o artigo antes de adicionar vídeos.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Vídeo muito grande (máx ${MAX_MB}MB).`);
      return;
    }
    setError('');
    try {
      setUploadState({ progress: 0, name: file.name });
      const { upload_url, s3_key } = await knowledgeService.adminPresignVideo(currentArticle.id, {
        filename: file.name,
        content_type: file.type,
      });
      await knowledgeService.adminUploadToStorage(upload_url, file, (ev) => {
        if (ev.total) {
          setUploadState({ progress: Math.round((ev.loaded / ev.total) * 100), name: file.name });
        }
      });
      const created = await knowledgeService.adminConfirmVideo(currentArticle.id, {
        s3_key,
        title: file.name.replace(/\.[^.]+$/, ''),
        content_type: file.type,
        size_bytes: file.size,
        order: videos.length,
      });
      setVideos((list) => [...list, created]);
      qc.invalidateQueries({ queryKey: ['kb-admin-articles'] });
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha no upload do vídeo');
    } finally {
      setUploadState(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Editar artigo' : 'Novo artigo'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid lg:grid-cols-[1fr_360px] gap-6">
          {/* Left: form */}
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Categoria</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setField('category_id', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Ordem</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setField('order', Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Título</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Ex: Como conectar sua conta AWS"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Resumo (opcional)</label>
              <input
                type="text"
                value={form.summary}
                onChange={(e) => setField('summary', e.target.value)}
                maxLength={400}
                placeholder="Frase curta que aparece no card da listagem"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Content tabs */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Conteúdo (Markdown)</label>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTab('edit')}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                      tab === 'edit' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Edit3 className="w-3 h-3" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('preview')}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                      tab === 'preview' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                </div>
              </div>
              {tab === 'edit' ? (
                <textarea
                  value={form.content}
                  onChange={(e) => setField('content', e.target.value)}
                  rows={18}
                  placeholder="# Título&#10;&#10;Escreva o conteúdo em Markdown. Suporta **negrito**, _itálico_, [links](https://), listas, tabelas e code blocks."
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y"
                />
              ) : (
                <div className="min-h-[300px] p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <MarkdownRenderer content={form.content} />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setField('is_published', e.target.checked)}
                className="rounded"
              />
              Publicado (visível para usuários)
            </label>
          </div>

          {/* Right: videos */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <VideoIcon className="w-4 h-4 text-primary" />
              Vídeos
            </h3>

            {!isEdit ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                Salve o artigo primeiro para poder adicionar vídeos.
              </p>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                  onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!!uploadState}
                  className="w-full flex items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-primary/5 text-gray-500 hover:text-primary transition-colors disabled:opacity-60"
                >
                  <Upload className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm font-medium">Enviar vídeo</div>
                    <div className="text-[11px]">MP4, WebM, MOV · máx {MAX_MB}MB</div>
                  </div>
                </button>

                {uploadState && (
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between mb-1">
                      <span className="truncate">{uploadState.name}</span>
                      <span>{uploadState.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <ul className="space-y-1.5">
                  {videos.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                    >
                      <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                        {v.title || v.s3_key.split('/').pop()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Excluir este vídeo?')) deleteVideoMut.mutate(v.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!form.title || !form.category_id || saveMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saveMut.isPending ? 'Salvando...' : (isEdit ? 'Salvar alterações' : 'Criar artigo')}
          </button>
        </div>
      </div>
    </div>
  );
}
