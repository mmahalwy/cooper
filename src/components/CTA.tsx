"use client";

import { useActionState } from "react";
import { Container, Button, TextInput, Group } from "@mantine/core";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import { joinWaitlist } from "@/app/actions";
import classes from "./CTA.module.css";

export function CTA() {
  const [state, formAction, pending] = useActionState(
    async (_prev: { success?: boolean; error?: string } | null, formData: FormData) => {
      return joinWaitlist(formData);
    },
    null
  );

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

        {state?.success ? (
          <div className={classes.success}>
            <IconCheck size={20} />
            <span>You&apos;re on the list. We&apos;ll be in touch.</span>
          </div>
        ) : (
          <form className={classes.form} action={formAction}>
            <Group className={classes.inputGroup}>
              <TextInput
                name="email"
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
                rightSection={<IconArrowRight size={14} />}
                type="submit"
                loading={pending}
                styles={{
                  root: {
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                  },
                }}
              >
                Join Waitlist
              </Button>
            </Group>
            {state?.error && (
              <p className={classes.error}>{state.error}</p>
            )}
          </form>
        )}

        <p className={classes.note}>No spam, ever.</p>
      </Container>
    </section>
  );
}
