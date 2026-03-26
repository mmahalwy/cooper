"use client";

import { Container, Button } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import classes from "./Hero.module.css";

export function Hero() {
  return (
    <section className={classes.hero}>
      <Container size="md">
        <div className={classes.badge}>
          <span className={classes.badgeDot} />
          Coming Soon
        </div>

        <h1 className={classes.title}>
          Not a chatbot.
          <br />
          <span className={classes.gradient}>An AI Teammate.</span>
        </h1>

        <p className={classes.subtitle}>
          Cooper is an AI that connects to your tools, learns your workflows,
          and does the actual work — like having another person on the team.
        </p>

        <div className={classes.platforms}>
          Works in <span className={classes.platformHighlight}>Slack</span>,
          on the <span className={classes.platformHighlight}>web</span>, or
          wherever your team operates.
        </div>

        <div className={classes.ctas}>
          <Button
            size="md"
            variant="white"
            color="dark"
            rightSection={<IconArrowRight size={16} />}
            component="a"
            href="#waitlist"
            styles={{
              root: {
                fontWeight: 500,
                fontSize: "0.875rem",
              },
            }}
          >
            Join the Waitlist
          </Button>
        </div>

        <div className={classes.social}>
          <span>Be first to know when Cooper launches.</span>
        </div>

        <div className={classes.demoWindow}>
          <div className={classes.windowBar}>
            <div className={classes.dot} />
            <div className={classes.dot} />
            <div className={classes.dot} />
          </div>
          <div className={classes.windowContent}>
            <div className={classes.prompt}>
              @cooper pull this week&apos;s campaign performance from Meta and
              Google Ads, compare against last week, and post a summary to
              #marketing
            </div>
            <div className={classes.response}>
              <span className={classes.highlight}>cooper</span> &mdash; Pulling
              data from Meta Ads and Google Ads...
              <br />
              <span className={classes.highlight}>cooper</span> &mdash; Analysis
              complete. Meta CPA down 12%, Google ROAS up 8%.
              <br />
              <span className={classes.highlight}>cooper</span> &mdash; Posted
              to #marketing. Want me to run this weekly?
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
