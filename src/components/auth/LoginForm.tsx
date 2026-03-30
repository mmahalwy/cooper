'use client';

import { useState } from 'react';
import { TextInput, Button, Stack, Text, Paper, Title, Alert } from '@mantine/core';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <Paper p="xl" radius="md" withBorder maw={400} mx="auto" mt={100}>
        <Stack>
          <Title order={3}>Check your email</Title>
          <Text c="dimmed">
            We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="xl" radius="md" withBorder maw={400} mx="auto" mt={100}>
      <form onSubmit={handleSubmit}>
        <Stack>
          <Title order={3}>Sign in to Cooper</Title>
          <Text c="dimmed" size="sm">
            Enter your email and we&apos;ll send you a magic link.
          </Text>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Email"
            placeholder="you@company.com"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <Button type="submit" loading={loading} fullWidth>
            Send magic link
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
