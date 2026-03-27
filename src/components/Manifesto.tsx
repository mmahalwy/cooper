import { Container } from "@mantine/core";
import classes from "./Manifesto.module.css";

export function Manifesto() {
  return (
    <section className={classes.section}>
      <Container size="md">
        <div className={classes.content}>
          <p className={classes.lead}>
            Most AI tools sit in a tab and wait for you to ask.
          </p>
          <p className={classes.body}>
            Cooper is different. It lives inside your tools — Slack, GitHub,
            HubSpot, Stripe, Linear — and connects the dots the way a great
            teammate would. It pulls data from six sources to build a report. It
            notices a spike in errors before you do and investigates. It
            cross-references your CRM with your ad spend to flag deals that
            don&apos;t add up.
          </p>
          <p className={classes.body}>
            A real teammate doesn&apos;t wait to be told what to do. They see
            what needs to happen and make it happen. That&apos;s Cooper.
          </p>
        </div>

        <div className={classes.pillars}>
          <div className={classes.pillar}>
            <div className={classes.pillarNumber}>01</div>
            <h3 className={classes.pillarTitle}>
              Proactive, not reactive
            </h3>
            <p className={classes.pillarDesc}>
              Cooper monitors your workflows, catches anomalies, and acts before
              you have to ask. Weekly reports go out on Monday morning. Pipeline
              risks get flagged the moment a deal goes quiet. Incidents get
              investigated the second they fire.
            </p>
          </div>

          <div className={classes.pillar}>
            <div className={classes.pillarNumber}>02</div>
            <h3 className={classes.pillarTitle}>
              Connects the dots across tools
            </h3>
            <p className={classes.pillarDesc}>
              The best decisions come from stitching together data that lives in
              different places. Cooper pulls from your CRM, analytics, codebase,
              support tickets, and ad platforms — then synthesizes it into
              something actionable, just like a human would.
            </p>
          </div>

          <div className={classes.pillar}>
            <div className={classes.pillarNumber}>03</div>
            <h3 className={classes.pillarTitle}>
              A teammate, not a tool
            </h3>
            <p className={classes.pillarDesc}>
              Tools require instructions. Teammates understand context. Cooper
              remembers your processes, learns your preferences, and gets better
              the more you work together. It doesn&apos;t just execute tasks —
              it understands why they matter.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
