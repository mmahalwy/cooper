import { XIcon, CheckIcon } from "lucide-react";
import classes from "./TheShift.module.css";

const oldWay = [
  "ChatGPT drafts a plan — you still execute it manually",
  "Copilot suggests code — you still review, test, deploy",
  "AI writes copy — you still format, schedule, publish",
  "You ask questions — you get answers, not outcomes",
];

const newWay = [
  "Cooper pulls live data from your tools and delivers a finished report",
  "Cooper writes the code, opens the PR, and follows up on reviews",
  "Cooper creates the content, formats it, and publishes to your CMS",
  "You describe the outcome — Cooper handles every step",
];

export function TheShift() {
  return (
    <section className={classes.section} id="product">
      <div className={classes.container}>
        <div className={classes.label}>The Shift</div>
        <h2 className={classes.title}>
          AI that gives advice vs. AI that does the work
        </h2>
        <p className={classes.subtitle}>
          Most AI tools generate text. Cooper generates outcomes. It pulls data
          from across your stack, connects the dots, and delivers real
          results — without waiting to be asked.
        </p>

        <div className={classes.comparison}>
          <div className={`${classes.card} ${classes.oldWay}`}>
            <div className={`${classes.cardLabel} ${classes.oldLabel}`}>
              Other AI Tools
            </div>
            {oldWay.map((item) => (
              <div className={classes.item} key={item}>
                <XIcon
                  size={18}
                  className={`${classes.itemIcon} ${classes.oldIcon}`}
                />
                <span className={classes.itemText}>{item}</span>
              </div>
            ))}
          </div>

          <div className={`${classes.card} ${classes.newWay}`}>
            <div className={`${classes.cardLabel} ${classes.newLabel}`}>
              Cooper
            </div>
            {newWay.map((item) => (
              <div className={classes.item} key={item}>
                <CheckIcon
                  size={18}
                  className={`${classes.itemIcon} ${classes.newIcon}`}
                />
                <span className={classes.itemText}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
