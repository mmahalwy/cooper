'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getTeamAction,
  inviteCoworkerAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from '@/app/actions';
import {
  UsersIcon,
  MailIcon,
  ShieldIcon,
  TrashIcon,
  SendIcon,
  ClockIcon,
  CheckCircleIcon,
} from 'lucide-react';

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export function TeamManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  function loadTeam() {
    startTransition(async () => {
      const data = await getTeamAction();
      setMembers(data.members);
      setInvitations(data.invitations);
    });
  }

  useEffect(() => { loadTeam(); }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    startTransition(async () => {
      const result = await inviteCoworkerAction(email, role);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`Invitation sent to ${email}`);
        setEmail('');
        loadTeam();
      }
    });
  }

  async function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeInvitationAction(id);
      loadTeam();
    });
  }

  async function handleRoleChange(userId: string, newRole: 'admin' | 'member') {
    startTransition(async () => {
      const result = await updateMemberRoleAction(userId, newRole);
      if (result.error) setError(result.error);
      else loadTeam();
    });
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">Invite coworkers and manage your team</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-3xl">
        {/* Invite Form */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <SendIcon className="size-4" />
              Invite a coworker
            </h3>
            <form onSubmit={handleInvite} className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'member')}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Sending...' : 'Invite'}
              </Button>
            </form>
            {error && <p className="text-xs text-destructive mt-2">{error}</p>}
            {success && <p className="text-xs text-green-600 mt-2">{success}</p>}
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <ClockIcon className="size-4" />
                Pending Invitations
              </h3>
              <div className="space-y-2">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <MailIcon className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{inv.role}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)}>
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Members */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <UsersIcon className="size-4" />
              Team Members ({members.length})
            </h3>
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {(member.name || member.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.name || member.email.split('@')[0]}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.id, v as 'admin' | 'member')}
                    >
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
