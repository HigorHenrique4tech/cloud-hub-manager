import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, FolderOpen, Loader2, ArrowLeft,
  BookOpen, Eye, EyeOff, AlertCircle, Save, X, Video,
} from 'lucide-react';
import knowledgeService from '../services/knowledgeService';
import ArticleEditorModal from '../components/knowledge/ArticleEditorModal';

export default function KnowledgeAdmin() {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [filterCat, setFilterCat] = useState('all');

  const storageQ = useQuery({
    queryKey: ['kb-storage-status'],
    queryFn: knowledgeService.adminStorageStatus,
    staleTime: 5 * 60_000,
  });

  const catsQ = useQuery({
    queryKey: ['kb-categories'],
    queryFn: knowledgeService.listCategories,
  });

  const articlesQ = useQuery({
    queryKey: ['kb-admin-articles', filterCat],
    queryFn: () => knowledgeService.adminListArticles({
      category_slug: filterCat === 'all' ? undefined : filterCat,
      page_size: 100,
    }),
  });

  const togglePublishMut = useMutation({
    mutationFn: ({ id, is_published }) => knowledgeService.adminUpdateArticle(id, { is_published }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb-admin-articles'] }),
  });

  const deleteArticleMut = useMutation({
    mutationFn: (id) => knowledgeService.adminDeleteArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-admin-articles'] });
      qc.invalidateQueries({ queryKey: ['kb-categories'] });
    },
  });

  const openNew = () => {
    setEditingArticle(null);
    setEditorOpen(true);
  };

  const openEdit = async (slug) => {
    try {
      const full = await knowledgeService.getArticle(slug);
      setEditingArticle(full);
      setEditorOpen(true);
    } catch {
      // fallback to minimal data
      const stub = articlesQ.data?.items.find((a) => a.slug === slug);
      setEditingArticle(stub || null);
      setEditorOpen(true);
    }
  };

  const categories = catsQ.data || [];
  const articles = articlesQ.data?.items || [];
  const storageConfigured = storageQ.data?.configured;

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/knowledge"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Gerenciar Base de Conhecimento
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Criar, editar e publicar artigos e vídeos tutoriais.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCatPanelOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <FolderOpen className="w-4 h-4" />
            Categorias
          </button>
          <button
            onClick={openNew}
            disabled={categories.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Novo artigo
          </button>
        </div>
      </div>

      {/* Storage warning */}
      {storageQ.data && !storageConfigured && (
        <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Storage de vídeos não configurado. Defina <code className="font-mono text-xs">KB_S3_BUCKET</code>, <code className="font-mono text-xs">KB_S3_ACCESS_KEY</code> e <code className="font-mono text-xs">KB_S3_SECRET_KEY</code> nas variáveis de ambiente do backend para habilitar upload de vídeos.
          </span>
        </div>
      )}

      {/* No categories */}
      {categories.length === 0 && !catsQ.isLoading && (
        <div className="card p-8 text-center">
          <FolderOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Crie sua primeira categoria
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Organize os artigos por temas (ex: Primeiros passos, FinOps, Segurança).
          </p>
          <button
            onClick={() => setCatPanelOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Nova categoria
          </button>
        </div>
      )}

      {/* Filter bar */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterCat('all')}
            className={`shrink-0 px-3 py-1.5 text-xs rounded-full border ${
              filterCat === 'all'
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700'
            }`}
          >
            Todos ({articles.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterCat(c.slug)}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-full border ${
                filterCat === c.slug
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Articles table */}
      {articlesQ.isLoading ? (
        <div className="p-10 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary inline-block" />
        </div>
      ) : articles.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left p-3 font-semibold">Título</th>
                <th className="text-left p-3 font-semibold">Categoria</th>
                <th className="text-left p-3 font-semibold">Vídeos</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-left p-3 font-semibold">Atualizado</th>
                <th className="text-right p-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{a.title}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{a.category_name}</td>
                  <td className="p-3 text-gray-500">
                    {a.video_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Video className="w-3.5 h-3.5" />
                        {a.video_count}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => togglePublishMut.mutate({ id: a.id, is_published: !a.is_published })}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.is_published
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {a.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {a.is_published ? 'Publicado' : 'Rascunho'}
                    </button>
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {new Date(a.updated_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(a.slug)}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir "${a.title}"? Vídeos também serão removidos.`))
                            deleteArticleMut.mutate(a.id);
                        }}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Article editor */}
      {editorOpen && (
        <ArticleEditorModal
          article={editingArticle}
          categories={categories}
          onClose={() => {
            setEditorOpen(false);
            setEditingArticle(null);
          }}
        />
      )}

      {/* Category panel */}
      {catPanelOpen && (
        <CategoryPanel
          categories={categories}
          onClose={() => setCatPanelOpen(false)}
        />
      )}
    </div>
  );
}

// ── Category Panel ──────────────────────────────────────────────────────────

function CategoryPanel({ categories, onClose }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', icon: '', description: '', order: 0 });

  const createMut = useMutation({
    mutationFn: knowledgeService.adminCreateCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-categories'] });
      setForm({ name: '', icon: '', description: '', order: 0 });
      setEditing(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => knowledgeService.adminUpdateCategory(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-categories'] });
      setEditing(null);
      setForm({ name: '', icon: '', description: '', order: 0 });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => knowledgeService.adminDeleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb-categories'] }),
  });

  const startEdit = (c) => {
    setEditing(c.id);
    setForm({ name: c.name, icon: c.icon || '', description: c.description || '', order: c.order });
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      updateMut.mutate({ id: editing, payload: form });
    } else {
      createMut.mutate(form);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" />
            Categorias
          </h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ul className="space-y-1.5">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{c.name}</span>
                <span className="text-xs text-gray-500">{c.article_count} artigo{c.article_count === 1 ? '' : 's'}</span>
                <button onClick={() => startEdit(c)} className="p-1 text-gray-400 hover:text-primary">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir "${c.name}"? Todos os artigos dessa categoria serão removidos.`)) {
                      deleteMut.mutate(c.id);
                    }
                  }}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase text-gray-500">
              {editing ? 'Editar categoria' : 'Nova categoria'}
            </h4>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome da categoria"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="Ícone Lucide (ex: Cloud, Shield)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição (opcional)"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={!form.name.trim() || createMut.isPending || updateMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {editing ? 'Atualizar' : 'Criar'}
              </button>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(null);
                    setForm({ name: '', icon: '', description: '', order: 0 });
                  }}
                  className="px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
