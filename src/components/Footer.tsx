import { Container } from "@mantine/core";
import classes from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={classes.footer}>
      <Container size="lg">
        <div className={classes.bottom}>
          <div className={classes.logo}>
            <div className={classes.logoIcon}>C</div>
            Cooper
          </div>
          <span>&copy; {new Date().getFullYear()} Cooper. All rights reserved.</span>
        </div>
      </Container>
    </footer>
  );
}
