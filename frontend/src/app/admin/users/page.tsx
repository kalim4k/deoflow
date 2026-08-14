'use client';

// Utilisateurs (3.13 du PRD). Trois actions, toutes sur l'API réelle :
//   - PATCH /api/admin/users/:id/role   — réservé au SUPERADMIN
//   - PATCH /api/admin/users/:id/status — suspension / réactivation, motif requis
//   - POST  /api/admin/credits          — crédit / débit manuel (F34), SUPERADMIN
//
// L'ajustement de crédits agissait auparavant sur le portefeuille simulé du
// navigateur : il affichait une confirmation encourageante sans rien changer
// au compte visé. Il passe désormais par `withUserCredits` — transaction
// sérialisable verrouillée sur le compte — et par `logAdminAction`, dans la
// même transaction. Un mouvement d'argent et sa trace sont indissociables.

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { formatDate } from '@/lib/format';
import { useAdmin } from '@/components/admin/AdminContext';
import { useAdminList } from '@/components/admin/useAdminList';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { Alert, Badge, EmptyState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { InputField, controlClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CoinsIcon, SearchIcon, UsersIcon } from '@/components/icons';
import { useToast } from '@/contexts/ToastContext';
import { adjustCredits, type AdminUser } from '@/lib/deoflow/adminApi';

type Role = AdminUser['role'];

export default function AdminUsersPage() {
  const admin = useAdmin();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [creditTarget, setCreditTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [delta, setDelta] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const buildPath = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams({ limit: '50' });
      if (submittedQuery) params.set('q', submittedQuery);
      if (cursor) params.set('cursor', cursor);
      return `/api/admin/users?${params.toString()}`;
    },
    [submittedQuery],
  );

  const { items, cursor, loading, loadingMore, error, loadMore, reload } =
    useAdminList<AdminUser>(buildPath);

  const canChangeRole = useMemo(() => admin?.role === 'SUPERADMIN', [admin]);

  function openStatus(user: AdminUser) {
    setStatusTarget(user);
    setReason('');
    setDialogError(null);
  }

  function openCredit(user: AdminUser) {
    setCreditTarget(user);
    setReason('');
    setDelta('');
    setDialogError(null);
  }

  async function changeRole(user: AdminUser, role: Role) {
    if (role === user.role) return;
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}/role`, { method: 'PATCH', body: { role } });
      toast(`Rôle de ${user.email} mis à jour.`, 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function submitStatus(e: FormEvent) {
    e.preventDefault();
    if (!statusTarget) return;
    const nextStatus = statusTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    if (reason.trim().length === 0) {
      setDialogError('Le motif est obligatoire — il est enregistré dans le journal d’audit.');
      return;
    }

    setWorking(true);
    setDialogError(null);
    try {
      await api(`/api/admin/users/${statusTarget.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus, reason: reason.trim() },
      });
      toast(
        nextStatus === 'SUSPENDED'
          ? `${statusTarget.email} est suspendu.`
          : `${statusTarget.email} est réactivé.`,
        'success',
      );
      setStatusTarget(null);
      reload();
    } catch (err) {
      setDialogError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function submitCredit(e: FormEvent) {
    e.preventDefault();
    if (!creditTarget) return;

    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setDialogError('Saisissez un nombre entier de crédits, positif ou négatif.');
      return;
    }
    if (reason.trim().length === 0) {
      setDialogError('Le motif est obligatoire.');
      return;
    }

    setWorking(true);
    setDialogError(null);
    try {
      const res = await adjustCredits({
        userId: creditTarget.id,
        credits: parsed,
        reason: reason.trim(),
      });
      toast(
        `${parsed > 0 ? '+' : ''}${parsed} crédits sur ${creditTarget.email} — nouveau solde : ${res.balanceAfter}.`,
        'success',
      );
      setCreditTarget(null);
      // Le solde affiché dans le tableau vient d'être modifié : le recharger
      // évite qu'un second ajustement soit décidé sur un chiffre périmé.
      reload();
    } catch (err) {
      setDialogError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Utilisateurs"
        description="Recherche, rôle, suspension et ajustement de crédits."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQuery(query.trim());
          }}
          className="flex gap-2"
          role="search"
        >
          <label htmlFor="admin-users-search" className="sr-only">
            Rechercher un utilisateur
          </label>
          <input
            id="admin-users-search"
            type="search"
            placeholder="email ou nom…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${controlClass} min-w-0 py-2 text-sm sm:w-64`}
          />
          <Button type="submit" size="sm">
            <SearchIcon className="size-4" />
            Chercher
          </Button>
        </form>
      </AdminPageHeader>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-8" />}
          title="Aucun utilisateur trouvé"
          description="Affinez la recherche ou videz le champ pour tout afficher."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TableShell>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Nom</Th>
                <Th>Rôle</Th>
                <Th>Statut</Th>
                <Th className="text-right">Crédits</Th>
                <Th>Inscrit le</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium text-ink-900">{u.email}</Td>
                  <Td>{u.name ?? '—'}</Td>
                  <Td>
                    {canChangeRole ? (
                      <>
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Rôle de {u.email}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) => void changeRole(u, e.target.value as Role)}
                          className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-700 transition-colors duration-200 hover:border-line-strong disabled:opacity-50"
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="SUPERADMIN">SUPERADMIN</option>
                        </select>
                      </>
                    ) : (
                      <Badge tone={u.role === 'USER' ? 'neutral' : 'ink'}>{u.role}</Badge>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td className="text-right font-display tabular-nums">
                    {u.credits.toLocaleString('fr-FR')}
                  </Td>
                  <Td className="text-ink-500">{formatDate(u.createdAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openCredit(u)}>
                        <CoinsIcon className="size-4" />
                        Crédits
                      </Button>
                      <Button
                        size="sm"
                        variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'}
                        disabled={busyId === u.id}
                        onClick={() => openStatus(u)}
                      >
                        {u.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>

          {cursor && (
            <Button
              variant="secondary"
              size="sm"
              loading={loadingMore}
              onClick={loadMore}
              className="self-start"
            >
              Charger plus
            </Button>
          )}
        </div>
      )}

      {/* Suspension / réactivation — API réelle, auditée côté serveur. */}
      <Modal
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title={statusTarget?.status === 'ACTIVE' ? 'Suspendre le compte' : 'Réactiver le compte'}
      >
        <form onSubmit={submitStatus} className="flex flex-col gap-4">
          <p className="text-sm text-ink-500">
            {statusTarget?.status === 'ACTIVE'
              ? `${statusTarget?.email} ne pourra plus se connecter.`
              : `${statusTarget?.email} pourra de nouveau se connecter.`}
          </p>

          <InputField
            label="Motif"
            required
            maxLength={500}
            hint="Enregistré dans le journal d’audit avec votre identité."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {dialogError && <Alert tone="error">{dialogError}</Alert>}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>
              Annuler
            </Button>
            <Button
              type="submit"
              variant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
              loading={working}
            >
              Confirmer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ajustement de crédits — API réelle, verrouillée par compte et auditée. */}
      <Modal
        open={creditTarget !== null}
        onClose={() => setCreditTarget(null)}
        title="Ajuster les crédits"
      >
        <form onSubmit={submitCredit} className="flex flex-col gap-4">
          <div className="rounded-xl bg-sunken p-3">
            <p className="truncate text-sm text-ink-700">{creditTarget?.email}</p>
            <p className="text-xs text-ink-500">
              Solde actuel :{' '}
              <span className="font-display tabular-nums">
                {creditTarget?.credits.toLocaleString('fr-FR')}
              </span>{' '}
              crédits
            </p>
          </div>

          <Alert tone="warning">
            Les crédits ajoutés ici n&apos;ont été payés par personne et se consommeront en argent
            réel chez kie.ai. L&apos;opération est enregistrée dans le journal d&apos;audit avec
            votre identité et votre motif.
          </Alert>

          <InputField
            label="Crédits à ajouter ou retirer"
            type="number"
            required
            step={1}
            inputMode="numeric"
            placeholder="10 ou -10"
            hint="Un nombre entier. Négatif pour retirer."
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />

          <InputField
            label="Motif"
            required
            maxLength={500}
            hint="Obligatoire — il accompagnera l’opération dans le journal."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {dialogError && <Alert tone="error">{dialogError}</Alert>}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setCreditTarget(null)}>
              Annuler
            </Button>
            <Button type="submit" loading={working}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
