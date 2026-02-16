import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save, Eye, EyeOff, Check, AlertCircle, User as UserIcon, Lock } from 'lucide-react';
import Layout from '../components/layout/layout';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const inputClass =
  'input w-full text-gray-900 dark:text-gray-100 font-medium placeholder:text-gray-400 placeholder:font-normal';

const Settings = () => {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  // ── Profile form state ─────────────────────────────────────
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileMsg, setProfileMsg] = useState(null); // { type: 'success'|'error', text }

  const profileMutation = useMutation({
    mutationFn: (data) => authService.updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      setTimeout(() => setProfileMsg(null), 4000);
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || 'Erro ao atualizar perfil';
      setProfileMsg({ type: 'error', text: detail });
    },
  });

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    setProfileMsg(null);
    const updates = {};
    if (name !== user?.name) updates.name = name;
    if (email !== user?.email) updates.email = email;
    if (Object.keys(updates).length === 0) return;
    profileMutation.mutate(updates);
  };

  // ── Password form state ────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  const pwdMutation = useMutation({
    mutationFn: ({ current, next }) => authService.changePassword(current, next),
    onSuccess: () => {
      setPwdMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setTimeout(() => setPwdMsg(null), 4000);
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || 'Erro ao alterar senha';
      setPwdMsg({ type: 'error', text: detail });
    },
  });

  const handlePwdSubmit = (e) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'error', text: 'As senhas não coincidem' });
      return;
    }
    if (newPwd.length < 6) {
      setPwdMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres' });
      return;
    }
    pwdMutation.mutate({ current: currentPwd, next: newPwd });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const profileChanged = name !== user?.name || email !== user?.email;

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Configurações</h1>
          <p className="text-gray-600 dark:text-gray-400">Gerencie seu perfil e preferências</p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>

      {/* ── Perfil ────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Perfil</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Atualize suas informações pessoais</p>
          </div>
        </div>

        {profileMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
            profileMsg.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {profileMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Seu nome"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="seu@email.com"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!profileChanged || profileMutation.isPending}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {profileMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Alterar Senha ─────────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Alterar Senha</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Informe a senha atual para definir uma nova</p>
          </div>
        </div>

        {pwdMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
            pwdMsg.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {pwdMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {pwdMsg.text}
          </div>
        )}

        <form onSubmit={handlePwdSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha atual</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                className={inputClass + ' pr-10'}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nova senha</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className={inputClass + ' pr-10'}
                placeholder="••••••••"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar nova senha</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className={inputClass + ' pr-10'}
                placeholder="••••••••"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!currentPwd || !newPwd || !confirmPwd || pwdMutation.isPending}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4" />
              {pwdMutation.isPending ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Info cloud accounts ───────────────────────────── */}
      <div className="card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          As contas cloud (AWS/Azure) agora são gerenciadas por workspace.
          Acesse <strong>Workspace → Configurações</strong> na barra lateral para adicionar ou remover contas.
        </p>
      </div>
    </Layout>
  );
};

export default Settings;
