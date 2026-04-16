import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck, User, LayoutDashboard } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getUser2, createUser, updateUser,
  getUserPermissions, setUserPermissions,
  getDashboards,
  type UserNivel,
} from '@/services/api';
import { toast } from '@/hooks/use-toast';

const inputStyle: React.CSSProperties = {
  width: '100%', height: '2.375rem', padding: '0 0.75rem',
  border: '1px solid #d1d5db', borderRadius: '0.375rem',
  fontSize: '0.875rem', color: '#111827', backgroundColor: '#ffffff',
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '0.375rem',
  fontSize: '0.8125rem', fontWeight: 500, color: '#374151',
};

export default function UserCreate() {
  const navigate   = useNavigate();
  const { id }     = useParams<{ id: string }>();
  const isEdit     = !!id;

  const [usuario,       setUsuario]       = useState('');
  const [nome,          setNome]          = useState('');
  const [senha,         setSenha]         = useState('');
  const [confirmSenha,  setConfirmSenha]  = useState('');
  const [nivel,         setNivel]         = useState<UserNivel>('usuario');
  const [ativo,         setAtivo]         = useState(true);
  const [selectedDashs, setSelectedDashs] = useState<number[]>([]);
  const [saving,        setSaving]        = useState(false);

  // Load dashboards for permission selector
  const { data: dashboards } = useQuery({
    queryKey: ['dashboards-all'],
    queryFn: getDashboards,
  });

  // Load user when editing
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const [u, perms] = await Promise.all([
          getUser2(Number(id)),
          getUserPermissions(Number(id)),
        ]);
        setUsuario(u.usuario);
        setNome(u.nome || '');
        setNivel(u.nivel);
        setAtivo(u.ativo === 1);
        setSelectedDashs(perms);
      } catch (err: unknown) {
        toast({ variant: 'destructive', title: 'Erro', description: (err as Error).message });
      }
    })();
  }, [id, isEdit]);

  const toggleDash = (dashId: number) => {
    setSelectedDashs(prev =>
      prev.includes(dashId) ? prev.filter(d => d !== dashId) : [...prev, dashId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!usuario.trim()) return toast({ variant: 'destructive', title: 'Erro', description: 'Usuário é obrigatório' });
    if (!isEdit && !senha.trim()) return toast({ variant: 'destructive', title: 'Erro', description: 'Senha é obrigatória' });
    if (senha && senha !== confirmSenha) return toast({ variant: 'destructive', title: 'Erro', description: 'Senhas não conferem' });

    setSaving(true);
    try {
      let userId: number;
      if (isEdit) {
        const u = await updateUser(Number(id), {
          usuario: usuario.trim(), nome: nome.trim() || undefined,
          senha: senha.trim() || undefined, nivel, ativo,
        });
        userId = u.id;
      } else {
        const u = await createUser({
          usuario: usuario.trim(), nome: nome.trim() || undefined,
          senha: senha.trim(), nivel, ativo,
        });
        userId = u.id;
      }

      // Save permissions (only relevant for non-admin users, but save anyway)
      await setUserPermissions(userId, nivel === 'admin' ? [] : selectedDashs);

      toast({ title: isEdit ? 'Usuário atualizado' : 'Usuário criado', description: `${usuario} salvo com sucesso.` });
      navigate('/users');
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Erro', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title={isEdit ? 'Editar Usuário' : 'Novo Usuário'}>
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => navigate('/users')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h1>
        </div>

        {/* Basic info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados do Usuário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Login *</label>
                <input
                  style={inputStyle}
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder="nome.de.usuario"
                  autoComplete="off"
                />
              </div>
              <div>
                <label style={labelStyle}>Nome completo</label>
                <input
                  style={inputStyle}
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Nome Sobrenome"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{isEdit ? 'Nova senha (deixe em branco para manter)' : 'Senha *'}</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder={isEdit ? 'Nova senha...' : 'Senha...'}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label style={labelStyle}>Confirmar senha</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={confirmSenha}
                  onChange={e => setConfirmSenha(e.target.value)}
                  placeholder="Repita a senha..."
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Nivel */}
            <div>
              <label style={labelStyle}>Nível de acesso</label>
              <div className="flex gap-3 mt-1">
                {(['admin', 'usuario'] as UserNivel[]).map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNivel(n)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '2px solid',
                      borderColor: nivel === n ? (n === 'admin' ? '#7c3aed' : '#2563eb') : '#e5e7eb',
                      backgroundColor: nivel === n ? (n === 'admin' ? '#f5f3ff' : '#eff6ff') : '#ffffff',
                      color: nivel === n ? (n === 'admin' ? '#7c3aed' : '#2563eb') : '#6b7280',
                      fontWeight: nivel === n ? 600 : 400, fontSize: '0.875rem', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {n === 'admin'
                      ? <ShieldCheck style={{ width: '1rem', height: '1rem' }} />
                      : <User style={{ width: '1rem', height: '1rem' }} />}
                    {n === 'admin' ? 'Administrador' : 'Usuário'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ativo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <input
                id="ativo"
                type="checkbox"
                checked={ativo}
                onChange={e => setAtivo(e.target.checked)}
                style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
              />
              <label htmlFor="ativo" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                Usuário ativo
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard permissions */}
        {nivel === 'usuario' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutDashboard className="h-4 w-4 text-primary" />
                Dashboards permitidos
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Selecione quais dashboards este usuário poderá visualizar.
              </p>
            </CardHeader>
            <CardContent>
              {!dashboards || dashboards.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dashboard cadastrado.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {dashboards.map(d => (
                    <label
                      key={d.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.625rem',
                        padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
                        border: `1px solid ${selectedDashs.includes(d.id) ? '#2563eb' : '#e5e7eb'}`,
                        backgroundColor: selectedDashs.includes(d.id) ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDashs.includes(d.id)}
                        onChange={() => toggleDash(d.id)}
                        style={{ width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>{d.nome}</p>
                        {d.descricao && (
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>{d.descricao}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {nivel === 'admin' && (
          <Card className="border-violet-200 bg-violet-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-violet-700 text-sm">
                <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                <span>Administradores têm acesso a <strong>todos</strong> os dashboards e funcionalidades.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/users')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </AppLayout>
  );
}
