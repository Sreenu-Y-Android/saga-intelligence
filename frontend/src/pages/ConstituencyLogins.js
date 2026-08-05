import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Search,
  ShieldCheck,
  UserPlus,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Power,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { TG_MLAS, normalizeConstituencyKey } from '../data/tgMLAs';
import { TG_MPS } from '../data/tgMPs';

const PARTY_STYLES = {
  // Amber, not blue — INC's real saffron/white/green tricolor doesn't read well as
  // badge text, and BJP already owns the brighter orange in this legend.
  INC: 'bg-amber-100 text-amber-800 border-amber-300',
  BRS: 'bg-pink-100 text-pink-700 border-pink-300',
  BJP: 'bg-orange-100 text-orange-700 border-orange-300',
  AIMIM: 'bg-green-100 text-green-700 border-green-300',
};

const titleCase = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const slugify = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const generatePassword = () => {
  const word = Math.random().toString(36).slice(-6);
  return `Saga@${word}!`;
};

/* ─── modal ──────────────────────────────────────────────────────── */

const ProvisionModal = ({ entity, kind, existingUser, onClose, onSaved }) => {
  /*
   * `entity` is either an MLA record (kind = 'mla') or an MP record
   * (kind = 'mp'). The modal handles both via a single form, switching only
   * the assignment field that gets persisted on the backend.
   */
  const isEdit = !!existingUser;
  const defaultEmail =
    kind === 'mp'
      ? `${slugify(entity.lsId || entity.lsName)}.mp@blurasaga.local`
      : `${slugify(entity.constituency)}@blurasaga.local`;
  const defaultName =
    kind === 'mp'
      ? `${entity.mp || titleCase(entity.lsName)} (${entity.party})`
      : `${entity.mla || titleCase(entity.constituency)} (${entity.party})`;

  const [form, setForm] = useState({
    email: existingUser?.email || defaultEmail,
    password: '',
    full_name: existingUser?.full_name || defaultName,
    role: existingUser?.role || (kind === 'mp' ? 'mp' : 'mla'),
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isEdit) {
        const payload = { full_name: form.full_name };
        if (form.password) payload.password = form.password;
        await api.patch(`/auth/scoped-user/${existingUser.id}`, payload);
        toast.success('Account updated');
      } else {
        if (!form.password) {
          setBusy(false);
          toast.error('Set a password');
          return;
        }
        const payload = {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
        };
        if (kind === 'mp') {
          payload.assigned_lok_sabha = entity.lsName;
        } else {
          payload.assigned_constituency = entity.constituency;
        }
        await api.post('/auth/provision-mla', payload);
        toast.success('Login provisioned');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const seatLabel =
    kind === 'mp'
      ? `${titleCase(entity.lsName)} · Lok Sabha`
      : `${titleCase(entity.constituency)} · Assembly`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{seatLabel}</div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isEdit ? 'Reset Login' : 'Provision Login'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Full name</label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Email</label>
            <Input
              type="email"
              value={form.email}
              disabled={isEdit}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-slate-500">
              Password {isEdit && <span className="text-slate-400">(leave blank to keep)</span>}
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={isEdit ? '(unchanged)' : 'Strong password'}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm({ ...form, password: generatePassword() })}
              >
                Generate
              </Button>
            </div>
            {form.password && (
              <div className="text-[11px] text-amber-600 mt-1">
                Copy this — it won't be shown again.
              </div>
            )}
          </div>
          {!isEdit && kind === 'mla' && (
            <div>
              <label className="text-[11px] uppercase tracking-wide text-slate-500">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              >
                <option value="mla">MLA</option>
                <option value="special_leader">Special Leader</option>
                <option value="constituency_manager">Constituency Manager</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isEdit ? 'Save' : 'Create Login'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── page ──────────────────────────────────────────────────────── */

const ConstituencyLogins = () => {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tab, setTab] = useState('mla'); // 'mla' | 'mp'
  const [modalFor, setModalFor] = useState(null); // { entity, kind, user }

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/constituency-users');
      setUsers(res.data?.users || []);
    } catch (_e) {
      toast.error('Failed to load logins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchUsers();
  }, [isSuperAdmin]);

  const mlaUsersByKey = useMemo(() => {
    const m = new Map();
    users.forEach((u) => {
      if (u.assigned_constituency && (u.role === 'mla' || u.role === 'nara_lokesh' || u.role === 'constituency_manager')) {
        m.set(normalizeConstituencyKey(u.assigned_constituency), u);
      }
    });
    return m;
  }, [users]);

  const mpUsersByKey = useMemo(() => {
    const m = new Map();
    users.forEach((u) => {
      if (u.assigned_lok_sabha && u.role === 'mp') {
        m.set(slugify(u.assigned_lok_sabha), u);
      }
    });
    return m;
  }, [users]);

  /* ─── filtered rows for whichever tab is active ─── */
  const mlaRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return TG_MLAS.filter((m) => {
      if (partyFilter !== 'ALL' && m.party !== partyFilter) return false;
      if (s) {
        const blob = `${m.constituency} ${m.mla} ${m.party}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      const user = mlaUsersByKey.get(normalizeConstituencyKey(m.constituency));
      if (statusFilter === 'PROVISIONED' && !user) return false;
      if (statusFilter === 'PENDING' && user) return false;
      return true;
    });
  }, [search, partyFilter, statusFilter, mlaUsersByKey]);

  const mpRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return TG_MPS.filter((m) => {
      if (partyFilter !== 'ALL' && m.party !== partyFilter) return false;
      if (s) {
        const blob = `${m.lsName} ${m.mp} ${m.party}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      const user = mpUsersByKey.get(slugify(m.lsName));
      if (statusFilter === 'PROVISIONED' && !user) return false;
      if (statusFilter === 'PENDING' && user) return false;
      return true;
    });
  }, [search, partyFilter, statusFilter, mpUsersByKey]);

  const provisionedMla = mlaUsersByKey.size;
  const provisionedMp = mpUsersByKey.size;
  const totalMla = TG_MLAS.length;
  const totalMp = TG_MPS.length;

  const toggleActive = async (user) => {
    try {
      await api.patch(`/auth/scoped-user/${user.id}`, { is_active: !user.is_active });
      toast.success(user.is_active ? 'Disabled' : 'Re-enabled');
      fetchUsers();
    } catch (_e) {
      toast.error('Update failed');
    }
  };

  if (authLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!isSuperAdmin) return <Navigate to="/andhra-pradesh-map" replace />;

  /* ─── view-model for the active tab ─── */
  const rows = tab === 'mla' ? mlaRows : mpRows;
  const tabProvisioned = tab === 'mla' ? provisionedMla : provisionedMp;
  const tabTotal = tab === 'mla' ? totalMla : totalMp;
  const tabPending = tabTotal - tabProvisioned;

  return (
    <div className="space-y-4">
      <Card className="p-5 border border-slate-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <ShieldCheck className="h-4 w-4" />
              <span className="uppercase tracking-wide">RBAC · Login Provisioning</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Constituency & MP Logins</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              One login per Telangana assembly constituency and per Lok Sabha seat. Scoped
              users only see grievances, alerts, sentiment, and analytics for their own region.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-center px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 min-w-[88px]">
              <div className="text-lg font-bold text-emerald-700">{tabProvisioned}</div>
              <div className="text-[10px] uppercase text-emerald-600">Provisioned</div>
            </div>
            <div className="text-center px-3 py-2 rounded-md bg-amber-50 border border-amber-200 min-w-[88px]">
              <div className="text-lg font-bold text-amber-700">{tabPending}</div>
              <div className="text-[10px] uppercase text-amber-600">Pending</div>
            </div>
            <div className="text-center px-3 py-2 rounded-md bg-slate-50 border border-slate-200 min-w-[88px]">
              <div className="text-lg font-bold text-slate-700">{tabTotal}</div>
              <div className="text-[10px] uppercase text-slate-500">
                {tab === 'mla' ? 'AC seats' : 'LS seats'}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs: MLA / MP */}
        <div className="mt-4 inline-flex rounded-md overflow-hidden border border-slate-200">
          <button
            type="button"
            onClick={() => setTab('mla')}
            className={`px-4 py-1.5 text-sm font-medium ${
              tab === 'mla' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            MLAs ({provisionedMla} / {totalMla})
          </button>
          <button
            type="button"
            onClick={() => setTab('mp')}
            className={`px-4 py-1.5 text-sm font-medium border-l border-slate-200 ${
              tab === 'mp' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            MPs ({provisionedMp} / {totalMp})
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-8"
              placeholder={
                tab === 'mla' ? 'Search constituency, MLA, party…' : 'Search Lok Sabha seat, MP, party…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
          >
            <option value="ALL">All parties</option>
            <option value="INC">INC</option>
            <option value="BRS">BRS</option>
            <option value="BJP">BJP</option>
            <option value="AIMIM">AIMIM</option>
          </select>
          <select
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All seats</option>
            <option value="PENDING">Login pending</option>
            <option value="PROVISIONED">Login created</option>
          </select>
        </div>
      </Card>

      <Card className="border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">{tab === 'mla' ? 'Constituency' : 'Lok Sabha Seat'}</th>
                  <th className="text-left px-3 py-2">{tab === 'mla' ? 'MLA' : 'MP'}</th>
                  <th className="text-left px-3 py-2">Party</th>
                  <th className="text-left px-3 py-2">Login</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Last sign-in</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isMla = tab === 'mla';
                  const seatName = isMla ? row.constituency : row.lsName;
                  const personName = isMla ? row.mla : row.mp;
                  const user = isMla
                    ? mlaUsersByKey.get(normalizeConstituencyKey(seatName))
                    : mpUsersByKey.get(slugify(seatName));
                  const partyStyle =
                    PARTY_STYLES[row.party] || 'bg-slate-100 text-slate-700 border-slate-300';
                  const key = isMla ? row.key : row.lsId;
                  return (
                    <tr key={key} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {titleCase(seatName)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{personName}</td>
                      <td className="px-3 py-2">
                        <Badge className={`border ${partyStyle}`}>{row.party}</Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {user ? (
                          <span className="font-mono text-xs">{user.email}</span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {user ? (
                          user.is_active ? (
                            <Badge className="border bg-emerald-100 text-emerald-700 border-emerald-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                            </Badge>
                          ) : (
                            <Badge className="border bg-slate-200 text-slate-600 border-slate-300">
                              Disabled
                            </Badge>
                          )
                        ) : (
                          <Badge className="border bg-amber-100 text-amber-700 border-amber-300">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {user?.last_login_at ? (
                          <div className="flex flex-col">
                            <span className="text-xs">
                              {new Date(user.last_login_at).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {user.login_count || 0} sign-ins
                              {user.last_login_ip ? ` · ${user.last_login_ip}` : ''}
                            </span>
                          </div>
                        ) : user ? (
                          <span className="text-[11px] text-amber-600">Never signed in</span>
                        ) : (
                          <span className="text-slate-300 italic text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setModalFor({ entity: row, kind: tab, user })}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleActive(user)}
                              title={user.is_active ? 'Disable' : 'Re-enable'}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => setModalFor({ entity: row, kind: tab, user: null })}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" /> Provision
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-sm text-slate-500 py-10">
                      No {tab === 'mla' ? 'constituencies' : 'Lok Sabha seats'} match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalFor && (
        <ProvisionModal
          entity={modalFor.entity}
          kind={modalFor.kind}
          existingUser={modalFor.user}
          onClose={() => setModalFor(null)}
          onSaved={() => {
            setModalFor(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
};

export default ConstituencyLogins;
