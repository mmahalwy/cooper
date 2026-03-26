import { Container } from "@mantine/core";
import classes from "./HowItWorks.module.css";

const steps = [
  {
    number: 1,
    title: "Connect",
    time: "2 minutes",
    description:
      "Add Cooper to Slack or Teams. Connect the tools your team already uses — CRM, analytics, code repos, docs, and more.",
  },
  {
    number: 2,
    title: "Ask",
    time: "Natural language",
    description:
      "Just @cooper with what you need. Describe the outcome in plain English — no prompt engineering, no special syntax.",
  },
  {
    number: 3,
    title: "Cooper Delivers",
    time: "End-to-end",
    description:
      "Cooper queries your tools, analyzes data, builds deliverables, and posts results. Then suggests automating it for next time.",
  },
];

export function HowItWorks() {
  return (
    <section className={classes.section}>
      <Container size="lg">
        <div className={classes.label}>How It Works</div>
        <h2 className={classes.title}>Up and running in minutes</h2>

        <div className={classes.steps}>
          {steps.map((step, i) => (
            <div className={classes.step} key={step.number}>
              <div className={classes.stepNumber}>{step.number}</div>
              <div className={classes.stepTime}>{step.time}</div>
              <div className={classes.stepTitle}>{step.title}</div>
              <div className={classes.stepDesc}>{step.description}</div>
              {i < steps.length - 1 && <div className={classes.connector} />}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
