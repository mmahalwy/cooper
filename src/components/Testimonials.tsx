import { Container } from "@mantine/core";
import classes from "./Testimonials.module.css";

const testimonials = [
  {
    quote:
      "Cooper replaced three manual workflows for our marketing team in the first week. It actually does the work — not just tells you how.",
    name: "Sarah Chen",
    role: "VP Marketing, ScaleUp",
    color: "linear-gradient(135deg, #0969ff, #3b82f6)",
  },
  {
    quote:
      "We gave Cooper access to our analytics stack and it started delivering daily reports we used to spend 2 hours building manually.",
    name: "Marcus Johnson",
    role: "CTO, BuildFast",
    color: "linear-gradient(135deg, #22c55e, #16a34a)",
  },
  {
    quote:
      "The memory feature is what sets it apart. Cooper remembers our processes, our preferences, our context. It actually gets better over time.",
    name: "Priya Patel",
    role: "Head of Ops, Quantum",
    color: "linear-gradient(135deg, #7c3aed, #6366f1)",
  },
  {
    quote:
      "I was skeptical about another AI tool, but Cooper opened its first PR within 30 minutes of connecting our GitHub. It just works.",
    name: "David Kim",
    role: "Engineering Lead, Versa",
    color: "linear-gradient(135deg, #f59e0b, #d97706)",
  },
  {
    quote:
      "Our board deck used to take 3 days to assemble. Cooper pulls live data from 6 tools and builds it in under a minute.",
    name: "Elena Rodriguez",
    role: "CEO, NorthStar",
    color: "linear-gradient(135deg, #ec4899, #db2777)",
  },
  {
    quote:
      "Cooper is the first AI product that actually reduced our headcount needs. It's not an assistant — it's a legitimate team member.",
    name: "James O'Brien",
    role: "COO, Apex Systems",
    color: "linear-gradient(135deg, #06b6d4, #0891b2)",
  },
];

export function Testimonials() {
  return (
    <section className={classes.section}>
      <Container size="lg">
        <div className={classes.label}>Testimonials</div>
        <h2 className={classes.title}>Teams that hired Cooper</h2>

        <div className={classes.grid}>
          {testimonials.map((t) => (
            <div className={classes.card} key={t.name}>
              <div className={classes.quote}>&ldquo;{t.quote}&rdquo;</div>
              <div className={classes.author}>
                <div
                  className={classes.authorAvatar}
                  style={{ background: t.color }}
                >
                  {t.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className={classes.authorInfo}>
                  <span className={classes.authorName}>{t.name}</span>
                  <span className={classes.authorRole}>{t.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
