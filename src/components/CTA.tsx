"use client";

import { useActionState } from "react";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
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
      <div className={classes.container}>
        <h2 className={classes.title}>
          Get early access to{" "}
          <span className={classes.gradient}>Cooper.</span>
        </h2>
        <p className={classes.subtitle}>
          Join the waitlist. We&apos;ll let you know when it&apos;s ready.
        </p>

        {state?.success ? (
          <div className={classes.success}>
            <CheckIcon size={20} />
            <span>You&apos;re on the list. We&apos;ll be in touch.</span>
          </div>
        ) : (
          <form className={classes.form} action={formAction}>
            <div className={classes.inputGroup}>
              <input
                name="email"
                placeholder="you@company.com"
                type="email"
                required
                className={`${classes.input} ${classes.inputRoot}`}
              />
              <button
                type="submit"
                disabled={pending}
                className={classes.submitButton}
              >
                {pending ? "Joining…" : "Join Waitlist"}
                {!pending && <ArrowRightIcon size={14} />}
              </button>
            </div>
            {state?.error && (
              <p className={classes.error}>{state.error}</p>
            )}
          </form>
        )}

        <p className={classes.note}>No spam, ever.</p>
      </div>
    </section>
  );
}
