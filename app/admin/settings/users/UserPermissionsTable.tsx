//app/admin/settings/users/UserPermissionsTable.tsx
'use client';

import { useState, useTransition } from 'react';
import type {
  AdminRole,
  PermissionsMap,
  FeatureKey,
} from '@/lib/adminPermissions';
import { ALL_FEATURES } from '@/lib/adminPermissions';
import {
  saveAdminUserAction,
  deleteAdminUserAction,
} from './actions';

type UserRow = {
  email: string;
  role: AdminRole;
  permissions: PermissionsMap;
};

type Props = {
  initialUsers: UserRow[];
  currentUserEmail: string | null;
  rootAdminEmail: string | null;
};

const emptyPermissionsForAll: PermissionsMap = ALL_FEATURES.reduce(
  (acc, feature) => {
    acc[feature] = { read: false, write: false };
    return acc;
  },
  {} as PermissionsMap
);

export default function UserPermissionsTable({
  initialUsers,
  currentUserEmail,
  rootAdminEmail,
}: Props) {
  const [users, setUsers] = useState<UserRow[]>(() =>
    initialUsers.map((u) => ({
      email: u.email,
      role: u.role,
      permissions: { ...emptyPermissionsForAll, ...(u.permissions || {}) },
    }))
  );

  const [isPending, startTransition] = useTransition();
  const [newEmail, setNewEmail] = useState('');

  // per-user tijdelijke wachtwoordvelden
  const [passwords, setPasswords] = useState<
    Record<string, { password: string; confirm: string }>
  >({});

  function updateUser(email: string, updater: (row: UserRow) => UserRow) {
    setUsers((prev) =>
      prev.map((u) => (u.email === email ? updater(u) : u))
    );
  }

  function isRootAdmin(email: string) {
    return (
      rootAdminEmail &&
      email.toLowerCase() === rootAdminEmail.toLowerCase()
    );
  }

  function isMe(email: string) {
    return (
      currentUserEmail &&
      email.toLowerCase() === currentUserEmail.toLowerCase()
    );
  }

  function handleTogglePerm(
    email: string,
    feature: FeatureKey,
    mode: 'read' | 'write'
  ) {
    updateUser(email, (row) => {
      const perms = {
        ...emptyPermissionsForAll,
        ...(row.permissions || {}),
      };
      const featurePerm = perms[feature] ?? { read: false, write: false };
      const nextValue = !featurePerm[mode];

      // Basisregel: write ⇒ read automatisch aan
      if (mode === 'write' && nextValue) {
        featurePerm.read = true;
      }

      featurePerm[mode] = nextValue;
      perms[feature] = featurePerm;

      return { ...row, permissions: perms };
    });
  }

  function handleRoleChange(email: string, role: AdminRole) {
    updateUser(email, (row) => ({ ...row, role }));
  }

  function handlePasswordFieldChange(
    email: string,
    field: 'password' | 'confirm',
    value: string
  ) {
    setPasswords((prev) => {
      const existing = prev[email] || { password: '', confirm: '' };
      return {
        ...prev,
        [email]: {
          password: field === 'password' ? value : existing.password,
          confirm: field === 'confirm' ? value : existing.confirm,
        },
      };
    });
  }

  function handleSave(user: UserRow) {
    const pwState = passwords[user.email] || { password: '', confirm: '' };

    startTransition(async () => {
      await saveAdminUserAction({
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        password: pwState.password,
        password_confirm: pwState.confirm,
      });

      // Na save velden leegmaken
      setPasswords((prev) => ({
        ...prev,
        [user.email]: { password: '', confirm: '' },
      }));
    });
  }

  function handleDelete(user: UserRow) {
    if (
      !window.confirm(
        `User ${user.email} verwijderen uit admin rechten?`
      )
    ) {
      return;
    }

    startTransition(async () => {
      await deleteAdminUserAction(user.email);
    });

    setUsers((prev) => prev.filter((u) => u.email !== user.email));
  }

  function handleAddUser() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (users.some((u) => u.email.toLowerCase() === email)) {
      alert('User bestaat al in de rechtenlijst.');
      return;
    }

    const newUser: UserRow = {
      email,
      role: 'user',
      permissions: { ...emptyPermissionsForAll },
    };

    setUsers((prev) => [...prev, newUser]);
    setNewEmail('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Nieuwe user (e-mail)
          </label>
          <input
            type="email"
            className="border rounded px-2 py-1 text-sm"
            placeholder=user@domein.be
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={handleAddUser}
          className="px-3 py-1 text-sm border rounded"
        >
          Toevoegen
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 py-1 text-left border-b">E-mail</th>
              <th className="px-2 py-1 text-left border-b">Rol</th>
              {ALL_FEATURES.map((f) => (
                <th
                  key={f}
                  className="px-2 py-1 text-center border-b"
                >
                  {f}
                  <div className="text-[10px] text-gray-500">
                    R / W
                  </div>
                </th>
              ))}
              <th className="px-2 py-1 text-right border-b">Acties</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const root = isRootAdmin(u.email);
              const me = isMe(u.email);
              const pwState =
                passwords[u.email] || { password: '', confirm: '' };

              return (
                <tr key={u.email} className="border-t">
                  <td className="px-2 py-1 align-top">
                    {u.email}
                    {root && (
                      <span className="ml-1 text-[10px] text-orange-600">
                        (root)
                      </span>
                    )}
                    {me && (
                      <span className="ml-1 text-[10px] text-blue-600">
                        (jij)
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 align-top">
                    <select
                      className="border rounded px-1 py-0.5 text-xs"
                      value={u.role}
                      onChange={(e) =>
                        handleRoleChange(
                          u.email,
                          e.target.value as AdminRole
                        )
                      }
                      disabled={!!root}
                    >
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </select>
                  </td>
                  {ALL_FEATURES.map((feature) => {
                    const perm =
                      u.permissions[feature] ||
                      emptyPermissionsForAll[feature]!;
                    const disabled = root; // root admin is in praktijk altijd full access
                    return (
                      <td
                        key={feature}
                        className="px-2 py-1 align-top text-center"
                      >
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!!perm.read}
                            disabled={!!disabled}
                            onChange={() =>
                              handleTogglePerm(
                                u.email,
                                feature,
                                'read'
                              )
                            }
                          />
                          <input
                            type="checkbox"
                            checked={!!perm.write}
                            disabled={!!disabled}
                            onChange={() =>
                              handleTogglePerm(
                                u.email,
                                feature,
                                'write'
                              )
                            }
                          />
                        </label>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 align-top text-right space-x-1">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex flex-col items-end gap-1 text-[10px]">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-gray-600">
                            Nieuw wachtwoord
                          </span>
                          <input
                            type="password"
                            className="border rounded px-2 py-0.5 text-xs"
                            placeholder="Laat leeg om niet te wijzigen"
                            value={pwState.password}
                            onChange={(e) =>
                              handlePasswordFieldChange(
                                u.email,
                                'password',
                                e.target.value
                              )
                            }
                            autoComplete="new-password"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-gray-600">
                            Herhaal wachtwoord
                          </span>
                          <input
                            type="password"
                            className="border rounded px-2 py-0.5 text-xs"
                            placeholder="Herhaal nieuw wachtwoord"
                            value={pwState.confirm}
                            onChange={(e) =>
                              handlePasswordFieldChange(
                                u.email,
                                'confirm',
                                e.target.value
                              )
                            }
                            autoComplete="new-password"
                          />
                        </label>
                      </div>
                      <div className="space-x-1">
                        <button
                          type="button"
                          onClick={() => handleSave(u)}
                          className="px-2 py-0.5 border rounded text-xs"
                          disabled={isPending}
                        >
                          Opslaan
                        </button>
                        {!isRootAdmin(u.email) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            className="px-2 py-0.5 border rounded text-xs text-red-600"
                            disabled={isPending || !!me}
                            title={
                              me
                                ? 'Je kunt jezelf hier niet verwijderen.'
                                : 'User uit adminrechten verwijderen'
                            }
                          >
                            Verwijderen
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isPending && (
        <div className="text-xs text-gray-500">
          Bezig met opslaan...
        </div>
      )}
    </div>
  );
}
