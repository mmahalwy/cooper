"use client";

import { Container, Group, Button, Burger, Drawer, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import classes from "./Navbar.module.css";

const links = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
];

export function Navbar() {
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <header className={classes.header}>
      <Container size="lg" className={classes.inner}>
        <div className={classes.logo}>
          <div className={classes.logoIcon}>C</div>
          Cooper
        </div>

        <nav className={classes.links}>
          {links.map((link) => (
            <a key={link.label} href={link.href} className={classes.link}>
              {link.label}
            </a>
          ))}
        </nav>

        <Group className={classes.cta}>
          <Button
            size="xs"
            component="a"
            href="#waitlist"
            styles={{
              root: {
                fontWeight: 500,
                fontSize: "0.8125rem",
                height: 32,
                paddingInline: 14,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
              },
            }}
          >
            Join Waitlist
          </Button>
        </Group>

        <Burger
          opened={opened}
          onClick={toggle}
          className={classes.burger}
          color="dark"
          size="sm"
        />

        <Drawer
          opened={opened}
          onClose={close}
          size="100%"
          padding="md"
          title="Cooper"
          zIndex={200}
        >
          <Stack>
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={classes.link}
                onClick={close}
              >
                {link.label}
              </a>
            ))}
            <Button
              fullWidth
              component="a"
              href="#waitlist"
              styles={{
                root: {
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                },
              }}
            >
              Join Waitlist
            </Button>
          </Stack>
        </Drawer>
      </Container>
    </header>
  );
}
