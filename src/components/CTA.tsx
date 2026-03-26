"use client";

import { Container, Button, TextInput, Group } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import classes from "./CTA.module.css";

export function CTA() {
  return (
    <section className={classes.section} id="waitlist">
      <Container size="md">
        <h2 className={classes.title}>
          Get early access to{" "}
          <span className={classes.gradient}>Cooper.</span>
        </h2>
        <p className={classes.subtitle}>
          Join the waitlist. We&apos;ll let you know when it&apos;s ready.
        </p>
        <form
          className={classes.form}
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <Group className={classes.inputGroup}>
            <TextInput
              placeholder="you@company.com"
              size="md"
              type="email"
              required
              classNames={{
                input: classes.input,
                root: classes.inputRoot,
              }}
            />
            <Button
              size="md"
              variant="white"
              color="dark"
              rightSection={<IconArrowRight size={14} />}
              type="submit"
              styles={{
                root: {
                  fontWeight: 500,
                  fontSize: "0.875rem",
                },
              }}
            >
              Join Waitlist
            </Button>
          </Group>
        </form>
        <p className={classes.note}>
          No spam, ever.
        </p>
      </Container>
    </section>
  );
}
