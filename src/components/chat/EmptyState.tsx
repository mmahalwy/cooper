import { Stack, Title, Text } from '@mantine/core';

export function EmptyState() {
  return (
    <Stack align="center" justify="center" h="100%" gap="md">
      <Title order={2}>Welcome to Cooper</Title>
      <Text c="dimmed">Start a new conversation to get going.</Text>
    </Stack>
  );
}
