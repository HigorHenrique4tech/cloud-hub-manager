import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, Save, Eye, EyeOff, Check, AlertCircle, User as UserIcon, Lock, ShieldCheck, Mail, BadgeCheck, Download, Trash2, ExternalLink } from 'lucide-react';
import Layout from '../components/layout/layout';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const inputClass =
  'input w-full text-gray-900 dark:text-gray-100 font-medium placeholder:text-gray-400 placeholder:font-normal';

const Settings = () => {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  // ── Timers cleanup ────────────────────────────────────────
  const profileTimerRef = useRef(null);
  const pwdTimerRef = useRef(null);
  const verifyTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      clearTimeout(profileTimerRef.current);
      clearTimeout(pwdTimerRef.current);
      clearTimeout(verifyTimerRef.current);
    };
  }, []);

  // ── Email verification ─────────────────────────────────────
  const [verifyMsg, setVerifyMsg] = useState(null);
  const verifyMutation = useMutation({
    mutationFn: () => authService.resendVerification(user?.email),
    onSuccess: () => {
      setVerifyMsg({ type: 'success', text: 'Email de verificação enviado! Verifique sua caixa de entrada.' });
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = setTimeout(() => setVerifyMsg(null), 6000);
    },
    onError: (err) => {
      setVerifyMsg({ type: 'error', text: err.response?.data?.detail || 'Erro ao enviar email' });
    },
  });

  // ── Profile form state ─────────────────────────────────────
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [emailChangePwd, setEmailChangePwd] = useState('');
  const [profileMsg, setProfileMsg] = useState(null); // { type: 'success'|'error', text }

  const profileMutation = useMutation({
    mutationFn: (data) => authService.updateProfile(data),
    onSuccess: (updatedUser, vars) => {
      setUser(updatedUser);
      setEmailChangePwd('');
      // If the email actually changed in the backend, react. Otherwise it's a
      // pending double-opt-in (link sent to the new address).
      if (vars?.email && updatedUser.email !== vars.email) {
        setEmail(updatedUser.email);
        setProfileMsg({
          type: 'success',
          text: `Enviamos um link de confirmação para ${vars.email}. Clique nele para concluir a alteração.`,
        });
      } else {
        setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      }
      clearTimeout(profileTimerRef.current);
      profileTimerRef.current = setTimeout(() => setProfileMsg(null), 6000);
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
    if (email !== user?.email) {
      updates.email = email;
      updates.current_password = emailChangePwd;
    }
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
      clearTimeout(pwdTimerRef.current);
      pwdTimerRef.current = setTimeout(() => setPwdMsg(null), 4000);
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

  // ── MFA state ──────────────────────────────────────────────────────────────
  const [mfaPwd, setMfaPwd] = useState('');
  const [showMfaPwd, setShowMfaPwd] = useState(false);
  const [mfaMsg, setMfaMsg] = useState(null);

  const mfaMutation = useMutation({
    mutationFn: ({ enabled }) => authService.toggleMFA(enabled, mfaPwd),
    onSuccess: (res) => {
      setUser((u) => ({ ...u, mfa_enabled: res.mfa_enabled }));
      setMfaMsg({
        type: 'success',
        text: res.mfa_enabled
          ? 'Autenticação em dois fatores ativada com sucesso!'
          : 'Autenticação em dois fatores desativada.',
      });
      setMfaPwd('');
      setTimeout(() => setMfaMsg(null), 4000);
    },
    onError: (err) => {
      setMfaMsg({ type: 'error', text: err.response?.data?.detail || 'Erro ao alterar MFA' });
    },
  });

  const handleMfaToggle = (e) => {
    e.preventDefault();
    setMfaMsg(null);
    mfaMutation.mutate({ enabled: !user?.mfa_enabled });
  };

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
            {email !== user?.email && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Por segurança, enviaremos um link de confirmação para o novo endereço antes de alterar.
              </p>
            )}
          </div>
          {email !== user?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Senha atual <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={emailChangePwd}
                onChange={(e) => setEmailChangePwd(e.target.value)}
                className={inputClass}
                placeholder="Confirme sua senha para alterar o email"
                required
                autoComplete="current-password"
              />
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                !profileChanged ||
                profileMutation.isPending ||
                (email !== user?.email && !emailChangePwd)
              }
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {profileMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Verificação de Email ──────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            user?.is_verified ? 'bg-green-500/10' : 'bg-amber-500/10'
          }`}>
            {user?.is_verified
              ? <BadgeCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
              : <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            }
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Verificação de Email</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user?.is_verified ? 'Seu email está verificado' : 'Verifique seu email para acessar todos os recursos'}
            </p>
          </div>
          {user?.is_verified && (
            <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              <Check className="w-3 h-3" />
              Verificado
            </span>
          )}
        </div>

        {!user?.is_verified && (
          <>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Email <span className="font-medium">{user?.email}</span> ainda não foi verificado.
                Sem verificação, você não poderá acessar funcionalidades de organização como billing, workspaces e integrações.
              </p>
            </div>

            {verifyMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
                verifyMsg.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                {verifyMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {verifyMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending || verifyMsg?.type === 'success'}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                {verifyMutation.isPending ? 'Enviando...' : 'Reenviar email de verificação'}
              </button>
            </div>
          </>
        )}
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

      {/* ── MFA ───────────────────────────────────────────── */}
      {user?.oauth_provider ? (
        <div className="card mb-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Autenticação em Dois Fatores</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                MFA não está disponível para contas {user.oauth_provider === 'google' ? 'Google' : 'GitHub'}.
                A segurança é gerenciada pelo provedor de identidade.
              </p>
            </div>
          </div>
        </div>
      ) : (
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${user?.mfa_enabled ? 'bg-green-500/10' : 'bg-gray-100 dark:bg-gray-700'}`}>
            <ShieldCheck className={`w-5 h-5 ${user?.mfa_enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Autenticação em Dois Fatores</h2>
              {user?.mfa_enabled ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Ativo</span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inativo</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user?.mfa_enabled
                ? 'Um código será enviado ao seu email a cada login.'
                : 'Adicione uma camada extra de segurança à sua conta.'}
            </p>
          </div>
        </div>

        {mfaMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
            mfaMsg.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {mfaMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {mfaMsg.text}
          </div>
        )}

        <form onSubmit={handleMfaToggle} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirme sua senha atual
            </label>
            <div className="relative">
              <input
                type={showMfaPwd ? 'text' : 'password'}
                value={mfaPwd}
                onChange={(e) => setMfaPwd(e.target.value)}
                className={inputClass + ' pr-10'}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowMfaPwd(!showMfaPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showMfaPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!mfaPwd || mfaMutation.isPending}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                user?.mfa_enabled
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800'
                  : 'btn-primary'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              {mfaMutation.isPending
                ? 'Salvando...'
                : user?.mfa_enabled
                  ? 'Desativar MFA'
                  : 'Ativar MFA'}
            </button>
          </div>
        </form>
      </div>
      )}

      {/* ── Info cloud accounts ───────────────────────────── */}
      <div className="card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          As contas cloud (AWS/Azure) agora são gerenciadas por workspace.
          Acesse <strong>Workspace → Configurações</strong> na barra lateral para adicionar ou remover contas.
        </p>
      </div>

      {/* ── LGPD / Privacidade ────────────────────────────── */}
      <LgpdSection user={user} logout={logout} />
    </Layout>
  );
};

// ── LGPD Section ─────────────────────────────────────────────────────────────

const LgpdSection = ({ user, logout }) => {
  const navigate = useNavigate();
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePwd, setDeletePwd] = useState('');
  const [deleteMsg, setDeleteMsg] = useState(null);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const data = await authService.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao exportar dados. Tente novamente.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    setDeleteMsg(null);
    try {
      await authService.deleteAccount(deletePwd);
      logout();
      navigate('/login');
    } catch (err) {
      setDeleteMsg(err.response?.data?.detail || 'Erro ao encerrar conta.');
    }
  };

  return (
    <div className="card border border-gray-200 dark:border-gray-700 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Privacidade e Dados (LGPD)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito de acessar, exportar e excluir seus dados.{' '}
          <Link to="/privacy" target="_blank" className="text-primary hover:underline inline-flex items-center gap-0.5">
            Política de Privacidade <ExternalLink className="w-3 h-3" />
          </Link>
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Exportar */}
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700
                     transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {exportLoading ? 'Exportando...' : 'Exportar meus dados'}
        </button>

        {/* Encerrar conta */}
        <button
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800
                     text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20
                     transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Encerrar minha conta
        </button>
      </div>

      {/* Delete confirmation modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Encerrar conta</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Esta ação é irreversível</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Seus dados pessoais (nome, e-mail, telefone) serão anonimizados imediatamente. Registros de faturamento
              e logs de auditoria são retidos pelo prazo legal de 5 anos conforme a LGPD.
            </p>
            <form onSubmit={handleDelete} className="space-y-3">
              {!user?.oauth_provider && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirme sua senha para continuar
                  </label>
                  <input
                    type="password"
                    value={deletePwd}
                    onChange={e => setDeletePwd(e.target.value)}
                    placeholder="Sua senha atual"
                    className="input w-full"
                    required
                  />
                </div>
              )}
              {deleteMsg && (
                <p className="text-xs text-red-500 dark:text-red-400">{deleteMsg}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setDeleteOpen(false); setDeletePwd(''); setDeleteMsg(null); }}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                             text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                >
                  Confirmar exclusão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
